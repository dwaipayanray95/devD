# 🚀 devD CLI (Developer Helper)

[![GitHub Stars](https://img.shields.io/github/stars/dwaipayanray95/devD?style=social)](https://github.com/dwaipayanray95/devD)
![Visitors](https://komarev.com/ghpvc/?username=dwaipayanray95-devD&color=blueviolet&style=flat-square&label=Views)
##
<p align="center">
  <img src="https://github.com/user-attachments/assets/6b69783a-5225-4700-996c-9eb6f0679444" alt="Banner Screenshot" width="100%">
</p>

## 

`devD` is a premium, state-of-the-art interactive developer companion CLI written in **Go**. It automates Git repository workflows, conventional commits, staging, stashing, pushing/pulling, version bumping (Node `package.json` & Flutter `pubspec.yaml` + `app_version.dart`), and platform-aware CLI self-updates. It also integrates optional Gemini AI to draft commit messages from diffs or answer coding queries directly in your terminal.


<img width="450" height="467" alt="Screenshot 2026-06-23 at 19 06 20" src="https://github.com/user-attachments/assets/4f6e2eed-e7f2-4728-835a-0ee71512298a" />
<img width="450" height="467" alt="Screenshot 2026-06-23 at 19 06 44" src="https://github.com/user-attachments/assets/f9da9adb-97f4-4509-91ea-031e72a8a875" />

---

## 🎨 Key Features & Interactive Architecture

- **Interactive TUI & Full Keyboard Controls**: Built on Charm's Bubble Tea and Lip Gloss for ultra-smooth rendering.
- **Inline Cursor Navigation & Editing**: Real-time block cursor positioning in all text input fields using `←` / `→` arrow keys, with mid-string character insertion and word deletion (`Ctrl+W`).
- **Cross-Platform System Clipboard Integration**: Full support for copying, cutting, and pasting (`Ctrl+V`, `Cmd+V`, or terminal right-click paste) on macOS, Windows, and Linux.
- **Multi-Ecosystem Version Discovery**: Automatically parses and displays project versions in the header banner for Node (`package.json`), Flutter (`pubspec.yaml`), Rust (`Cargo.toml`), Python (`pyproject.toml`), Go (`go.mod`/`VERSION`), Java (`pom.xml`), Gradle/Android (`build.gradle`/`kts`), and standalone `VERSION` files.
- **Native Version Bumper**: Automatically detects project types and bumps version numbers across Node (`package.json`) and Flutter (`pubspec.yaml` with build numbers `+N`, syncing `lib/core/app_version.dart`).
- **Smart Git Push & Pull Controls**: Dedicated push (`push` / `ps`), pull (`pull` / `pl`), and sync (`sync` / `y`) actions with remote branch selection.
- **Tag-Based GitHub Self-Updates**: Background release checks against official GitHub Release Tags with one-click silent installer updating.
- **Theme Auto-Adaptation**: Clean support for **Dark**, **Light**, and **Solarized** terminal palettes with automatic text contrast management.
- **Direct Shell Command Fallback**: Execute standard terminal commands (`ls -la`, `git log`, etc.) directly inside the command line prompt without exiting `devD`.

---

## 📦 Installation Methods

### Method 1: Quick Installer Script (macOS / Linux / WSL)
```bash
curl -fsSL https://raw.githubusercontent.com/dwaipayanray95/devD/main/install.sh | bash
```

### Method 2: Global Installation via NPM Package Wrapper (Cross-Platform)
Works natively on macOS, Linux, and Windows (PowerShell / Command Prompt):
```bash
npm install -g dwaipayanray95/devD
```
*Or via NPM registry:*
```bash
npm install -g dev-d
```

### Method 3: Build from Source
```bash
git clone https://github.com/dwaipayanray95/devD.git
cd devD
go build -o devd main.go
```

---

## 🔑 Gemini AI Integration Setup (Optional)
To enable AI commit message drafting and interactive terminal queries, export your Gemini API key:
```bash
export GEMINI_API_KEY="your-gemini-api-key"
```

---

## 💻 Input Commands & Shortcuts Reference

| Command | Shortcuts | Description |
| :--- | :--- | :--- |
| `status` | `s`, `dashboard` | View repository branch details, stashes, and staged/unstaged changes. |
| `commit` | `c`, `wizard` | Conventional Commit Wizard (stages files, inputs message or drafts via Gemini). |
| `push` | `ps` | Push local commits to remote tracking branch (or select branch). |
| `pull` | `pl` | Pull remote changes (`git pull --rebase`). |
| `sync` | `y` | Synchronize repository (pull remote changes and push local commits). |
| `stash` | — | Save current uncommitted changes to the stash stack. |
| `pop` | `stash-pop` | Apply/restore the most recent stash entry. |
| `bump` | `b` | Interactively bump project version (`package.json` or `pubspec.yaml`). |
| `ai` | `a`, `gemini` | Query Gemini AI directly in your terminal. |
| `cd` | — | Launch interactive Folder Navigator (`Arrows` to navigate, `Enter` to open). |
| `cd <path>` | — | Change working directory to `<path>`. |
| `update` | `u` | Check and update `devD` CLI to the latest GitHub Release Tag. |
| `help` | `h`, `?` | Display interactive help menu. |
| `settings` | `set` | Open Settings dashboard (Theme selection, tokens). |
| `restart` | `r` | Restart the CLI companion session. |
| `exit` | `q`, `quit` | Exit `devD`. |
| *[Any shell command]* | — | **Direct Terminal Fallback**: Run shell commands directly in `zsh`/`bash`. |

---

## 🎹 Keyboard Shortcuts & Field Controls

- **`←` / `→`**: Move cursor horizontally character-by-character inside input fields.
- **`Ctrl+W`**: Delete word to the left of cursor.
- **`Backspace`**: Delete character to the left of cursor.
- **`Cmd+V` / `Ctrl+V`**: Paste text from clipboard into active prompt.
- **`↑` / `↓`**: Navigate menu selections.
- **`Enter`**: Confirm choice / submit command.
- **`Esc`**: Cancel prompt or exit current menu.

---

## 🎨 Technology Stack
- **Go**: Core implementation language.
- **Bubble Tea**: Functional TUI framework.
- **Lip Gloss**: Terminal layout & styling engine.
- **Cobra**: CLI argument parsing & subcommand routing.
- **Gemini API**: AI payload integration.


