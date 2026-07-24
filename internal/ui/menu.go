package ui

import (
	"fmt"
	"strings"

	"github.com/atotto/clipboard"
	tea "github.com/charmbracelet/bubbletea"
)

type MenuItem struct {
	Icon  string // Unicode symbol (◆, ▶, ◼, etc.)
	Label string
	Value string
}

type MenuModel struct {
	Version     string
	GitActive   bool
	ThemeName   string
	Choices     []MenuItem
	Cursor      int
	InputBuffer string
	EscPressed  bool
	ChosenValue string
	ChosenType    string // "menu" or "input"
	Quitting      bool
	TextSelected  bool
	TerminalWidth int
	CursorIdx     int // Index where new characters are inserted and backspace deletes
	AheadCount    int
	BehindCount   int
	HasUpstream   bool
	GitStatusFn   func() (int, int, bool)
}

func NewMenuModel(version string, gitActive bool, themeName string) MenuModel {
	var choices []MenuItem
	if gitActive {
		choices = []MenuItem{
			{Icon: "◆", Label: "Git Controls", Value: "git-controls"},
			{Icon: "▶", Label: "Run App (Auto-Detect)", Value: "run-app"},
			{Icon: "◼", Label: "Build App (Auto-Detect)", Value: "build-app"},
			{Icon: "▲", Label: "Bump Version", Value: "bump"},
			{Icon: "◇", Label: "Ask Gemini / AI Query", Value: "ai"},
			{Icon: "●", Label: "Settings", Value: "settings"},
			{Icon: "✕", Label: "Exit", Value: "exit"},
		}
	} else {
		choices = []MenuItem{
			{Icon: "▶", Label: "Run App (Auto-Detect)", Value: "run-app"},
			{Icon: "◼", Label: "Build App (Auto-Detect)", Value: "build-app"},
			{Icon: "◇", Label: "Ask Gemini / AI Query", Value: "ai"},
			{Icon: "●", Label: "Settings", Value: "settings"},
			{Icon: "✕", Label: "Exit", Value: "exit"},
		}
	}

	return MenuModel{
		Version:       version,
		GitActive:     gitActive,
		ThemeName:     themeName,
		Choices:       choices,
		Cursor:        0,
		InputBuffer:   "",
		EscPressed:    false,
		TerminalWidth: 65, // default fallback width
	}
}

type GitAheadBehindMsg struct {
	Ahead       int
	Behind      int
	HasUpstream bool
}

func (m MenuModel) Init() tea.Cmd {
	if !m.GitActive || m.GitStatusFn == nil {
		return nil
	}
	return func() tea.Msg {
		ahead, behind, hasUpstream := m.GitStatusFn()
		return GitAheadBehindMsg{Ahead: ahead, Behind: behind, HasUpstream: hasUpstream}
	}
}

func (m MenuModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case GitAheadBehindMsg:
		m.AheadCount = msg.Ahead
		m.BehindCount = msg.Behind
		m.HasUpstream = msg.HasUpstream
		return m, nil

	case tea.WindowSizeMsg:
		m.TerminalWidth = msg.Width

	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+v":
			m.EscPressed = false
			if text, err := clipboard.ReadAll(); err == nil {
				m.InputBuffer += text
			}

		case "ctrl+a":
			m.EscPressed = false
			if len(m.InputBuffer) > 0 {
				_ = clipboard.WriteAll(m.InputBuffer)
			}

		case "ctrl+x":
			m.EscPressed = false
			if len(m.InputBuffer) > 0 {
				_ = clipboard.WriteAll(m.InputBuffer)
				m.InputBuffer = ""
			}

		case "ctrl+c":
			m.Quitting = true
			m.ChosenType = "menu"
			m.ChosenValue = "exit"
			return m, tea.Quit

		case "esc":
			if m.EscPressed {
				m.Quitting = true
				m.ChosenType = "menu"
				m.ChosenValue = "exit"
				return m, tea.Quit
			}
			m.EscPressed = true
			return m, nil

		case "up":
			m.EscPressed = false
			m.Cursor--
			if m.Cursor < 0 {
				m.Cursor = len(m.Choices) - 1
			}

		case "down":
			m.EscPressed = false
			m.Cursor++
			if m.Cursor >= len(m.Choices) {
				m.Cursor = 0
			}

		case "enter":
			m.Quitting = true
			if strings.TrimSpace(m.InputBuffer) != "" {
				m.ChosenType = "input"
				m.ChosenValue = strings.TrimSpace(m.InputBuffer)
			} else {
				m.ChosenType = "menu"
				m.ChosenValue = m.Choices[m.Cursor].Value
			}
			return m, tea.Quit

		case "left":
			m.EscPressed = false
			if m.CursorIdx > 0 {
				m.CursorIdx--
			}
			return m, nil

		case "right":
			m.EscPressed = false
			runes := []rune(m.InputBuffer)
			if m.CursorIdx < len(runes) {
				m.CursorIdx++
			}
			return m, nil

		case "ctrl+w": // Fast backspace - delete word before cursor index
			m.EscPressed = false
			runes := []rune(m.InputBuffer)
			if m.CursorIdx > 0 {
				leftPart := string(runes[:m.CursorIdx])
				trimmed := strings.TrimRight(leftPart, " ")
				idx := strings.LastIndex(trimmed, " ")
				var newLeft []rune
				if idx >= 0 {
					newLeft = []rune(trimmed[:idx+1])
				} else {
					newLeft = []rune{}
				}
				m.InputBuffer = string(newLeft) + string(runes[m.CursorIdx:])
				m.CursorIdx = len(newLeft)
			}

		case "backspace":
			m.EscPressed = false
			runes := []rune(m.InputBuffer)
			if m.CursorIdx > 0 {
				m.InputBuffer = string(runes[:m.CursorIdx-1]) + string(runes[m.CursorIdx:])
				m.CursorIdx--
			}

		default:
			m.EscPressed = false
			keyStr := msg.String()
			// Ignore vertical navigation keys in text field fallback
			if keyStr == "up" || keyStr == "down" {
				return m, nil
			}
			// Accept any string length (handles terminal emulator paste events)
			if keyStr != "" {
				runes := []rune(m.InputBuffer)
				insertedRunes := []rune(keyStr)
				m.InputBuffer = string(runes[:m.CursorIdx]) + keyStr + string(runes[m.CursorIdx:])
				m.CursorIdx += len(insertedRunes)
			}
		}
	}
	return m, nil
}


func (m MenuModel) View() string {
	if m.Quitting {
		return ""
	}

	var s strings.Builder

	// ── Banner ──────────────────────────────
	s.WriteString(RenderBanner(m.Version))

	// ── Live Git Sync Status Badge ─────────
	if m.GitActive && m.HasUpstream {
		var syncBadge string
		if m.AheadCount == 0 && m.BehindCount == 0 {
			syncBadge = Success.Render("  ✓ Synchronized with remote branch  ")
		} else {
			var parts []string
			if m.AheadCount > 0 {
				parts = append(parts, Accent.Render(fmt.Sprintf("↑ %d ahead", m.AheadCount)))
			}
			if m.BehindCount > 0 {
				parts = append(parts, Warning.Render(fmt.Sprintf("↓ %d behind", m.BehindCount)))
			}
			syncBadge = "  " + strings.Join(parts, "  ·  ")
		}
		s.WriteString(syncBadge + "\n\n")
	}

	// ── Menu Section ────────────────────────
	s.WriteString(RenderDivider("Menu", 54) + "\n\n")

	for i, choice := range m.Choices {
		if i == m.Cursor {
			s.WriteString("   " + Highlight.Render(" "+choice.Icon+"  "+choice.Label+" ") + "\n")
		} else {
			s.WriteString("     " + Dim.Render(choice.Icon) + "  " + Muted.Render(choice.Label) + "\n")
		}
	}
	s.WriteString("\n")

	// ── Command Input Section ───────────────
	s.WriteString(RenderDivider("Command", 54) + "\n\n")
	wrapWidth := m.TerminalWidth - 7
	if wrapWidth < 20 {
		wrapWidth = 20
	}
	// Build string with visual cursor block at cursor index position
	runes := []rune(m.InputBuffer)
	var cursorBuffer strings.Builder
	for i := 0; i <= len(runes); i++ {
		if i == m.CursorIdx {
			if i < len(runes) {
				// Cursor is on a character: invert/highlight it
				cursorBuffer.WriteString(Highlight.Render(string(runes[i])))
			} else {
				// Cursor is at the end: draw a block cursor
				cursorBuffer.WriteString(Highlight.Render(" "))
			}
		} else if i < len(runes) {
			cursorBuffer.WriteString(string(runes[i]))
		}
	}

	wrappedInput := WrapText(cursorBuffer.String(), wrapWidth)
	
	// Add proper indentation to wrapped lines
	wrappedLines := strings.Split(wrappedInput, "\n")
	var displayInput strings.Builder

	for idx, line := range wrappedLines {
		if idx == 0 {
			displayInput.WriteString("   " + Accent.Render("❯") + " " + line)
		} else {
			displayInput.WriteString("\n     " + line)
		}
	}
	s.WriteString(displayInput.String() + "\n\n")

	// ── Footer ──────────────────────────────
	if m.EscPressed {
		s.WriteString("   " + Warning.Render("Press Escape again to exit devD") + "\n")
	} else {
		s.WriteString(RenderDivider("", 54) + "\n")
		s.WriteString("   " + Muted.Render("↑↓ navigate") + Dim.Render("  ·  ") +
			Muted.Render("type command") + Dim.Render("  ·  ") +
			Muted.Render("enter select") + "\n")
	}

	return s.String()
}
