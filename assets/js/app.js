/**
 * Main Application Orchestrator
 */
document.addEventListener('DOMContentLoaded', () => {
  // State
  let github = null;
  let currentUser = null;
  let selectedRepo = null; // { owner, name, defaultBranch }
  let stagedFiles = []; // [{ path, base64, size }]
  let isCustomBranch = false;

  // DOM Elements
  const tokenInput = document.getElementById('gh-token');
  const toggleTokenBtn = document.getElementById('toggle-token-visibility');
  const connectBtn = document.getElementById('btn-connect');
  const disconnectBtn = document.getElementById('btn-disconnect');
  const authStatusHeader = document.getElementById('auth-status-header');
  const authStatusText = document.getElementById('auth-status-text');

  const repoCard = document.getElementById('repo-card');
  const repoSearch = document.getElementById('repo-search');
  const repoSelect = document.getElementById('repo-select');
  const manualRepoInput = document.getElementById('manual-repo');
  const btnLoadManualRepo = document.getElementById('btn-load-manual-repo');
  const branchSelect = document.getElementById('branch-select');
  const manualBranchInput = document.getElementById('manual-branch');
  const btnToggleCustomBranch = document.getElementById('btn-toggle-custom-branch');

  const commitCard = document.getElementById('commit-card');
  const commitMessageInput = document.getElementById('commit-message');
  const targetPathInput = document.getElementById('target-path');

  const dropzone = document.getElementById('dropzone');
  const inputZip = document.getElementById('input-zip');
  const inputFolder = document.getElementById('input-folder');
  const inputFiles = document.getElementById('input-files');
  const fileCountBadge = document.getElementById('file-count-badge');
  const filePreviewArea = document.getElementById('file-preview-area');
  const fileTreeContainer = document.getElementById('file-tree-container');
  const totalSizeLabel = document.getElementById('total-size-label');
  const btnClearFiles = document.getElementById('btn-clear-files');
  const btnPush = document.getElementById('btn-push');

  const progressCard = document.getElementById('progress-card');
  const progressStageTitle = document.getElementById('progress-stage-title');
  const progressPercentage = document.getElementById('progress-percentage');
  const progressBar = document.getElementById('progress-bar');
  const progressCount = document.getElementById('progress-count');
  const progressSpeed = document.getElementById('progress-speed');
  const uploadLogs = document.getElementById('upload-logs');

  const resultBox = document.getElementById('result-box');
  const btnViewRepo = document.getElementById('btn-view-repo');
  const btnViewCommit = document.getElementById('btn-view-commit');
  const globalAlert = document.getElementById('global-alert');

  // Load token from temporary sessionStorage if present
  const savedToken = sessionStorage.getItem('gh_pusher_token');
  if (savedToken) {
    tokenInput.value = savedToken;
    connectGitHub(savedToken);
  }

  // Token visibility toggle
  toggleTokenBtn.addEventListener('click', () => {
    tokenInput.type = tokenInput.type === 'password' ? 'text' : 'password';
  });

  // Connect Button
  connectBtn.addEventListener('click', () => {
    const token = tokenInput.value.trim();
    if (!token) {
      showAlert('Please enter a valid GitHub Personal Access Token.', 'error');
      return;
    }
    connectGitHub(token);
  });

  // Disconnect Button
  disconnectBtn.addEventListener('click', () => {
    disconnectGitHub();
  });

  async function connectGitHub(token) {
    hideAlert();
    connectBtn.disabled = true;
    connectBtn.innerText = 'Connecting...';

    try {
      github = new GitHubAPI(token);
      currentUser = await github.getAuthenticatedUser();

      sessionStorage.setItem('gh_pusher_token', token);

      authStatusHeader.className = 'auth-pill connected';
      authStatusText.innerText = `@${currentUser.login}`;
      connectBtn.classList.add('hidden');
      disconnectBtn.classList.remove('hidden');

      repoCard.classList.remove('disabled-card');
      commitCard.classList.remove('disabled-card');

      showAlert(`Connected as ${currentUser.name || currentUser.login} (@${currentUser.login})`, 'success');
      await loadRepositories();
    } catch (err) {
      disconnectGitHub();
      showAlert(err.message, 'error');
    } finally {
      connectBtn.disabled = false;
      connectBtn.innerText = 'Connect GitHub';
      checkPushReadiness();
    }
  }

  function disconnectGitHub() {
    github = null;
    currentUser = null;
    selectedRepo = null;
    sessionStorage.removeItem('gh_pusher_token');
    tokenInput.value = '';

    authStatusHeader.className = 'auth-pill not-connected';
    authStatusText.innerText = 'Disconnected';
    connectBtn.classList.remove('hidden');
    disconnectBtn.classList.add('hidden');

    repoCard.classList.add('disabled-card');
    commitCard.classList.add('disabled-card');
    repoSelect.innerHTML = '';
    branchSelect.innerHTML = '';
    checkPushReadiness();
  }

  async function loadRepositories() {
    try {
      repoSelect.innerHTML = '<option value="">Loading repositories...</option>';
      const repos = await github.getUserRepositories();
      repoSelect.innerHTML = '';

      if (repos.length === 0) {
        repoSelect.innerHTML = '<option value="">No repositories found</option>';
        return;
      }

      window._cachedRepos = repos;
      renderRepoOptions(repos);
    } catch (err) {
      showAlert(`Error loading repositories: ${err.message}`, 'error');
    }
  }

  function renderRepoOptions(repos) {
    repoSelect.innerHTML = '';
    repos.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.full_name;
      opt.textContent = `${r.full_name} (${r.private ? 'Private' : 'Public'}) [${r.default_branch}]`;
      opt.dataset.defaultBranch = r.default_branch;
      opt.dataset.owner = r.owner.login;
      opt.dataset.name = r.name;
      repoSelect.appendChild(opt);
    });

    if (repos.length > 0) {
      repoSelect.selectedIndex = 0;
      onRepoSelected();
    }
  }

  // Filter repositories
  repoSearch.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    if (!window._cachedRepos) return;
    const filtered = window._cachedRepos.filter(r => r.full_name.toLowerCase().includes(query));
    renderRepoOptions(filtered);
  });

  repoSelect.addEventListener('change', onRepoSelected);

  async function onRepoSelected() {
    const selectedOption = repoSelect.options[repoSelect.selectedIndex];
    if (!selectedOption || !selectedOption.value) return;

    selectedRepo = {
      fullName: selectedOption.value,
      owner: selectedOption.dataset.owner,
      name: selectedOption.dataset.name,
      defaultBranch: selectedOption.dataset.defaultBranch
    };

    await loadBranches(selectedRepo.owner, selectedRepo.name, selectedRepo.defaultBranch);
    checkPushReadiness();
  }

  btnLoadManualRepo.addEventListener('click', async () => {
    const raw = manualRepoInput.value.trim();
    if (!raw.includes('/')) {
      showAlert('Manual repository format must be "owner/repository-name"', 'error');
      return;
    }
    const [owner, name] = raw.split('/');
    try {
      const repo = await github.getRepository(owner, name);
      selectedRepo = {
        fullName: repo.full_name,
        owner: repo.owner.login,
        name: repo.name,
        defaultBranch: repo.default_branch
      };
      await loadBranches(selectedRepo.owner, selectedRepo.name, selectedRepo.defaultBranch);
      showAlert(`Loaded repository: ${repo.full_name}`, 'success');
      checkPushReadiness();
    } catch (err) {
      showAlert(`Cannot load repo: ${err.message}`, 'error');
    }
  });

  async function loadBranches(owner, repo, defaultBranch) {
    try {
      branchSelect.innerHTML = '<option value="">Loading branches...</option>';
      const branches = await github.getBranches(owner, repo);
      branchSelect.innerHTML = '';

      if (branches.length === 0) {
        const defaultOpt = document.createElement('option');
        defaultOpt.value = defaultBranch || 'main';
        defaultOpt.textContent = `${defaultBranch || 'main'} (New/Empty)`;
        branchSelect.appendChild(defaultOpt);
        return;
      }

      branches.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.name;
        opt.textContent = b.name === defaultBranch ? `${b.name} (Default)` : b.name;
        branchSelect.appendChild(opt);
      });

      // Select default branch
      if (defaultBranch) {
        branchSelect.value = defaultBranch;
      }
    } catch (err) {
      showAlert(`Could not fetch branches: ${err.message}`, 'error');
    }
  }

  // Toggle Custom Branch
  btnToggleCustomBranch.addEventListener('click', () => {
    isCustomBranch = !isCustomBranch;
    if (isCustomBranch) {
      branchSelect.classList.add('hidden');
      manualBranchInput.classList.remove('hidden');
      btnToggleCustomBranch.textContent = 'List';
    } else {
      branchSelect.classList.remove('hidden');
      manualBranchInput.classList.add('hidden');
      btnToggleCustomBranch.textContent = 'Custom';
    }
    checkPushReadiness();
  });

  // Drag and drop handlers
  ['dragenter', 'dragover'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', async (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleIncomingFiles(files);
    }
  });

  inputZip.addEventListener('change', (e) => handleIncomingFiles(e.target.files));
  inputFolder.addEventListener('change', (e) => handleIncomingFiles(e.target.files));
  inputFiles.addEventListener('change', (e) => handleIncomingFiles(e.target.files));

  async function handleIncomingFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    hideAlert();
    resultBox.classList.add('hidden');

    try {
      const firstFile = fileList[0];
      if (fileList.length === 1 && (firstFile.name.endsWith('.zip') || firstFile.type.includes('zip'))) {
        // Handle ZIP extraction
        showUploadProgress('Extracting ZIP archive...', 0, 100);
        stagedFiles = await ZipHandler.extractZip(firstFile, (curr, total) => {
          showUploadProgress(`Extracting ZIP archive... (${curr}/${total})`, curr, total);
        });
      } else {
        // Handle folder or multiple files
        showUploadProgress('Reading project files...', 0, fileList.length);
        stagedFiles = await ZipHandler.extractFiles(fileList, (curr, total) => {
          showUploadProgress(`Reading project files... (${curr}/${total})`, curr, total);
        });
      }

      hideUploadProgress();
      renderFileTree(stagedFiles);
    } catch (err) {
      hideUploadProgress();
      showAlert(`Error processing files: ${err.message}`, 'error');
    } finally {
      checkPushReadiness();
      // Reset inputs so user can select same file again if desired
      inputZip.value = '';
      inputFolder.value = '';
      inputFiles.value = '';
    }
  }

  function renderFileTree(files) {
    fileTreeContainer.innerHTML = '';
    if (files.length === 0) {
      filePreviewArea.classList.add('hidden');
      fileCountBadge.textContent = '0 Files';
      return;
    }

    filePreviewArea.classList.remove('hidden');
    fileCountBadge.textContent = `${files.length} File${files.length > 1 ? 's' : ''}`;

    let totalBytes = 0;
    files.forEach(f => {
      totalBytes += f.size;
      const item = document.createElement('div');
      item.className = 'tree-item';
      item.innerHTML = `
        <span class="tree-path">📄 ${escapeHtml(f.path)}</span>
        <span class="tree-size">${ZipHandler.formatBytes(f.size)}</span>
      `;
      fileTreeContainer.appendChild(item);
    });

    totalSizeLabel.textContent = ZipHandler.formatBytes(totalBytes);
  }

  btnClearFiles.addEventListener('click', () => {
    stagedFiles = [];
    renderFileTree([]);
    checkPushReadiness();
  });

  function checkPushReadiness() {
    const hasAuth = !!github && !!currentUser;
    const hasRepo = !!selectedRepo;
    const hasFiles = stagedFiles.length > 0;
    btnPush.disabled = !(hasAuth && hasRepo && hasFiles);
  }

  // Push to GitHub workflow
  btnPush.addEventListener('click', async () => {
    if (!github || !selectedRepo || stagedFiles.length === 0) return;

    const branch = isCustomBranch ? manualBranchInput.value.trim() : branchSelect.value.trim();
    if (!branch) {
      showAlert('Please select or specify a target branch.', 'error');
      return;
    }

    const commitMessage = commitMessageInput.value.trim() || 'Upload project via GitHub Project Pusher';
    const subpath = targetPathInput.value.trim().replace(/^\/+|\/+$/g, '');

    btnPush.disabled = true;
    resultBox.classList.add('hidden');
    uploadLogs.innerHTML = '';
    progressCard.classList.remove('hidden');

    try {
      addLog(`🚀 Starting push to ${selectedRepo.fullName} on branch [${branch}]...`, 'info');

      // 1. Fetch current commit SHA of the branch (if branch exists)
      addLog('Resolving target branch ref...', 'info');
      const branchRef = await github.getBranchRef(selectedRepo.owner, selectedRepo.name, branch);
      
      let baseCommitSha = null;
      let baseTreeSha = null;

      if (branchRef && branchRef.object) {
        baseCommitSha = branchRef.object.sha;
        // Fetch base commit to get base tree
        const baseCommit = await github.request(`/repos/${selectedRepo.owner}/${selectedRepo.name}/git/commits/${baseCommitSha}`);
        baseTreeSha = baseCommit.tree.sha;
        addLog(`Base branch head resolved: ${baseCommitSha.substring(0, 7)}`, 'info');
      } else {
        addLog(`Branch [${branch}] does not exist yet. It will be initialized as a new branch.`, 'info');
      }

      // 2. Upload Blobs (in batches of 5 concurrent requests)
      const totalFiles = stagedFiles.length;
      const treeItems = [];
      const concurrency = 5;

      showUploadProgress('Uploading files as Git Blobs...', 0, totalFiles);

      for (let i = 0; i < totalFiles; i += concurrency) {
        const chunk = stagedFiles.slice(i, i + concurrency);
        await Promise.all(chunk.map(async (file, idx) => {
          const currentIndex = i + idx + 1;
          try {
            // Check file size warning for GitHub API (blobs over 100MB fail)
            if (file.size > 100 * 1024 * 1024) {
              throw new Error(`File ${file.path} exceeds GitHub API 100MB limit.`);
            }

            const blob = await github.createBlob(selectedRepo.owner, selectedRepo.name, file.base64);
            const fullPath = subpath ? `${subpath}/${file.path}` : file.path;

            treeItems.push({
              path: fullPath,
              mode: '100644', // standard file mode
              type: 'blob',
              sha: blob.sha
            });

            addLog(`✔ Uploaded blob: ${file.path}`, 'success');
            showUploadProgress(`Uploading Git Blobs... (${currentIndex}/${totalFiles})`, currentIndex, totalFiles);
          } catch (fileErr) {
            addLog(`✖ Failed ${file.path}: ${fileErr.message}`, 'error');
            throw fileErr;
          }
        }));
      }

      // 3. Create Tree
      showUploadProgress('Building Git Tree...', totalFiles, totalFiles);
      addLog('Constructing Git Tree with uploaded blobs...', 'info');
      const newTree = await github.createTree(selectedRepo.owner, selectedRepo.name, treeItems, baseTreeSha);
      addLog(`Git Tree created: ${newTree.sha.substring(0, 7)}`, 'success');

      // 4. Create Commit
      showUploadProgress('Creating Git Commit...', totalFiles, totalFiles);
      addLog('Creating atomic Git Commit...', 'info');
      const parents = baseCommitSha ? [baseCommitSha] : [];
      const newCommit = await github.createCommit(selectedRepo.owner, selectedRepo.name, commitMessage, newTree.sha, parents);
      addLog(`Commit created: ${newCommit.sha.substring(0, 7)}`, 'success');

      // 5. Update Branch Ref
      showUploadProgress('Updating branch pointer...', totalFiles, totalFiles);
      if (baseCommitSha) {
        await github.updateBranchRef(selectedRepo.owner, selectedRepo.name, branch, newCommit.sha);
      } else {
        await github.createInitialBranch(selectedRepo.owner, selectedRepo.name, branch, newCommit.sha);
      }

      // Success
      showUploadProgress('Complete!', totalFiles, totalFiles);
      addLog(`🎉 Branch [${branch}] successfully pointed to commit ${newCommit.sha.substring(0, 7)}`, 'success');

      resultBox.classList.remove('hidden');
      btnViewRepo.href = `https://github.com/${selectedRepo.fullName}/tree/${branch}${subpath ? '/' + subpath : ''}`;
      btnViewCommit.href = `https://github.com/${selectedRepo.fullName}/commit/${newCommit.sha}`;
      showAlert('Project pushed to GitHub successfully!', 'success');

    } catch (err) {
      showAlert(`Push Failed: ${err.message}`, 'error');
      addLog(`🚨 Push halted with error: ${err.message}`, 'error');
    } finally {
      btnPush.disabled = false;
    }
  });

  // UI Helpers
  function showUploadProgress(title, current, total) {
    progressStageTitle.textContent = title;
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    progressPercentage.textContent = `${percent}%`;
    progressBar.style.width = `${percent}%`;
    progressCount.textContent = `Files: ${current} / ${total}`;
  }

  function hideUploadProgress() {
    progressCard.classList.add('hidden');
  }

  function addLog(msg, type = 'info') {
    const line = document.createElement('div');
    line.className = `log-item ${type}`;
    line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    uploadLogs.appendChild(line);
    uploadLogs.scrollTop = uploadLogs.scrollHeight;
  }

  function showAlert(message, type = 'error') {
    globalAlert.className = `alert alert-${type}`;
    globalAlert.textContent = message;
    globalAlert.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function hideAlert() {
    globalAlert.classList.add('hidden');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});