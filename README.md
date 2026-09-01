# 🚀 GitHub Project Pusher

GitHub Project Pusher is a mobile-friendly web application that makes it easy to upload and push ZIP files, project files, and complete projects directly to GitHub repositories using the GitHub API.

## ✨ Features

- 📦 Upload ZIP files
- 📁 Upload project files
- 🔐 Use your own GitHub Personal Access Token
- 📚 Fetch and select GitHub repositories
- 🌿 Select Git branches
- 📤 Push projects directly to GitHub
- 📝 Custom commit messages
- 📊 Upload progress
- ✅ Success and error status
- 📱 Mobile-friendly interface
- 💻 Desktop-friendly interface
- 🔄 Support for updating existing files
- 🗂️ Preserve project folder structure

## 🔄 How It Works

```text
Select ZIP / Project
        ↓
Enter GitHub Token
        ↓
Connect GitHub
        ↓
Select Repository
        ↓
Select Branch
        ↓
Review Project Files
        ↓
Enter Commit Message
        ↓
🚀 Push to GitHub

🔐 Security

GitHub Project Pusher is designed to use the user's own GitHub credentials.

Important:

Never hard-code a GitHub token in the source code.

Never commit tokens or passwords to GitHub.

Do not expose tokens in public JavaScript files.

Use the minimum GitHub permissions required.

Clear the token when disconnecting from the application.


🛠️ Technology

HTML5

CSS3

JavaScript

PHP 8+

GitHub REST API


📦 Project Structure

github-project-pusher/
├── index.php
├── api/
├── config/
├── assets/
│   ├── css/
│   ├── js/
│   └── icons/
├── uploads/
├── .gitignore
└── README.md

🚀 Getting Started

1. Clone or download this repository.


2. Configure the application according to the setup instructions.


3. Start the PHP server.


4. Open the application in your browser.


5. Enter your GitHub token.


6. Connect your GitHub account.


7. Select a repository and branch.


8. Select your ZIP/project.


9. Enter a commit message.


10. Click Push to GitHub.



⚠️ Limitations

GitHub has API and file-size limitations. Very large projects or files may require a normal Git-based workflow instead of the GitHub REST API.

📄 License

This project is provided for educational and development purposes.

👨‍💻 Author

Asif Qureshi

Built as a developer utility for easily pushing projects to GitHub from mobile or desktop.

