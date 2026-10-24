/**
 * app.js - UI controller for GitForge Pusher.
 * Flow: connect token -> pick repo/branch -> pick ZIP or files (ZIP is ALWAYS
 * extracted, detected by magic bytes) -> review files -> push file by file.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const TOKEN_KEY = 'gitforge_token';

  const state = {
    gh: null,
    user: null,
    repos: [],
    repo: null,          // { owner, name, fullName, defaultBranch }
    customBranch: false,
    files: [],           // [{ path, data, size, selected, secret }]
    rootName: ''
  };

  // ---------------- helpers ----------------
  let alertTimer = null;
  function showAlert(msg, type) {
    const el = $('alert');
    el.className = 'alert alert-' + (type || 'error');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(alertTimer);
    if (type === 'success' || type === 'info') alertTimer = setTimeout(() => el.classList.add('hidden'), 6000);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function hideAlert() { $('alert').classList.add('hidden'); }

  function fmtBytes(n) {
    if (!n) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
    return (n / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + u[i];
  }

  function addLog(msg, type) {
    const box = $('log');
    const d = document.createElement('div');
    d.className = type || 'info';
    d.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
    box.appendChild(d);
    box.scrollTop = box.scrollHeight;
  }

  function setBar(fillId, pctId, done, total) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    $(fillId).style.width = pct + '%';
    if (pctId) $(pctId).textContent = pct + '%';
  }

  function storageGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function storageSet(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* ignore */ } }
  function storageDel(k) { try { localStorage.removeItem(k); } catch (_) { /* ignore */ } }

  // ---------------- secret scanner ----------------
  const SECRET_NAMES = [/^\.env(\..+)?$/i, /id_rsa$/i, /id_ed25519$/i, /\.pem$/i, /\.pfx$/i, /\.p12$/i, /\.keystore$/i, /\.jks$/i, /credentials\.json$/i, /secrets?\.json$/i, /service[_-]?account.*\.json$/i, /google-services\.json$/i];
  const SECRET_CONTENT = [/AKIA[0-9A-Z]{16}/, /gh[pousr]_[A-Za-z0-9_]{36,}/, /github_pat_[A-Za-z0-9_]{50,}/, /sk_live_[0-9a-zA-Z]{24}/, /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/];

  function scanSecret(f) {
    const name = f.path.split('/').pop();
    if (SECRET_NAMES.some(r => r.test(name))) return true;
    if (f.size > 0 && f.size < 1024 * 1024) {
      const probe = f.data.subarray(0, Math.min(f.size, 2000));
      for (let i = 0; i < probe.length; i++) if (probe[i] === 0) return false; // binary
      const text = new TextDecoder('utf-8').decode(f.data);
      return SECRET_CONTENT.some(r => r.test(text));
    }
    return false;
  }

  // ---------------- connect ----------------
  async function connect(token) {
    hideAlert();
    const btn = $('btn-connect');
    btn.disabled = true; btn.textContent = 'Connecting...';
    try {
      const gh = new GitPusher.GitHub(token);
      const user = await gh.user();
      state.gh = gh; state.user = user;
      if ($('remember').checked) storageSet(TOKEN_KEY, token); else storageDel(TOKEN_KEY);

      const pill = $('user-pill');
      pill.textContent = '@' + user.login;
      pill.className = 'pill pill-on';
      btn.classList.add('hidden');
      $('btn-disconnect').classList.remove('hidden');
      $('card-repo').classList.remove('disabled');
      showAlert('Connected: @' + user.login, 'success');
      await loadRepos();
    } catch (e) {
      state.gh = null; state.user = null;
      showAlert(e.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Connect';
      updatePushState();
    }
  }

  function disconnect() {
    state.gh = null; state.user = null; state.repo = null; state.repos = [];
    storageDel(TOKEN_KEY);
    $('token').value = '';
    $('user-pill').textContent = 'Not connected';
    $('user-pill').className = 'pill pill-off';
    $('btn-connect').classList.remove('hidden');
    $('btn-disconnect').classList.add('hidden');
    $('card-repo').classList.add('disabled');
    $('repo-select').innerHTML = '';
    $('branch-select').innerHTML = '';
    updatePushState();
  }

  async function loadRepos(selectFullName) {
    const sel = $('repo-select');
    sel.innerHTML = '<option>Repos load ho rahe hain...</option>';
    try {
      state.repos = await state.gh.repos();
      renderRepos(selectFullName);
    } catch (e) {
      showAlert('Repos load nahi hue: ' + e.message, 'error');
    }
  }

  function renderRepos(selectFullName) {
    const q = $('repo-search').value.trim().toLowerCase();
    const sel = $('repo-select');
    sel.innerHTML = '';
    const list = state.repos.filter(r => !q || r.full_name.toLowerCase().includes(q));
    if (!list.length) {
      sel.innerHTML = '<option value="">Koi repo nahi mila</option>';
      state.repo = null;
      $('branch-select').innerHTML = '';
      updatePushState();
      return;
    }
    list.forEach(r => {
      const o = document.createElement('option');
      o.value = r.full_name;
      o.textContent = r.full_name + (r.private ? '  (Private)' : '  (Public)');
      sel.appendChild(o);
    });
    if (selectFullName) sel.value = selectFullName;
    onRepoChange();
  }

  async function onRepoChange() {
    const full = $('repo-select').value;
    const r = state.repos.find(x => x.full_name === full);
    if (!r) { state.repo = null; updatePushState(); return; }
    state.repo = { owner: r.owner.login, name: r.name, fullName: r.full_name, defaultBranch: r.default_branch };
    const bs = $('branch-select');
    bs.innerHTML = '<option>Branches load ho rahi hain...</option>';
    try {
      const branches = await state.gh.branches(state.repo.owner, state.repo.name);
      bs.innerHTML = '';
      if (!branches.length) {
        const o = document.createElement('option');
        o.value = state.repo.defaultBranch || 'main';
        o.textContent = (state.repo.defaultBranch || 'main') + ' (khali repo)';
        bs.appendChild(o);
      } else {
        branches.forEach(b => {
          const o = document.createElement('option');
          o.value = b.name;
          o.textContent = b.name + (b.name === state.repo.defaultBranch ? ' (default)' : '');
          bs.appendChild(o);
        });
        bs.value = state.repo.defaultBranch;
      }
    } catch (e) {
      bs.innerHTML = '<option value="' + (state.repo.defaultBranch || 'main') + '">' + (state.repo.defaultBranch || 'main') + '</option>';
    }
    updatePushState();
  }

  async function createRepo() {
    const name = $('new-repo-name').value.trim();
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(name)) return showAlert('Repo ka naam sirf letters, numbers, - _ . ho sakta hai.', 'error');
    const btn = $('btn-create-repo');
    btn.disabled = true;
    try {
      const r = await state.gh.createRepo(name, $('new-repo-private').checked, 'Created with GitForge Pusher');
      state.repos.unshift(r);
      $('repo-search').value = '';
      renderRepos(r.full_name);
      $('new-repo-name').value = '';
      showAlert('Repo ban gaya: ' + r.full_name, 'success');
    } catch (e) {
      showAlert('Repo nahi bana: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  function currentBranch() {
    return state.customBranch ? $('branch-custom').value.trim() : $('branch-select').value;
  }

  // ---------------- files ----------------
  async function handleIncoming(fileList) {
    if (!fileList || !fileList.length) return;
    hideAlert();
    $('result').classList.add('hidden');
    $('extract-progress').classList.remove('hidden');
    setBar('extract-fill', null, 0, 1);

    try {
      const incoming = [];
      let zipCount = 0;
      const items = Array.from(fileList);

      for (let n = 0; n < items.length; n++) {
        const file = items[n];
        const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());

        if (ZipReader.isZipBytes(head)) {
          zipCount++;
          $('extract-text').textContent = 'ZIP extract ho rahi hai: ' + file.name;
          const data = new Uint8Array(await file.arrayBuffer());
          const extracted = await ZipReader.extractAll(data, (done, total, path) => {
            setBar('extract-fill', null, done, total);
            $('extract-text').textContent = 'Extract: ' + done + '/' + total + '  ' + path;
          });
          extracted.forEach(f => incoming.push(f));
        } else {
          const rel = (file.webkitRelativePath || file.name).replace(/\\/g, '/').replace(/^\/+/, '');
          if (ZipReader.isIgnoredPath(rel)) continue;
          $('extract-text').textContent = 'File padh raha hu: ' + rel;
          const data = new Uint8Array(await file.arrayBuffer());
          incoming.push({ path: rel, data, size: data.length });
          setBar('extract-fill', null, n + 1, items.length);
        }
      }

      if (!incoming.length) throw new Error('Koi usable file nahi mili.');

      // merge by path (new file replaces old one with same path)
      const map = new Map(state.files.map(f => [f.path, f]));
      incoming.forEach(f => {
        f.secret = scanSecret(f);
        f.selected = !f.secret;
        map.set(f.path, f);
      });
      state.files = Array.from(map.values());

      renderFiles();
      showAlert(incoming.length + ' files tayyar hain' + (zipCount ? ' (' + zipCount + ' ZIP extract hui)' : '') + '.', 'success');
    } catch (e) {
      showAlert('File process error: ' + e.message, 'error');
    } finally {
      $('extract-progress').classList.add('hidden');
      ['pick-files', 'pick-folder'].forEach(id => { $(id).value = ''; });
      updatePushState();
    }
  }

  function computeRoot() {
    if (!state.files.length) return '';
    const first = state.files[0].path.split('/');
    if (first.length < 2) return '';
    const root = first[0];
    return state.files.every(f => f.path.split('/').length > 1 && f.path.split('/')[0] === root) ? root : '';
  }

  function finalPath(f) {
    let p = f.path;
    if (state.rootName && $('strip-root').checked) p = p.slice(state.rootName.length + 1);
    const sub = $('subdir').value.trim().replace(/^\/+|\/+$/g, '');
    return sub ? sub + '/' + p : p;
  }

  function renderFiles() {
    const area = $('files-area');
    if (!state.files.length) {
      area.classList.add('hidden');
      $('count-pill').textContent = '0 files';
      return;
    }
    area.classList.remove('hidden');
    state.rootName = computeRoot();
    $('strip-root').parentElement.classList.toggle('hidden', !state.rootName);
    $('root-name').textContent = state.rootName;
    $('secret-warning').classList.toggle('hidden', !state.files.some(f => f.secret));

    const list = $('file-list');
    list.innerHTML = '';
    const frag = document.createDocumentFragment();
    state.files.forEach((f, i) => {
      const row = document.createElement('label');
      row.className = 'file-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = f.selected; cb.dataset.i = String(i);
      const path = document.createElement('span');
      path.className = 'path';
      path.textContent = '📄 ' + f.path;
      row.appendChild(cb); row.appendChild(path);
      if (f.secret) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = 'SECRET'; row.appendChild(t); }
      const sz = document.createElement('span');
      sz.className = 'size'; sz.textContent = fmtBytes(f.size);
      row.appendChild(sz);
      frag.appendChild(row);
    });
    list.appendChild(frag);
    updateCounts();
  }

  function updateCounts() {
    const sel = state.files.filter(f => f.selected);
    $('count-pill').textContent = sel.length + '/' + state.files.length + ' files';
    $('total-size').textContent = 'Selected: ' + fmtBytes(sel.reduce((a, f) => a + f.size, 0));
    updatePushState();
  }

  function updatePushState() {
    const ok = !!state.gh && !!state.repo && state.files.some(f => f.selected) && !!currentBranch();
    $('btn-push').disabled = !ok;
  }

  // ---------------- push ----------------
  async function doPush() {
    hideAlert();
    const picked = state.files.filter(f => f.selected);
    if (!state.gh || !state.repo) return showAlert('Pehle GitHub connect karo aur repo chuno.', 'error');
    if (!picked.length) return showAlert('Koi file select nahi hai.', 'error');
    const branch = currentBranch();
    if (!branch) return showAlert('Branch ka naam likho.', 'error');
    if (!/^[A-Za-z0-9._\/-]+$/.test(branch)) return showAlert('Branch naam mein sirf letters, numbers, - _ . / allowed hain.', 'error');

    const files = picked.map(f => ({ path: finalPath(f), data: f.data }));
    const seen = new Set();
    for (const f of files) {
      if (seen.has(f.path)) return showAlert('Duplicate path: ' + f.path + ' (root folder hatane se do files same jagah aa rahi hain).', 'error');
      seen.add(f.path);
    }

    const btn = $('btn-push');
    btn.disabled = true;
    $('result').classList.add('hidden');
    $('push-progress').classList.remove('hidden');
    $('log').innerHTML = '';
    $('push-stage').textContent = 'Shuru ho raha hai...';
    $('push-count').textContent = '';
    setBar('push-fill', 'push-pct', 0, 1);

    try {
      const res = await GitPusher.push({
        gh: state.gh,
        owner: state.repo.owner,
        repo: state.repo.name,
        branch,
        files,
        message: $('commit-msg').value.trim() || 'Upload project via GitForge Pusher',
        log: addLog,
        progress: (done, total) => {
          $('push-stage').textContent = 'Files upload ho rahi hain...';
          $('push-count').textContent = 'Uploaded: ' + done + ' / ' + total;
          setBar('push-fill', 'push-pct', done, total);
        }
      });

      setBar('push-fill', 'push-pct', 1, 1);
      $('push-stage').textContent = res.nothing ? 'Koi change nahi' : 'Complete!';
      $('result-title').textContent = res.nothing
        ? 'ℹ️ Sab files pehle se GitHub par same hain'
        : '✅ ' + res.uploaded + ' files push ho gayi' + (res.skipped ? ' (' + res.skipped + ' same thi, skip)' : '');
      $('link-repo').href = 'https://github.com/' + state.repo.fullName + '/tree/' + res.branch;
      $('link-commit').href = 'https://github.com/' + state.repo.fullName + '/commit/' + res.commitSha;
      $('result').classList.remove('hidden');
      showAlert(res.nothing ? 'Koi nayi file nahi thi.' : 'GitHub par push ho gaya!', 'success');
      onRepoChange();
    } catch (e) {
      addLog('ERROR: ' + e.message, 'error');
      showAlert('Push fail: ' + e.message, 'error');
    } finally {
      updatePushState();
    }
  }

  // ---------------- wiring ----------------
  document.addEventListener('DOMContentLoaded', () => {
    $('brand-logo').addEventListener('error', () => { $('brand-logo').style.display = 'none'; });

    $('btn-eye').addEventListener('click', () => {
      const t = $('token');
      t.type = t.type === 'password' ? 'text' : 'password';
    });
    $('btn-connect').addEventListener('click', () => {
      const tok = $('token').value.trim();
      if (!tok) return showAlert('GitHub token paste karo.', 'error');
      connect(tok);
    });
    $('btn-disconnect').addEventListener('click', disconnect);

    $('repo-search').addEventListener('input', () => renderRepos());
    $('repo-select').addEventListener('change', onRepoChange);
    $('btn-create-repo').addEventListener('click', createRepo);
    $('branch-select').addEventListener('change', updatePushState);
    $('branch-custom').addEventListener('input', updatePushState);
    $('btn-branch-toggle').addEventListener('click', () => {
      state.customBranch = !state.customBranch;
      $('branch-select').classList.toggle('hidden', state.customBranch);
      $('branch-custom').classList.toggle('hidden', !state.customBranch);
      $('btn-branch-toggle').textContent = state.customBranch ? 'List' : 'Nayi';
      updatePushState();
    });

    $('pick-files').addEventListener('change', (e) => handleIncoming(e.target.files));
    $('pick-folder').addEventListener('change', (e) => handleIncoming(e.target.files));
    if (!/Android/i.test(navigator.userAgent) && 'webkitdirectory' in $('pick-folder')) $('folder-label').classList.remove('hidden');

    const dz = $('dropzone');
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files) handleIncoming(e.dataTransfer.files); });

    $('file-list').addEventListener('change', (e) => {
      const cb = e.target;
      if (cb && cb.dataset && cb.dataset.i !== undefined) {
        state.files[parseInt(cb.dataset.i, 10)].selected = cb.checked;
        updateCounts();
      }
    });
    $('btn-all').addEventListener('click', () => { state.files.forEach(f => { f.selected = true; }); renderFiles(); });
    $('btn-none').addEventListener('click', () => { state.files.forEach(f => { f.selected = false; }); renderFiles(); });
    $('btn-clear').addEventListener('click', () => { state.files = []; renderFiles(); updatePushState(); });
    $('btn-push').addEventListener('click', doPush);

    const saved = storageGet(TOKEN_KEY);
    if (saved) {
      $('token').value = saved;
      $('remember').checked = true;
      connect(saved);
    }
  });
})();
