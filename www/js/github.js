/**
 * github.js - GitHub REST client + push engine.
 * Every file is uploaded one by one as a Git blob, then all blobs are
 * committed together in a single commit (no per-file merge conflicts).
 */
(function (root) {
  'use strict';

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function bytesToBase64(u8) {
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < u8.length; i += CH) {
      bin += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    }
    return btoa(bin);
  }

  async function gitBlobSha(u8) {
    if (!root.crypto || !root.crypto.subtle) return null;
    const header = new TextEncoder().encode('blob ' + u8.length + '\0');
    const buf = new Uint8Array(header.length + u8.length);
    buf.set(header, 0);
    buf.set(u8, header.length);
    const digest = new Uint8Array(await root.crypto.subtle.digest('SHA-1', buf));
    let hex = '';
    for (let i = 0; i < digest.length; i++) hex += digest[i].toString(16).padStart(2, '0');
    return hex;
  }

  class GitHub {
    constructor(token, fetchImpl) {
      this.token = token;
      this.base = 'https://api.github.com';
      this.fetch = fetchImpl || ((...a) => root.fetch(...a));
    }

    async request(path, opts) {
      opts = opts || {};
      const url = path.startsWith('http') ? path : this.base + path;
      const headers = Object.assign({
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer ' + this.token,
        'X-GitHub-Api-Version': '2022-11-28'
      }, opts.body ? { 'Content-Type': 'application/json' } : {}, opts.headers || {});

      let lastErr;
      for (let attempt = 1; attempt <= 4; attempt++) {
        let res;
        try {
          res = await this.fetch(url, Object.assign({}, opts, { headers }));
        } catch (netErr) {
          lastErr = new Error('Internet / network error: ' + netErr.message);
          await sleep(800 * attempt);
          continue;
        }

        if (res.ok) {
          if (res.status === 204) return null;
          return await res.json();
        }

        let body = null;
        try { body = await res.json(); } catch (_) { /* no json */ }
        const msg = (body && body.message) ? body.message : ('HTTP ' + res.status);
        const err = new Error(msg);
        err.status = res.status;

        const retryAfter = parseInt(res.headers && res.headers.get ? (res.headers.get('retry-after') || '0') : '0', 10);
        const secondary = res.status === 403 && /secondary rate|abuse/i.test(msg);
        if ((res.status >= 500 || secondary || res.status === 429) && attempt < 4) {
          await sleep(retryAfter ? retryAfter * 1000 : 1500 * attempt);
          lastErr = err;
          continue;
        }
        if (res.status === 401) err.message = 'Token galat ya expire ho gaya hai (401).';
        else if (res.status === 403) err.message = 'Permission nahi mili (403): ' + msg + ' - token mein repo/Contents write permission do.';
        throw err;
      }
      throw lastErr || new Error('Request fail ho gayi.');
    }

    user() { return this.request('/user'); }

    async repos() {
      let all = [];
      for (let page = 1; page <= 10; page++) {
        const part = await this.request('/user/repos?per_page=100&page=' + page + '&sort=updated&affiliation=owner,collaborator,organization_member');
        all = all.concat(part);
        if (part.length < 100) break;
      }
      return all;
    }

    repo(owner, name) { return this.request('/repos/' + owner + '/' + name); }

    createRepo(name, isPrivate, description) {
      return this.request('/user/repos', {
        method: 'POST',
        body: JSON.stringify({ name, private: !!isPrivate, description: description || '', auto_init: true })
      });
    }

    branches(owner, name) { return this.request('/repos/' + owner + '/' + name + '/branches?per_page=100'); }

    async getRef(owner, name, branch) {
      try {
        return await this.request('/repos/' + owner + '/' + name + '/git/ref/heads/' + branch.split('/').map(encodeURIComponent).join('/'));
      } catch (e) {
        if (e.status === 404 || e.status === 409) return null;
        throw e;
      }
    }

    getCommit(owner, name, sha) { return this.request('/repos/' + owner + '/' + name + '/git/commits/' + sha); }

    async getTree(owner, name, sha) {
      const data = await this.request('/repos/' + owner + '/' + name + '/git/trees/' + sha + '?recursive=1');
      return data.tree || [];
    }

    createBlob(owner, name, base64) {
      return this.request('/repos/' + owner + '/' + name + '/git/blobs', {
        method: 'POST', body: JSON.stringify({ content: base64, encoding: 'base64' })
      });
    }

    createTree(owner, name, items, baseTree) {
      const payload = { tree: items };
      if (baseTree) payload.base_tree = baseTree;
      return this.request('/repos/' + owner + '/' + name + '/git/trees', { method: 'POST', body: JSON.stringify(payload) });
    }

    createCommit(owner, name, message, tree, parents) {
      return this.request('/repos/' + owner + '/' + name + '/git/commits', {
        method: 'POST', body: JSON.stringify({ message, tree, parents })
      });
    }

    createRef(owner, name, branch, sha) {
      return this.request('/repos/' + owner + '/' + name + '/git/refs', {
        method: 'POST', body: JSON.stringify({ ref: 'refs/heads/' + branch, sha })
      });
    }

    updateRef(owner, name, branch, sha) {
      return this.request('/repos/' + owner + '/' + name + '/git/refs/heads/' + branch.split('/').map(encodeURIComponent).join('/'), {
        method: 'PATCH', body: JSON.stringify({ sha, force: false })
      });
    }

    putContent(owner, name, path, base64, message, branch) {
      const body = { message, content: base64 };
      if (branch) body.branch = branch;
      return this.request('/repos/' + owner + '/' + name + '/contents/' + path.split('/').map(encodeURIComponent).join('/'), {
        method: 'PUT', body: JSON.stringify(body)
      });
    }
  }

  /**
   * push({ gh, owner, repo, branch, files:[{path,data}], message, log, progress })
   * Returns { commitSha, branch, uploaded, skipped }
   */
  async function push(opts) {
    const { gh, owner, repo, files, message } = opts;
    const log = opts.log || function () {};
    const progress = opts.progress || function () {};
    let branch = opts.branch;
    if (!files.length) throw new Error('Koi file select nahi hui.');

    const info = await gh.repo(owner, repo);
    const defaultBranch = info.default_branch || 'main';
    if (!branch) branch = defaultBranch;

    log('Repo: ' + owner + '/' + repo + ' | branch: ' + branch, 'info');

    let todo = files.slice();
    let baseCommit = null;
    let baseTree = null;
    let createNewBranch = false;
    let remoteMap = new Map();

    let ref = await gh.getRef(owner, repo, branch);
    if (ref) {
      baseCommit = ref.object.sha;
    } else {
      const existing = await gh.branches(owner, repo);
      if (existing.length === 0) {
        // Brand-new EMPTY repo: Git Data API cannot work until one commit exists.
        // Create the first commit through the Contents API with the first file.
        const first = todo.shift();
        log('Repo bilkul khali hai - pehla commit pehli file se bana raha hu: ' + first.path, 'info');
        await gh.putContent(owner, repo, first.path, bytesToBase64(first.data), message, null);
        branch = defaultBranch;
        ref = await gh.getRef(owner, repo, branch);
        if (!ref) throw new Error('Pehla commit ban gaya lekin branch nahi mili. Dobara try karo.');
        baseCommit = ref.object.sha;
        log('Pehli file uploaded: ' + first.path, 'success');
        if (todo.length === 0) {
          return { commitSha: baseCommit, branch, uploaded: 1, skipped: 0 };
        }
      } else {
        const dref = await gh.getRef(owner, repo, defaultBranch) || { object: { sha: existing[0].commit.sha } };
        baseCommit = dref.object.sha;
        createNewBranch = true;
        log('Branch "' + branch + '" nahi hai - "' + defaultBranch + '" se nayi branch banegi.', 'info');
      }
    }

    const commitObj = await gh.getCommit(owner, repo, baseCommit);
    baseTree = commitObj.tree.sha;

    // Skip files that are already identical on GitHub
    let skipped = 0;
    try {
      const tree = await gh.getTree(owner, repo, baseTree);
      tree.forEach(t => { if (t.type === 'blob') remoteMap.set(t.path, t.sha); });
    } catch (_) { remoteMap = new Map(); }

    if (remoteMap.size) {
      const changed = [];
      for (const f of todo) {
        const sha = await gitBlobSha(f.data);
        if (sha && remoteMap.get(f.path) === sha) { skipped++; } else { changed.push(f); }
      }
      todo = changed;
      if (skipped) log(skipped + ' file pehle se GitHub par same hain - skip kar di.', 'info');
    }

    if (todo.length === 0) {
      log('Koi nayi ya badli hui file nahi hai. Kuch push karne ki zaroorat nahi.', 'info');
      return { commitSha: baseCommit, branch, uploaded: 0, skipped, nothing: true };
    }

    // Upload every file as its own blob (3 at a time, with retries inside request())
    const total = todo.length;
    const treeItems = new Array(total);
    let done = 0;
    let cursor = 0;
    let failure = null;

    async function worker() {
      while (cursor < total && !failure) {
        const i = cursor++;
        const f = todo[i];
        try {
          if (f.data.length > 95 * 1024 * 1024) throw new Error('File 95MB se badi hai (GitHub limit): ' + f.path);
          const blob = await gh.createBlob(owner, repo, bytesToBase64(f.data));
          treeItems[i] = { path: f.path, mode: '100644', type: 'blob', sha: blob.sha };
          done++;
          progress(done, total, f.path);
          log('Uploaded (' + done + '/' + total + '): ' + f.path, 'success');
        } catch (e) {
          failure = new Error(f.path + ': ' + e.message);
        }
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    if (failure) throw failure;

    // Build tree in chunks so very large projects do not hit request limits
    let treeSha = baseTree;
    const CHUNK = 100;
    for (let i = 0; i < treeItems.length; i += CHUNK) {
      const t = await gh.createTree(owner, repo, treeItems.slice(i, i + CHUNK), treeSha);
      treeSha = t.sha;
    }

    const commit = await gh.createCommit(owner, repo, message, treeSha, [baseCommit]);
    if (createNewBranch) await gh.createRef(owner, repo, branch, commit.sha);
    else await gh.updateRef(owner, repo, branch, commit.sha);

    log('Commit ban gaya: ' + commit.sha.substring(0, 7), 'success');
    return { commitSha: commit.sha, branch, uploaded: total, skipped };
  }

  const api = { GitHub, push, bytesToBase64, gitBlobSha };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GitPusher = api;
})(typeof window !== 'undefined' ? window : globalThis);
