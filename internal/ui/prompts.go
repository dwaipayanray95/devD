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
	Title      string
	Choices    []string
	Cursor     int
	Chosen     string
	Cancelled  bool
	EscPressed bool
}

func (m SelectModel) Init() tea.Cmd {
	return nil
}

func (m SelectModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
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
	s.WriteString(Accent.Render("  │  ") + Bright.Render(m.Title) + "\n")
	s.WriteString(Muted.Render("  │") + "\n")

	for i, choice := range m.Choices {
		if i == m.Cursor {
			s.WriteString(Primary.Render("    ❯ ") + Bright.Render(choice) + "\n")
		} else {
			s.WriteString(Muted.Render("      " + choice) + "\n")
		}
	}
	s.WriteString("\n" + Muted.Render("     ▲/▼ Navigate  •  Enter Select  •  Esc Cancel") + "\n")
	return s.String()
}

func PromptSelect(title string, choices []string) (string, error) {
	m := SelectModel{
		Title:   title,
		Choices: choices,
	}
	p := tea.NewProgram(m)
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
	Title        string
	Value        string
	DefaultValue string
	Cancelled    bool
}

func (m InputModel) Init() tea.Cmd {
	return nil
}

func (m InputModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
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
		case "backspace":
			if len(m.Value) > 0 {
				m.Value = m.Value[:len(m.Value)-1]
			}
		default:
			if len(msg.String()) == 1 {
				m.Value += msg.String()
			}
		}
	}
	return m, nil
}

func (m InputModel) View() string {
	var s strings.Builder
	s.WriteString(Accent.Render("  │  ") + Bright.Render(m.Title) + "\n")
	if m.DefaultValue != "" {
		s.WriteString(Muted.Render("  │  Default: ") + Muted.Render(m.DefaultValue) + "\n")
	}
	s.WriteString(Muted.Render("  │") + "\n")

	displayVal := m.Value
	if displayVal == "" && m.DefaultValue != "" {
		displayVal = Muted.Render(m.DefaultValue)
	} else {
		displayVal = Bright.Render(displayVal)
	}

	s.WriteString("    " + displayVal + Muted.Render("_") + "\n\n")
	s.WriteString(Muted.Render("     Enter Confirm  •  Esc Cancel") + "\n")
	return s.String()
}

func PromptInput(title string, defaultValue string) (string, error) {
	m := InputModel{
		Title:        title,
		DefaultValue: defaultValue,
	}
	p := tea.NewProgram(m)
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
	s.WriteString(Accent.Render("  │  ") + Bright.Render(m.Title) + "\n")
	s.WriteString(Muted.Render("  │") + "\n")

	yesStr := " Yes "
	noStr := " No "

	if m.DefaultValue {
		yesStr = Bright.Render("[ Yes ]")
		noStr = Muted.Render("  No  ")
	} else {
		yesStr = Muted.Render("  Yes  ")
		noStr = Bright.Render("[ No ]")
	}

	s.WriteString("    " + yesStr + "  " + noStr + "\n\n")
	s.WriteString(Muted.Render("     y/n  •  ◀/▶ Toggle  •  Enter Confirm  •  Esc Cancel") + "\n")
	return s.String()
}

func PromptConfirm(title string, defaultValue bool) (bool, error) {
	m := ConfirmModel{
		Title:        title,
		DefaultValue: defaultValue,
		Value:        defaultValue,
	}
	p := tea.NewProgram(m)
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
