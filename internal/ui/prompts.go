package ui

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
)

// ==========================================
// 1. SELECT PROMPT
// ==========================================

type SelectModel struct {
	Title         string
	Choices       []string
	Cursor        int
	Chosen        string
	Cancelled     bool
	TerminalWidth int
}

func (m SelectModel) Init() tea.Cmd {
	return nil
}

func (m SelectModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.TerminalWidth = msg.Width

	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c":
			m.Cancelled = true
			return m, tea.Quit
		case "esc":
			m.Cancelled = true
			return m, tea.Quit
		case "up":
			m.Cursor--
			if m.Cursor < 0 {
				m.Cursor = len(m.Choices) - 1
			}
		case "down":
			m.Cursor++
			if m.Cursor >= len(m.Choices) {
				m.Cursor = 0
			}
		case "enter":
			m.Chosen = m.Choices[m.Cursor]
			return m, tea.Quit
		}
	}
	return m, nil
}

func (m SelectModel) View() string {
	var s strings.Builder

	s.WriteString("\033[H\033[2J\033[3J") // Clear scrollback to prevent top line cut-off
	s.WriteString(RenderBanner(Version))
	s.WriteString(RenderDivider(m.Title, 54) + "\n\n")

	wrapWidth := m.TerminalWidth - 10
	if wrapWidth < 20 {
		wrapWidth = 50 // sensible fallback
	}

	for i, choice := range m.Choices {
		wrappedChoice := WrapText(choice, wrapWidth)
		lines := strings.Split(wrappedChoice, "\n")
		
		if i == m.Cursor {
			for idx, line := range lines {
				if idx == 0 {
					s.WriteString("   " + Highlight.Render(" "+line+" ") + "\n")
				} else {
					s.WriteString("     " + Highlight.Render(" "+line+" ") + "\n")
				}
			}
		} else {
			for idx, line := range lines {
				if idx == 0 {
					s.WriteString("     " + Muted.Render(line) + "\n")
				} else {
					s.WriteString("       " + Muted.Render(line) + "\n")
				}
			}
		}
	}

	s.WriteString("\n" + Dim.Render("  ────────────────────────────────────────────────────") + "\n")
	s.WriteString("   " + Muted.Render("↑↓ navigate") + Dim.Render("  ·  ") +
		Muted.Render("enter select") + Dim.Render("  ·  ") +
		Muted.Render("esc cancel") + "\n")
	return s.String()
}

func PromptSelect(title string, choices []string) (string, error) {
	m := SelectModel{
		Title:   title,
		Choices: choices,
	}
	p := tea.NewProgram(m, tea.WithAltScreen())
	resModel, err := p.Run()
	if err != nil {
		return "", err
	}
	finalModel := resModel.(SelectModel)
	if finalModel.Cancelled {
		return "", fmt.Errorf("ESCAPE_CANCELLED")
	}
	return finalModel.Chosen, nil
}

// ==========================================
// 2. INPUT PROMPT
// ==========================================

type InputModel struct {
	Title         string
	Value         string
	DefaultValue  string
	Cancelled     bool
	TerminalWidth int
	CursorIdx     int // Character index cursor position
}

func (m InputModel) Init() tea.Cmd {
	return nil
}

func (m InputModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.TerminalWidth = msg.Width

	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c":
			m.Cancelled = true
			return m, tea.Quit
		case "esc":
			m.Cancelled = true
			return m, tea.Quit
		case "enter":
			if strings.TrimSpace(m.Value) == "" {
				m.Value = m.DefaultValue
			}
			return m, tea.Quit
		case "left":
			if m.CursorIdx > 0 {
				m.CursorIdx--
			}
			return m, nil

		case "right":
			runes := []rune(m.Value)
			if m.CursorIdx < len(runes) {
				m.CursorIdx++
			}
			return m, nil

		case "backspace":
			runes := []rune(m.Value)
			if m.CursorIdx > 0 {
				m.Value = string(runes[:m.CursorIdx-1]) + string(runes[m.CursorIdx:])
				m.CursorIdx--
			}

		default:
			// Ignore vertical navigation keys in prompt entry
			keyStr := msg.String()
			if keyStr == "up" || keyStr == "down" {
				return m, nil
			}
			// Strip bracketed paste control codes (\x1b[200~, \x1b[201~, [200~, [201~, 200~, 201~, and raw brackets if surrounded by paste sequences)
			keyStr = strings.ReplaceAll(keyStr, "\x1b[200~", "")
			keyStr = strings.ReplaceAll(keyStr, "\x1b[201~", "")
			keyStr = strings.ReplaceAll(keyStr, "\x1b[", "")
			keyStr = strings.ReplaceAll(keyStr, "[200~", "")
			keyStr = strings.ReplaceAll(keyStr, "[201~", "")
			keyStr = strings.ReplaceAll(keyStr, "200~", "")
			keyStr = strings.ReplaceAll(keyStr, "201~", "")
			keyStr = strings.TrimPrefix(keyStr, "[")
			keyStr = strings.TrimSuffix(keyStr, "]")
			keyStr = strings.TrimSuffix(keyStr, "~")

			// Accept clean string input
			if keyStr != "" {
				runes := []rune(m.Value)
				insertedRunes := []rune(keyStr)
				m.Value = string(runes[:m.CursorIdx]) + keyStr + string(runes[m.CursorIdx:])
				m.CursorIdx += len(insertedRunes)
			}
		}
	}
	return m, nil
}

func (m InputModel) View() string {
	var s strings.Builder

	s.WriteString("\033[H\033[2J\033[3J") // Clear scrollback to prevent top line cut-off
	s.WriteString(RenderBanner(Version))
	s.WriteString(RenderDivider(m.Title, 54) + "\n\n")

	wrapWidth := m.TerminalWidth - 8
	if wrapWidth < 25 {
		wrapWidth = 25
	}

	var displayInput strings.Builder
	if m.Value == "" {
		placeholder := "Type here..."
		if m.DefaultValue != "" {
			placeholder = m.DefaultValue + " (default)"
		}
		wrappedInput := WrapText(placeholder, wrapWidth)
		wrappedLines := strings.Split(wrappedInput, "\n")
		for idx, line := range wrappedLines {
			if idx == 0 {
				displayInput.WriteString("   " + Accent.Render("❯") + " " + Dim.Render(line))
			} else {
				displayInput.WriteString("\n     " + Dim.Render(line))
			}
		}
	} else {
		runes := []rune(m.Value)
		var cursorBuffer strings.Builder
		for i := 0; i <= len(runes); i++ {
			if i == m.CursorIdx {
				if i < len(runes) {
					cursorBuffer.WriteString(Highlight.Render(string(runes[i])))
				} else {
					cursorBuffer.WriteString(Highlight.Render(" "))
				}
			} else if i < len(runes) {
				cursorBuffer.WriteString(Bright.Render(string(runes[i])))
			}
		}
		wrappedInput := WrapText(cursorBuffer.String(), wrapWidth)
		wrappedLines := strings.Split(wrappedInput, "\n")
		for idx, line := range wrappedLines {
			if idx == 0 {
				displayInput.WriteString("   " + Accent.Render("❯") + " " + line)
			} else {
				displayInput.WriteString("\n     " + line)
			}
		}
	}
	s.WriteString(displayInput.String() + "\n")

	s.WriteString("\n" + Dim.Render("  ────────────────────────────────────────────────────") + "\n")
	s.WriteString("   " + Muted.Render("enter confirm") + Dim.Render("  ·  ") +
		Muted.Render("esc cancel") + "\n")
	return s.String()
}

func PromptInput(title string, defaultValue string) (string, error) {
	m := InputModel{
		Title:         title,
		DefaultValue:  defaultValue,
		TerminalWidth: 65, // default fallback width
	}
	p := tea.NewProgram(m, tea.WithAltScreen())
	resModel, err := p.Run()
	if err != nil {
		return "", err
	}
	finalModel := resModel.(InputModel)
	if finalModel.Cancelled {
		return "", fmt.Errorf("ESCAPE_CANCELLED")
	}
	return strings.TrimSpace(finalModel.Value), nil
}

// ==========================================
// 3. CONFIRM PROMPT
// ==========================================

type ConfirmModel struct {
	Title        string
	Value        bool
	DefaultValue bool
	Cancelled    bool
}

func (m ConfirmModel) Init() tea.Cmd {
	return nil
}

func (m ConfirmModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c":
			m.Cancelled = true
			return m, tea.Quit
		case "esc":
			m.Cancelled = true
			return m, tea.Quit
		case "y", "Y":
			m.Value = true
			return m, tea.Quit
		case "n", "N":
			m.Value = false
			return m, tea.Quit
		case "enter":
			m.Value = m.DefaultValue
			return m, tea.Quit
		case "left", "right":
			m.DefaultValue = !m.DefaultValue
		}
	}
	return m, nil
}

func (m ConfirmModel) View() string {
	var s strings.Builder

	s.WriteString(RenderBanner(Version))
	s.WriteString(RenderDivider(m.Title, 54) + "\n\n")

	if m.DefaultValue {
		s.WriteString("   " + Highlight.Render("  Yes  ") + "    " + Muted.Render("  No  ") + "\n")
	} else {
		s.WriteString("   " + Muted.Render("  Yes  ") + "    " + Highlight.Render("  No  ") + "\n")
	}

	s.WriteString("\n" + Dim.Render("  ────────────────────────────────────────────────────") + "\n")
	s.WriteString("   " + Muted.Render("y/n") + Dim.Render("  ·  ") +
		Muted.Render("←→ toggle") + Dim.Render("  ·  ") +
		Muted.Render("enter confirm") + Dim.Render("  ·  ") +
		Muted.Render("esc cancel") + "\n")
	return s.String()
}

func PromptConfirm(title string, defaultValue bool) (bool, error) {
	m := ConfirmModel{
		Title:        title,
		DefaultValue: defaultValue,
		Value:        defaultValue,
	}
	p := tea.NewProgram(m, tea.WithAltScreen())
	resModel, err := p.Run()
	if err != nil {
		return false, err
	}
	finalModel := resModel.(ConfirmModel)
	if finalModel.Cancelled {
		return false, fmt.Errorf("ESCAPE_CANCELLED")
	}
	return finalModel.Value, nil
}
