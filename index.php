<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>GitHub Project Pusher</title>
  <link rel="stylesheet" href="assets/css/style.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <!-- JSZip for client-side archive decompression -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
</head>
<body>
  <div class="app-container">
    <!-- Header -->
    <header class="app-header">
      <div class="logo-group">
        <svg class="octicon" viewBox="0 0 16 16" width="28" height="28" fill="currentColor">
          <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"></path>
        </svg>
        <div>
          <h1>GitHub Project Pusher</h1>
          <span class="badge badge-subtle">Atomic Git Engine</span>
        </div>
      </div>
      <div id="auth-status-header" class="auth-pill not-connected">
        <span class="status-dot"></span>
        <span id="auth-status-text">Disconnected</span>
      </div>
    </header>

    <!-- Global Alert Area -->
    <div id="global-alert" class="alert hidden" role="alert"></div>

    <main class="main-grid">
      <!-- Left Column: Controls & Target -->
      <section class="config-col">
        <!-- 1. Authentication Card -->
        <div class="card" id="auth-card">
          <div class="card-header">
            <h2>1. Authentication</h2>
            <span class="step-num">Step 1</span>
          </div>
          <div class="card-body">
            <div class="form-group">
              <label for="gh-token">Personal Access Token (Classic / Fine-Grained)</label>
              <div class="input-wrapper">
                <input type="password" id="gh-token" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" autocomplete="off" spellcheck="false">
                <button type="button" id="toggle-token-visibility" class="btn-icon" title="Toggle visibility">👁</button>
              </div>
              <small class="hint">Requires <code>repo</code> scope for private or <code>public_repo</code> for public repositories.</small>
            </div>
            <div class="button-row">
              <button type="button" id="btn-connect" class="btn btn-primary">Connect GitHub</button>
              <button type="button" id="btn-disconnect" class="btn btn-secondary hidden">Disconnect</button>
            </div>
          </div>
        </div>

        <!-- 2. Target Repository Card -->
        <div class="card disabled-card" id="repo-card">
          <div class="card-header">
            <h2>2. Target Repository</h2>
            <span class="step-num">Step 2</span>
          </div>
          <div class="card-body">
            <div class="form-group">
              <label for="repo-search">Select Repository</label>
              <input type="text" id="repo-search" placeholder="Search your repositories..." autocomplete="off">
              <select id="repo-select" size="5" class="custom-select"></select>
            </div>
            <div class="form-group">
              <label for="manual-repo">Or Enter Manually (<code>owner/repository</code>)</label>
              <div class="inline-input-group">
                <input type="text" id="manual-repo" placeholder="octocat/Hello-World" autocomplete="off">
                <button type="button" id="btn-load-manual-repo" class="btn btn-secondary">Load</button>
              </div>
            </div>
            <div class="form-group">
              <label for="branch-select">Target Branch</label>
              <div class="inline-input-group">
                <select id="branch-select" class="custom-select"></select>
                <input type="text" id="manual-branch" class="hidden" placeholder="or type branch name">
                <button type="button" id="btn-toggle-custom-branch" class="btn btn-secondary btn-sm">Custom</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. Commit Information -->
        <div class="card disabled-card" id="commit-card">
          <div class="card-header">
            <h2>3. Commit Details</h2>
            <span class="step-num">Step 3</span>
          </div>
          <div class="card-body">
            <div class="form-group">
              <label for="commit-message">Commit Message</label>
              <textarea id="commit-message" rows="2" placeholder="e.g. Initial project deployment via GitHub Project Pusher">Deploy project files via GitHub Project Pusher</textarea>
            </div>
            <div class="form-group">
              <label for="target-path">Root Subdirectory (Optional)</label>
              <input type="text" id="target-path" placeholder="Leave empty for repo root or e.g. frontend/src" autocomplete="off">
            </div>
          </div>
        </div>
      </section>

      <!-- Right Column: Project Files & Upload -->
      <section class="upload-col">
        <!-- File Picker Card -->
        <div class="card" id="files-card">
          <div class="card-header">
            <h2>Source Project Files</h2>
            <span id="file-count-badge" class="badge">0 Files</span>
          </div>
          <div class="card-body">
            <!-- Dropzone -->
            <div id="dropzone" class="dropzone">
              <svg class="dropzone-icon" viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" stroke-width="1.5" fill="none">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <p class="dropzone-primary">Drag & drop <strong>.ZIP</strong>, project folder, or files here</p>
              <p class="dropzone-secondary">or tap below to choose from your device</p>
              
              <div class="file-inputs-container">
                <label class="btn btn-secondary file-label">
                  📦 Select .ZIP Archive
                  <input type="file" id="input-zip" accept=".zip,application/zip,application/x-zip-compressed">
                </label>
                <label class="btn btn-secondary file-label">
                  📁 Select Project Folder
                  <input type="file" id="input-folder" webkitdirectory directory multiple>
                </label>
                <label class="btn btn-secondary file-label">
                  📄 Select Multiple Files
                  <input type="file" id="input-files" multiple>
                </label>
              </div>
            </div>

            <!-- File Tree Display -->
            <div id="file-preview-area" class="file-preview-area hidden">
              <div class="file-preview-header">
                <h3>Extracted Project Tree</h3>
                <div class="preview-actions">
                  <span id="total-size-label" class="text-muted">0 KB</span>
                  <button type="button" id="btn-clear-files" class="btn-link">Clear</button>
                </div>
              </div>
              <div id="file-tree-container" class="file-tree-container"></div>
            </div>

            <!-- Upload Execution Area -->
            <div class="push-action-area">
              <button type="button" id="btn-push" class="btn btn-success btn-large" disabled>
                🚀 Push to GitHub
              </button>
            </div>

            <!-- Upload Progress Dashboard -->
            <div id="progress-card" class="progress-card hidden">
              <div class="progress-info">
                <span id="progress-stage-title" class="progress-title">Uploading Blobs...</span>
                <span id="progress-percentage" class="progress-percent">0%</span>
              </div>
              <div class="progress-track">
                <div id="progress-bar" class="progress-fill" style="width: 0%;"></div>
              </div>
              <div class="progress-subinfo">
                <span id="progress-count">Processed: 0 / 0</span>
                <span id="progress-speed"></span>
              </div>
              <!-- Log list for item-level feedback -->
              <div id="upload-logs" class="upload-logs"></div>
            </div>

            <!-- Result Box -->
            <div id="result-box" class="result-box hidden">
              <div class="result-icon">✅</div>
              <div class="result-content">
                <h3 id="result-title">Project Pushed Successfully!</h3>
                <p id="result-description">All changes committed to the target branch.</p>
                <div class="result-actions">
                  <a id="btn-view-repo" href="#" target="_blank" rel="noopener noreferrer" class="btn btn-primary">
                    View on GitHub ↗
                  </a>
                  <a id="btn-view-commit" href="#" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">
                    View Commit ↗
                  </a>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>
    </main>

    <footer class="app-footer">
      <p>Atomic Git Database Engine • Zero Permanent Token Storage • 100% Client/GitHub Direct TLS</p>
    </footer>
  </div>

  <script src="assets/js/github-api.js"></script>
  <script src="assets/js/zip-handler.js"></script>
  <script src="assets/js/app.js"></script>
</body>
</html>