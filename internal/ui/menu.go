package ui

import (
	"strings"

	tea "github.com/charmbracelet/bubbletea"
)

type MenuItem struct {
	Name  string
	Value string
}

type MenuModel struct {
	Version      string
	GitActive    bool
	Choices      []MenuItem
	Cursor       int
	InputBuffer  string
	EscPressed   bool
	ChosenValue  string
	ChosenType   string // "menu" or "input"
	Quitting     bool
}

func NewMenuModel(version string, gitActive bool) MenuModel {
	var choices []MenuItem
	if gitActive {
		choices = []MenuItem{
			{Name: "🌿 Git Controls", Value: "git-controls"},
			{Name: "🏃 Run App (Auto-Detect)", Value: "run-app"},
			{Name: "📦 Build App (Auto-Detect)", Value: "build-app"},
			{Name: "🚀 Bump Version", Value: "bump"},
			{Name: "🤖 Ask Gemini / AI Query", Value: "ai"},
			{Name: "🛠 Settings", Value: "settings"},
			{Name: "❌ Exit", Value: "exit"},
		}
	} else {
		choices = []MenuItem{
			{Name: "🏃 Run App (Auto-Detect)", Value: "run-app"},
			{Name: "📦 Build App (Auto-Detect)", Value: "build-app"},
			{Name: "🤖 Ask Gemini / AI Query", Value: "ai"},
			{Name: "🛠 Settings", Value: "settings"},
			{Name: "❌ Exit", Value: "exit"},
		}
	}

	return MenuModel{
		Version:     version,
		GitActive:   gitActive,
		Choices:     choices,
		Cursor:      0,
		InputBuffer: "",
		EscPressed:  false,
	}
}

func (m MenuModel) Init() tea.Cmd {
	return nil
}

func (m MenuModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
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

		case "backspace":
			m.EscPressed = false
			if len(m.InputBuffer) > 0 {
				m.InputBuffer = m.InputBuffer[:len(m.InputBuffer)-1]
			}

		default:
			m.EscPressed = false
			// Add printable characters to input buffer
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

	// Render perfect banner using Lip Gloss engine
	s.WriteString(RenderBanner(m.Version))

	// Menu choices
	s.WriteString(Accent.Render("  📋  SELECTABLE MENU\n"))
	for i, choice := range m.Choices {
		if i == m.Cursor {
			s.WriteString(Primary.Render("    ❯ ") + Bright.Render(choice.Name) + "\n")
		} else {
			s.WriteString(Muted.Render("      " + choice.Name) + "\n")
		}
	}
	s.WriteString("\n")

	// Input buffer
	s.WriteString(Accent.Render("  ⌨️  COMMAND / SHORTCUT\n"))
	s.WriteString("      devD > " + Bright.Render(m.InputBuffer) + Muted.Render("_") + "\n\n")

	// Helper hints
	if m.EscPressed {
		s.WriteString(Warning.Render("     ⚠️  Press Escape again to quit / exit devD companion\n"))
	} else {
		s.WriteString(Muted.Render("     ▲/▼ Navigate menu  •  Type custom command / cd   •  Enter Confirm\n"))
	}

	return s.String()
}
