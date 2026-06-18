# Developer Agent Guide - devD CLI Companion

Welcome, AI Coding Agent! This guide outlines the project structure, design guidelines, and patterns used in `devD` so you can contribute efficiently.

## Project Overview
`devD` is a developer helper CLI companion for Git, stashing, AI queries, and version bumping, built in Node.js (ES Modules).

## Architecture & Modular Design

The codebase is split into lightweight, single-responsibility modules under `src/`, keeping the main entry point `bin/devD.js` thin.

```
devD/
├── bin/
│   └── devD.js         # Entry point: CLI command definition (Commander) & router
└── src/
    ├── commands.js     # Text command/shortcut registry, parser, & Help UI
    ├── git.js          # Native Git command executions & status parsers
    ├── menu.js         # Interactive TUI combining list selection & text field
    ├── navigator.js    # Interactive Folder Navigator & drive selector
    ├── ui.js           # Commit Wizard, dashboard rendering, & UI themes
    └── updater.js      # Global CLI updater & cross-platform spawner
```

---

## Coding Guidelines & Constraints

### 1. Maintain Modular Boundaries
* Keep `bin/devD.js` as a routing layer. Do not add UI layout rendering or complex logic directly in it; delegate to the corresponding `src/` modules.
* Export configurations and logic functions so they are easily testable.

### 2. Windows Spawning Compatibility
* Never use `shell: true` with `spawn` or `exec` on Windows when passing dynamic arguments, as this triggers deprecation warning `[DEP0190]`.
* Always use `crossSpawn` from `src/updater.js`. It automatically appends `.cmd` to `npm`/`npx` scripts when executing on Windows, allowing them to spawn cleanly without `shell: true` or `EINVAL`/`ENOENT` errors.

### 3. Interactive TTY Inputs
* If drawing a raw keyboard input screen (e.g., custom prompts or lists), ensure you call `process.stdin.resume()` when initializing to prevent the Node process from exiting prematurely if previous prompt libraries (like `inquirer`) paused the stdin stream.

---

## Adding Commands or Shortcuts
To add or modify text-field commands:
1. Update the `COMMANDS_HELP` registry array in `src/commands.js`.
2. Add your parsing mappings (shortcuts, aliases) in `parseCommand()` in `src/commands.js`.
3. Add the execution handler under `handleMenuAction()` in `bin/devD.js`.
