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
	Title     string
	Choices   []string
	Cursor    int
	Chosen    string
	Cancelled bool
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

	s.WriteString(RenderBanner(Version))
	s.WriteString(RenderDivider(m.Title, 54) + "\n\n")

	for i, choice := range m.Choices {
		if i == m.Cursor {
			s.WriteString("   " + Accent.Render("▌") + " " + Bright.Render(choice) + "\n")
		} else {
			s.WriteString("     " + Muted.Render(choice) + "\n")
		}
	}

	s.WriteString("\n" + Dim.Render("  ────────────────────────────────────────────────────") + "\n")
	s.WriteString("   " + Muted.Render("↑↓ navigate") + Dim.Render("  ·  ") +
		Muted.Render("enter select") + Dim.Render("  ·  ") +
		Muted.Render("esc cancel") + "\n")
	return s.String()
}

func PromptSelect(title string, choices []string) (string, error) {
	fmt.Print("\033[H\033[2J") // Clear console screen
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
	Title         string
	Value         string
	DefaultValue  string
	Cancelled     bool
	TerminalWidth int
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
		case "backspace":
			if len(m.Value) > 0 {
				runes := []rune(m.Value)
				m.Value = string(runes[:len(runes)-1])
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

	s.WriteString(RenderBanner(Version))
	s.WriteString(RenderDivider(m.Title, 54) + "\n")
	if m.DefaultValue != "" {
		s.WriteString("   " + Dim.Render("default: "+m.DefaultValue) + "\n")
	}
	s.WriteString("\n")

	displayVal := m.Value
	if displayVal == "" && m.DefaultValue != "" {
		displayVal = m.DefaultValue
	}

	wrapWidth := m.TerminalWidth - 7
	if wrapWidth < 20 {
		wrapWidth = 50 // sensible default
	}

	wrappedInput := WrapText(displayVal, wrapWidth)
	wrappedLines := strings.Split(wrappedInput, "\n")
	var displayInput strings.Builder
	for idx, line := range wrappedLines {
		if displayVal == m.DefaultValue {
			if idx == 0 {
				displayInput.WriteString("   " + Accent.Render("❯") + " " + Dim.Render(line))
			} else {
				displayInput.WriteString("\n     " + Dim.Render(line))
			}
		} else {
			if idx == 0 {
				displayInput.WriteString("   " + Accent.Render("❯") + " " + Bright.Render(line))
			} else {
				displayInput.WriteString("\n     " + Bright.Render(line))
			}
		}
	}
	s.WriteString(displayInput.String() + Dim.Render("▏") + "\n")

	s.WriteString("\n" + Dim.Render("  ────────────────────────────────────────────────────") + "\n")
	s.WriteString("   " + Muted.Render("enter confirm") + Dim.Render("  ·  ") +
		Muted.Render("esc cancel") + "\n")
	return s.String()
}

func PromptInput(title string, defaultValue string) (string, error) {
	fmt.Print("\033[H\033[2J") // Clear console screen
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
	fmt.Print("\033[H\033[2J") // Clear console screen
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
