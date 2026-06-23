# 🚀 devD CLI (Developer Helper)

[![GitHub Stars](https://img.shields.io/github/stars/dwaipayanray95/devD?style=social)](https://github.com/dwaipayanray95/devD)
![Visitors](https://komarev.com/ghpvc/?username=dwaipayanray95-devD&color=blueviolet&style=flat-square&label=Views)
##
<p align="center">
  <img src="https://github.com/user-attachments/assets/6b69783a-5225-4700-996c-9eb6f0679444" alt="Banner Screenshot" width="100%">
</p>

## 

`devD` is a premium, state-of-the-art interactive developer companion CLI written in **Go**. It automates Git repository tasks, conventional commits, staging files, stashing, and version bumping. It also integrates with the Gemini API to draft commit messages from diffs or answer coding questions directly inside your terminal, wrapped in a beautiful, modern terminal aesthetic.


<img width="450" height="467" alt="Screenshot 2026-06-23 at 19 06 20" src="https://github.com/user-attachments/assets/4f6e2eed-e7f2-4728-835a-0ee71512298a" />
<img width="450" height="467" alt="Screenshot 2026-06-23 at 19 06 44" src="https://github.com/user-attachments/assets/f9da9adb-97f4-4509-91ea-031e72a8a875" />

---

## 🎨 Premium Modern Vibecoding CLI Assistant
`devD` features a visual identity inspired by premium AI CLI agents (like Gemini CLI, AGY, and Claude Code):
- **Solid Gradient Wordmark**: A gorgeous, high-contrast block banner (`devD`) dynamically colored with a theme-dependent gradient.
- **Dynamic Terminal Auto-Scaling**: Auto-resizes the terminal window to a minimum of **42 rows and 65 columns** on start to ensure optimal layout layout and zero text clipping.
- **Modern Color Palettes**: Supports premium curated **Dark** (Slate & Indigo), **Light** (Clean Off-White & Indigo), and **Solarized Light** (Warm Cream & Teal) themes.
- **Clean Unicode Layouts**: Emojis are replaced by structured Unicode symbols (`◆`, `●`, `▸`, `▌`, `─`) and highlighted cursor blocks.
- **Auto Scrollback Hygiene**: Automatically clears lingering interface histories when traversing folders, switching menus, or returning from shell executions.
- **Direct Terminal Command Fallback**: Type any standard shell command (e.g. `ls -la`, `cat main.go`, `git log`) directly into the input buffer to execute it inside zsh without exiting `devD`.
- **Auto-Update Delivery**: Checks for new updates programmatically in the background on startup, alerts you, and prompts for a clean, silent install wrapper directly from GitHub.
- **Robust Git & Versioning Workflow**: Wizard tools to manage branches, conventional commits, tagging, stashing, and version bumping in seconds.

---

## 📦 Installation Methods

### Method 1: The Quick Installer (Recommended)
Paste this command into your terminal to automatically check prerequisites and install the tool globally:
```bash
curl -fsSL https://raw.githubusercontent.com/dwaipayanray95/devD/main/install.sh | bash
```

### Method 2: Global Installation via GitHub (Direct NPM wrapper)
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
Clone the repository and build the Go binary:
```bash
git clone https://github.com/dwaipayanray95/devD.git
cd devD
go build -o devd main.go
```

---

## 🔑 Gemini AI Configuration (Optional)
To use the AI-drafted commit message feature or general queries, set your Gemini API key in your terminal session or add it to your shell's profile file (`~/.zshrc` or `~/.bashrc`):
```bash
export GEMINI_API_KEY="your-gemini-api-key"
```

---

## 💻 Available Text Input Commands & Shortcuts

When inside the interactive prompt, you can type the following commands or shortcuts:

| Command | Shortcuts | Description |
| :--- | :--- | :--- |
| `status` | `s`, `dashboard` | Show repository branch details, stashes, and staged/unstaged status. |
| `commit` | `c`, `wizard` | Run Conventional Commit Wizard (auto-stages files, allows manual or AI commit). |
| `sync` | `y` | Pull remote changes with rebase and push local commits. |
| `pull` | — | Pull remote changes (git pull --rebase). |
| `stash` | — | Save current modifications to the stash stack. |
| `pop` | `stash-pop` | Restore/apply the last stashed modifications. |
| `bump` | `b` | Bump package version dynamically. |
| `ai` | `a`, `gemini` | Query the Gemini AI assistant directly in the console. |
| `cd` | — | Open the interactive Folder Directory Navigator (use **Arrows** to navigate, **Enter** to open, **Space** to select/CD, and **Esc** to return). |
| `cd <path>` | — | Change working directory to a specific path (e.g. `cd /Users`). |
| `update` | `u` | Update devD CLI from the latest GitHub release tag (includes silent updates). |
| `help` | `h`, `?` | Open the interactive commands description help page. |
| `restart` | `r` | Restart the devD CLI companion session. |
| `settings` | `set` | Open the settings dashboard (Themes, GitHub Tokens). |
| `exit` | `q`, `quit` | Exit the devD companion CLI. |
| *[Any command]* | — | **Direct Shell Fallback**: Type any standard shell command (e.g., `ls -la`, `cat main.go`) to execute it directly inside zsh from within devD. |

---

## 🛠 Terminal CLI Usage (Direct Subcommands)

Alternatively, run specific actions immediately using standard terminal subcommands:

| CLI Command | Description |
| :--- | :--- |
| `devD status` | Displays the status dashboard (branch, sync, changes, recent commits). |
| `devD commit` | Runs Conventional Commit Wizard (stages files, inputs message, or drafts via Gemini). |
| `devD sync` | Pulls upstream updates (rebase) and pushes local commits. |
| `devD bump [type]` | Bumps package version (types: `patch`, `minor`, `major`). |
| `devD stash` | Stashes modifications. |
| `devD ai "<prompt>"` | Asks Gemini a development question directly. |
| `devD update` | Updates the CLI. |

---

## 🎨 Technology Stack
- **Go**: Core implementation language.
- **Bubble Tea**: TUI framework for rendering and updating state.
- **Lip Gloss**: Terminal styling and layouts engine.
- **Cobra**: CLI argument parsing & routing.
- **Gemini API Go SDK**: Lightweight Go wrapper to communicate with the Gemini models.

