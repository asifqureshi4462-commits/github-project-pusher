/**
 * GitHub Git Database REST API Client
 * Performs atomic commits via Blobs -> Tree -> Commit -> Ref update
 */
class GitHubAPI {
  constructor(token) {
    this.token = token;
    this.baseUrl = 'https://api.github.com';
  }

  async request(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      ...options.headers
    };

    const response = await fetch(url, { ...options, headers });
    
    if (response.status === 401) {
      throw new Error('GitHub authentication failed: Token is invalid, expired, or revoked.');
    }
    if (response.status === 403) {
      const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
      if (rateLimitRemaining === '0') {
        throw new Error('GitHub API rate limit exceeded. Please wait or check your token.');
      }
      throw new Error('Permission denied. Make sure your token has repository write permissions.');
    }
    if (response.status === 404) {
      throw new Error(`Requested resource not found (${endpoint}). Verify repository or branch name.`);
    }

    if (!response.ok) {
      let errMessage = `GitHub API error: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.message) errMessage = errorData.message;
      } catch (_) {}
      throw new Error(errMessage);
    }

    // 204 No Content
    if (response.status === 204) return null;
    return await response.json();
  }

  // Get authenticated user
  async getAuthenticatedUser() {
    return await this.request('/user');
  }

  // List all repositories accessible by the user (sorted by recent update)
  async getUserRepositories(page = 1, perPage = 100) {
    return await this.request(
      `/user/repos?per_page=${perPage}&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`
    );
  }

  // Get repository branches
  async getBranches(owner, repo) {
    return await this.request(`/repos/${owner}/${repo}/branches?per_page=100`);
  }

  // Get single repository details
  async getRepository(owner, repo) {
    return await this.request(`/repos/${owner}/${repo}`);
  }

  // Get latest commit SHA for a branch
  async getBranchRef(owner, repo, branch) {
    try {
      return await this.request(`/repos/${owner}/${repo}/git/ref/heads/${branch}`);
    } catch (err) {
      // Branch may be empty or not found
      return null;
    }
  }

  // Create a Git Blob (base64 encoded content)
  async createBlob(owner, repo, base64Content) {
    const payload = {
      content: base64Content,
      encoding: 'base64'
    };
    return await this.request(`/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  // Create a Git Tree containing all file modes and blob SHAs
  async createTree(owner, repo, treeItems, baseTreeSha = null) {
    const payload = {
      tree: treeItems
    };
    if (baseTreeSha) {
      payload.base_tree = baseTreeSha;
    }
    return await this.request(`/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  // Create a Git Commit pointing to the new Tree
  async createCommit(owner, repo, message, treeSha, parentCommitShas = []) {
    const payload = {
      message: message,
      tree: treeSha,
      parents: parentCommitShas
    };
    return await this.request(`/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  // Update Branch Ref to point to the new Commit
  async updateBranchRef(owner, repo, branch, commitSha, force = false) {
    return await this.request(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      body: JSON.stringify({
        sha: commitSha,
        force: force
      })
    });
  }

  // Create initial ref/file for newly created completely empty repositories
  async createInitialBranch(owner, repo, branch, commitSha) {
    return await this.request(`/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: commitSha
      })
    });
  }
}