# 🚀 devD CLI (Developer Helper)

`devD` is an interactive CLI companion that automates Git repository tasks, conventional commits, staging files, stashing, and version bumping. It also integrates with the Gemini API to draft commit messages from diffs or answer coding questions directly inside your terminal.

---

## 📦 Installation Methods

### Method 1: The Quick Installer (Recommended)
Paste this command into your terminal to automatically check prerequisites and install the tool globally:
```bash
curl -fsSL https://raw.githubusercontent.com/dwaipayanray95/devD/main/install.sh | bash
```

### Method 2: Global Installation via GitHub (Direct NPM)
Download and link the tool directly from the GitHub repository:
```bash
npm install -g dwaipayanray95/devD
```

### Method 3: Global Installation via NPM Registry (If Published)
If the tool is published to the NPM registry, install it using:
```bash
npm install -g dev-d
```

### Method 4: Local Clone & Setup (For Development)
Clone the repository and register it globally on your local machine:
```bash
git clone https://github.com/dwaipayanray95/devD.git
cd devD
npm install
npm link
```

---

## 🔑 Gemini AI Configuration (Optional)
To use the AI-drafted commit message feature or general queries, set your Gemini API key in your terminal session or add it to your shells profile file (`~/.zshrc` or `~/.bashrc`):
```bash
export GEMINI_API_KEY="your-gemini-api-key"
```

---

## 🛠 Usage & Command Shortcuts

Run `devD` on its own to open the interactive, looping main menu:
```bash
devD
```

Alternatively, run specific actions immediately using command shortcuts:

| Command | Alias | Description |
| :--- | :--- | :--- |
| `devD status` | `devD d` | Displays the status dashboard (branch, sync, changes, recent commits). |
| `devD commit` | `devD c` | Runs Conventional Commit Wizard (stages files, inputs message, or drafts via Gemini). |
| `devD sync` | `devD s` | Pulls upstream updates (rebase) and pushes local commits. |
| `devD bump [type]` | `devD b [type]` | Bumps package version (types: `patch`, `minor`, `major`). |
| `devD stash` | — | Stashes modifications (use `--pop` or `-p` to restore). |
| `devD ai "<prompt>"` | — | Asks Gemini a development question directly. |

---

## 🎨 Technology Stack
- **Node.js**: ES Modules (ESM)
- **commander**: CLI argument parsing & routing
- **inquirer**: Interactive checklist, choice, and input prompts
- **chalk**: Dynamic string styling and console visual themes
- **ora**: Elegant CLI loading spinners
- **Native Fetch**: Simple HTTP integration with the Gemini API (Zero-dependency API helper)
