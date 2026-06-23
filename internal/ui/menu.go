package ui

import (
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
	ChosenType   string // "menu" or "input"
	Quitting     bool
	TextSelected bool
	TerminalWidth int
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

func (m MenuModel) Init() tea.Cmd {
	return nil
}

func (m MenuModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
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

		case "ctrl+w": // Fast backspace - delete word
			m.EscPressed = false
			trimmed := strings.TrimRight(m.InputBuffer, " ")
			idx := strings.LastIndex(trimmed, " ")
			if idx >= 0 {
				m.InputBuffer = trimmed[:idx+1]
			} else {
				m.InputBuffer = ""
			}

		case "backspace":
			m.EscPressed = false
			if len(m.InputBuffer) > 0 {
				runes := []rune(m.InputBuffer)
				m.InputBuffer = string(runes[:len(runes)-1])
			}

		default:
			m.EscPressed = false
			if len(msg.String()) == 1 {
				m.InputBuffer += msg.String()
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

	// ── Menu Section ────────────────────────
	s.WriteString(RenderDivider("Menu", 54) + "\n\n")

	for i, choice := range m.Choices {
		if i == m.Cursor {
			// Selected: accent left bar + bright text
			s.WriteString("   " + Accent.Render("▌") + " " + Accent.Render(choice.Icon) + "  " + Bright.Render(choice.Label) + "\n")
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
	wrappedInput := WrapText(m.InputBuffer, wrapWidth)
	
	// Add proper indentation to wrapped lines
	wrappedLines := strings.Split(wrappedInput, "\n")
	var displayInput strings.Builder
	for idx, line := range wrappedLines {
		if idx == 0 {
			displayInput.WriteString("   " + Accent.Render("❯") + " " + Bright.Render(line))
		} else {
			displayInput.WriteString("\n     " + Bright.Render(line))
		}
	}
	s.WriteString(displayInput.String() + Dim.Render("▏") + "\n\n")

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
