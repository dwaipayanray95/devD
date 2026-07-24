package ui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/spinner"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type spinnerTaskMsg struct {
	result string
	err    error
}

type SpinnerTaskModel struct {
	Title   string
	TaskFn  func() (string, error)
	Spinner spinner.Model
	Done    bool
	Result  string
	Err     error
}

func NewSpinnerTaskModel(title string, taskFn func() (string, error)) SpinnerTaskModel {
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(lipgloss.Color("#818cf8"))

	return SpinnerTaskModel{
		Title:   title,
		TaskFn:  taskFn,
		Spinner: s,
	}
}

func (m SpinnerTaskModel) Init() tea.Cmd {
	return tea.Batch(
		m.Spinner.Tick,
		func() tea.Msg {
			res, err := m.TaskFn()
			return spinnerTaskMsg{result: res, err: err}
		},
	)
}

func (m SpinnerTaskModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case spinnerTaskMsg:
		m.Done = true
		m.Result = msg.result
		m.Err = msg.err
		return m, tea.Quit

	case tea.KeyMsg:
		if msg.String() == "ctrl+c" || msg.String() == "esc" {
			m.Done = true
			m.Err = fmt.Errorf("CANCELLED")
			return m, tea.Quit
		}

	default:
		var cmd tea.Cmd
		m.Spinner, cmd = m.Spinner.Update(msg)
		return m, cmd
	}
	return m, nil
}

func (m SpinnerTaskModel) View() string {
	if m.Done {
		return ""
	}
	var s strings.Builder
	s.WriteString(RenderBanner(Version))
	s.WriteString(RenderDivider("Processing", 54) + "\n\n")
	s.WriteString(fmt.Sprintf("   %s %s...\n\n", m.Spinner.View(), Bright.Render(m.Title)))
	s.WriteString(Dim.Render("  ────────────────────────────────────────────────────") + "\n")
	s.WriteString("   " + Muted.Render("Please wait") + Dim.Render("  ·  ") + Muted.Render("esc cancel") + "\n")
	return s.String()
}

func RunTaskWithSpinner(title string, taskFn func() (string, error)) (string, error) {
	fmt.Print("\033[H\033[2J")
	m := NewSpinnerTaskModel(title, taskFn)
	p := tea.NewProgram(m)
	finalModel, err := p.Run()
	if err != nil {
		return "", err
	}
	if sm, ok := finalModel.(SpinnerTaskModel); ok {
		return sm.Result, sm.Err
	}
	return "", fmt.Errorf("unknown spinner model state")
}
