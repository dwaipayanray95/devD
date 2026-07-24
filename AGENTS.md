# Developer Agent Guide — devD CLI Companion

Welcome, AI Coding Agent! This guide outlines the project structure, design guidelines, and patterns used in `devD` so you can contribute efficiently.

## Project Overview
`devD` is a developer helper CLI companion for Git workflows, conventional commits, stashing, pushing/pulling, AI queries, version bumping, and platform-aware self-updates, built in **Go** using [Cobra](https://github.com/spf13/cobra) for command routing and [Bubble Tea](https://github.com/charmbracelet/bubbletea) + [Lip Gloss](https://github.com/charmbracelet/lipgloss) for the interactive TUI.

## Architecture & Modular Design

The codebase is split into lightweight, single-responsibility modules under `internal/`, keeping the entry point `main.go` thin.

```
devD/
├── main.go                     # Entry point: embeds package.json & calls cmd.Execute()
├── bin/
│   ├── devd                    # Cross-platform Node.js launcher wrapper script
│   └── install-binary.js       # Auto-installer script for OS-specific pre-built binaries
├── cmd/
│   ├── root.go                 # CLI command definition (Cobra), menu loop, tag updates & action router
│   └── settings.go             # Settings, preferences, help & restart handlers
└── internal/
    ├── config/
    │   └── config.go           # Config persistence (~/.devd/config.json), theme & token storage
    ├── detector/
    │   └── detector.go         # Project framework auto-detection (Node, Flutter, Go, etc.)
    ├── gemini/
    │   └── gemini.go           # Gemini AI client for AI query feature
    ├── git/
    │   ├── git.go              # Core Git executions (push, pull, status, stash, branches)
    │   └── wizard.go           # Conventional Commit Wizard, GitHub Release flow, and dual-platform Version Bumper (package.json & pubspec.yaml + app_version.dart)
    ├── logger/
    │   └── logger.go           # System log management
    └── ui/
        ├── ui.go               # Design system: style tokens, themes, gradient text rendering, banner
        ├── menu.go             # Interactive main menu (Bubble Tea model with CursorIdx navigation & paste handling)
        ├── prompts.go          # Select, input, confirm prompt components with horizontal CursorIdx tracking
        └── navigator.go        # Interactive folder navigator with letter-snapping
```

---

## Design System

### Style Tokens & Contrast Management
All colors and styles are defined in `internal/ui/ui.go` as Lip Gloss styles:
- `Primary`, `Success`, `Warning`, `Error`, `Muted`, `Info`, `Accent`, `Bright`, `Dim`, `Highlight`
- Environment styles adapt dynamically via `InitTheme()` for Dark, Light, and Solarized terminal palettes.
- Input fields inherit native terminal font colors (`Bright` foreground) while active options render in a full `Highlight` block style to ensure visibility across all light/dark terminal modes.

### Key Features & Input Handlers
- **Inline Cursor Navigation**: `MenuModel` and `InputModel` maintain a `CursorIdx` rune pointer. Users navigate `←` / `→` arrow keys inside prompts to insert or delete characters anywhere within a string.
- **Any-Length Input & Clipboard**: Key handlers process multi-character string input buffers to seamlessly support system clipboard paste events (`Cmd+V`, `Ctrl+V`, terminal right-click).
- **Dual-Platform Version Bumping**: `git.BumpVersion()` automatically senses if `pubspec.yaml` or `package.json` exists. For Flutter projects, it updates `pubspec.yaml` (including build numbers `+N`) and syncs `lib/core/app_version.dart`.
- **GitHub Tag-Based Self-Updates**: `getLatestGithubTag()` queries GitHub's `/releases/latest` REST endpoint. Background checks alert users to update, executing `npm install -g dwaipayanray95/devD#vX.Y.Z`.

---

## Coding Guidelines & Constraints

### 1. Maintain Modular Boundaries
* Keep `main.go` as just an entry point. All routing lives in `cmd/root.go`.
* UI rendering and design tokens live exclusively in `internal/ui/`.
* Config persistence lives in `internal/config/`.

### 2. Theme Awareness
* All new UI must use the global style tokens (`ui.Primary`, `ui.Accent`, etc.).
* Avoid forcing hardcoded dark text on input buffers unless checking background modes.

### 3. Adding Commands or Shortcuts
To add or modify text-field commands:
1. Add parsing mappings (shortcuts, aliases) in `ParseCommand()` in `cmd/root.go`.
2. Add execution handler under `HandleMenuAction()` in `cmd/root.go`.
3. If adding a menu item, update `NewMenuModel()` in `internal/ui/menu.go`.
