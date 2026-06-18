# 🚀 devD CLI (Developer Helper)

`devD` is an interactive CLI companion that automates Git repository tasks, conventional commits, staging files, stashing, and version bumping. It also integrates with the Gemini API to draft commit messages from diffs or answer coding questions directly inside your terminal.

---

## 📦 Installation & Setup

1. **Clone/Download** this project.
2. Open terminal in the project directory `/Users/rayr/.gemini/antigravity/scratch/dev-helper-cli`.
3. Link the package globally:
   ```bash
   npm link
   ```
4. Configure your Gemini API Key (Optional, for AI features):
   ```bash
   export GEMINI_API_KEY="your-api-key"
   ```
   *Tip: Add this export to your `~/.zshrc` or `~/.bashrc` to make it permanent.*

---

## 🛠 Usage & Commands

Running `devD` on its own opens the interactive, looping main menu:
```bash
devD
```

### Shortcuts & Subcommands

- **`devD status`** (or **`devD d`**): Displays the status dashboard (branch, sync, modified files, recent commits).
- **`devD commit`** (or **`devD c`**): Launches the Conventional Commit Wizard (file checklist, auto-diff AI commits, push prompts).
- **`devD sync`** (or **`devD s`**): Pulls upstream changes (rebase) and pushes local commits.
- **`devD bump [type]`** (or **`devD b [type]`**): Bumps the version using your `bump-version` package (types: `patch`, `minor`, `major`).
- **`devD stash`**: Interactively stashes or pops modifications (`devD stash --pop`).
- **`devD ai "<prompt>"`**: Asks Gemini a query directly from the terminal (e.g. `devD ai "write a python function to merge dicts"`).

---

## 🎨 Technology Stack
- **Node.js**: ES Modules (ESM)
- **commander**: CLI argument parsing & routing
- **inquirer**: Rich user input interfaces (checklists, lists, inputs)
- **chalk**: Dynamic string styling and console visual themes
- **ora**: Elegant CLI loading spinners
- **Native Fetch**: Simple HTTP integration with the Gemini API
