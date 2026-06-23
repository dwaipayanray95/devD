# Developer Agent Guide — devD CLI Companion

Welcome, AI Coding Agent! This guide outlines the project structure, design guidelines, and patterns used in `devD` so you can contribute efficiently.

## Project Overview
`devD` is a developer helper CLI companion for Git, stashing, AI queries, and version bumping, built in **Go** using [Cobra](https://github.com/spf13/cobra) for command routing and [Bubble Tea](https://github.com/charmbracelet/bubbletea) + [Lip Gloss](https://github.com/charmbracelet/lipgloss) for the interactive TUI.

## Architecture & Modular Design

The codebase is split into lightweight, single-responsibility modules under `internal/`, keeping the entry point `main.go` thin.

```
devD/
├── main.go                     # Entry point: calls cmd.Execute()
├── cmd/
│   ├── root.go                 # CLI command definition (Cobra), menu loop & action router
│   └── settings.go             # Settings, preferences, help & restart handlers
└── internal/
    ├── config/
    │   └── config.go           # Config persistence (~/.devd/config.json), theme & token storage
    ├── detector/
    │   └── detector.go         # Project framework auto-detection (Node, Flutter, Go, etc.)
    ├── gemini/
    │   └── gemini.go           # Gemini AI client for AI query feature
    ├── git/
    │   └── *.go                # Git operations, commit wizard, branch manager, release flow
    ├── logger/
    │   └── logger.go           # System log management
    └── ui/
        ├── ui.go               # Design system: style tokens, themes, gradient rendering, banner
        ├── menu.go             # Interactive main menu (Bubble Tea model)
        ├── prompts.go          # Select, input, confirm prompt components (Bubble Tea)
        └── navigator.go        # Interactive folder navigator with letter-snapping (Bubble Tea)
```

---

## Design System

### Style Tokens
All colors and styles are defined in `internal/ui/ui.go` as Lip Gloss styles:
- `Primary`, `Success`, `Warning`, `Error`, `Muted`, `Info`, `Accent`, `Bright`, `Dim`, `Highlight`
- These are dynamically resolved via `InitTheme()` based on the user's stored preference (dark/light/solarized/system).

### UI Conventions
- **No emojis** — Use Unicode symbols (`◆`, `▶`, `◼`, `▲`, `◇`, `●`, `✕`, `▸`, `◁`, etc.)
- **Selection indicator**: Use `▌` (left half-block) in Accent color for the active item
- **Section headers**: Use `RenderDivider(title, width)` for horizontal rule separators
- **Gradient rendering**: Use `GradientText(text, startHex, endHex)` for accent effects (e.g., ASCII art logo)
- **Key hints footer**: Always show available shortcuts at the bottom of interactive views

---

## Coding Guidelines & Constraints

### 1. Maintain Modular Boundaries
* Keep `main.go` as just an entry point. All routing lives in `cmd/root.go`.
* UI rendering and design tokens live exclusively in `internal/ui/`.
* Config persistence lives in `internal/config/`.

### 2. Theme Awareness
* All new UI must use the global style tokens (`ui.Primary`, `ui.Accent`, etc.), never hardcoded hex colors.
* The `AppBg` variable controls background coloring for light/solarized themes.

### 3. No Git Operations by AI Agents
* Do **NOT** commit, push, or create tags/releases on behalf of the user unless explicitly asked.
* The user will review and commit manually.

---

## Adding Commands or Shortcuts
To add or modify text-field commands:
1. Add your parsing mappings (shortcuts, aliases) in `ParseCommand()` in `cmd/root.go`.
2. Add the execution handler under `HandleMenuAction()` in `cmd/root.go`.
3. If adding a menu item, update `NewMenuModel()` in `internal/ui/menu.go`.
