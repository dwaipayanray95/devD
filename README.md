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

## 🛠 Interactive Dual Console UI
Running the CLI on its own (`devD`) starts a dual interactive environment:
* **📋 Selectable Menu (Top)**: Use your **Arrow keys** and **Enter** to navigate and select options.
* **⌨️ Command Input Field (Bottom)**: Type command names or shortcuts directly and press **Enter** to run them instantly.

---

## 💻 Available Text Input Commands & Shortcuts

When inside the interactive `devD >` prompt, you can type the following commands or shortcuts:

| Command | Shortcuts | Description |
| :--- | :--- | :--- |
| `status` | `s`, `dashboard` | Show repository branch details, stashes, and staged/unstaged status. |
| `commit` | `c`, `wizard` | Run Conventional Commit Wizard (auto-stages files, allows manual or AI commit). |
| `sync` | `y` | Pull remote changes with rebase and push local commits. |
| `stash` | — | Save current modifications to the stash stack. |
| `pop` | `stash-pop` | Restore/apply the last stashed modifications. |
| `bump` | `b` | Bump package version dynamically using `bump-version`. |
| `ai` | `a`, `gemini` | Query the Gemini AI assistant directly in the console. |
| `update` | `u` | Update devD CLI from the latest GitHub release tag. |
| `update --latest` | — | Update devD CLI directly from the latest main branch commit. |
| `dir` | — | Open the interactive Directory Navigator (use **Arrows** to navigate, **Enter** to open, **Space** to select/CD, and **Esc** to return). |
| `dir <path>` | — | Change working directory to a specific path (e.g. `dir C:\Users`). |
| `help` | `h`, `?` | Open the interactive commands description help page. |
| `restart` | `r` | Restart the devD CLI companion session. |
| `exit` | `q`, `quit` | Exit the devD companion CLI. |

---

## 🛠 Terminal CLI Usage (Direct Subcommands)

Alternatively, run specific actions immediately using standard terminal subcommands:

| CLI Command | Description |
| :--- | :--- |
| `devD status` (alias: `devD d`) | Displays the status dashboard (branch, sync, changes, recent commits). |
| `devD commit` (alias: `devD c`) | Runs Conventional Commit Wizard (stages files, inputs message, or drafts via Gemini). |
| `devD sync` (alias: `devD s`) | Pulls upstream updates (rebase) and pushes local commits. |
| `devD bump [type]` (alias: `devD b [type]`) | Bumps package version (types: `patch`, `minor`, `major`, `interactive`). |
| `devD stash` | Stashes modifications (use `--pop` or `-p` to restore). |
| `devD ai "<prompt>"` | Asks Gemini a development question directly. |
| `devD update` (alias: `devD u`) | Updates the CLI (use `--commit` or `-c` to update to the latest bleeding-edge commit). |

---

## 🎨 Technology Stack
- **Node.js**: ES Modules (ESM)
- **commander**: CLI argument parsing & routing
- **inquirer**: Interactive checklist, choice, and input prompts
- **chalk**: Dynamic string styling and console visual themes
- **ora**: Elegant CLI loading spinners
- **Native Fetch**: Simple HTTP integration with the Gemini API (Zero-dependency API helper)

