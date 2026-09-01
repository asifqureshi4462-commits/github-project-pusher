# GitHub Project Pusher

A fast, atomic, responsive web application to upload entire projects, folders, or `.zip` archives directly to any GitHub repository using a GitHub Personal Access Token.

---

## Features

- **Direct ZIP Extraction & Preservation**: Decompresses `.zip` archives client-side, retaining all subdirectories, nested assets, binaries (images, PDFs), and file permissions.
- **Folder & Multi-File Upload**: Supports drag-and-drop, standard multi-file selection, or entire directory trees (`webkitdirectory`).
- **Atomic Git Commit Engine**: Uses GitHub's Git Database API (`/git/blobs` ➔ `/git/trees` ➔ `/git/commits` ➔ `/git/refs`). Commits all files in a single atomic Git commit, eliminating individual file conflicts.
- **Repository & Branch Intelligence**: Automatically fetches your owned, collaborated, and organization repositories. Auto-detects default branches and allows targeting existing or new custom branches.
- **Subdirectory Targeting**: Push files to the repository root or into an optional subfolder (e.g. `src/` or `frontend/`).
- **Mobile-First Dark Interface**: Designed for high responsiveness across mobile touchscreens and desktop viewports.
- **Zero Token Persistence**: Your token is held in memory/session only. It is never stored in any database or sent to any third-party intermediary.

---

## Token Permissions & Scopes

To push project files to your repositories, generate a GitHub Personal Access Token:

1. Go to **GitHub Settings** ➔ **Developer Settings** ➔ **Personal access tokens**.
2. Create either:
   - **Classic Token**: Select the **`repo`** scope (for private + public repositories) or **`public_repo`** (for public repositories only).
   - **Fine-grained Token**: Select your target repository and grant **Read and Write** access for **Contents** and **Metadata**.

---

## Getting Started

### Local Setup (PHP Built-in Server)

1. Clone or download this project.
2. Open your terminal in the project directory:
   ```bash
   cd github-project-pusher