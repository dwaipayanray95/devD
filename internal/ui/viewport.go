package ui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type ViewportModel struct {
	Title    string
	Content  string
	Viewport viewport.Model
	Ready    bool
}

func NewViewportModel(title, content string) ViewportModel {
	vp := viewport.New(65, 20)
	vp.Style = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(BorderColor).
		Padding(0, 1)

	vp.SetContent(content)

	return ViewportModel{
		Title:    title,
		Content:  content,
		Viewport: vp,
		Ready:    true,
	}
}

func (m ViewportModel) Init() tea.Cmd {
	return nil
}

func (m ViewportModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.Viewport.Width = msg.Width - 4
		if m.Viewport.Width < 20 {
			m.Viewport.Width = 20
		}
		m.Viewport.Height = msg.Height - 10
		if m.Viewport.Height < 5 {
			m.Viewport.Height = 5
		}

	case tea.KeyMsg:
		switch msg.String() {
		case "q", "esc", "ctrl+c", "enter":
			return m, tea.Quit
		}
	}

	var cmd tea.Cmd
	m.Viewport, cmd = m.Viewport.Update(msg)
	return m, cmd
}

func (m ViewportModel) View() string {
	var s strings.Builder
	s.WriteString(RenderBanner(Version))
	s.WriteString(RenderDivider(m.Title, 54) + "\n\n")
	s.WriteString(m.Viewport.View() + "\n\n")
	s.WriteString(Dim.Render("  ────────────────────────────────────────────────────") + "\n")
	s.WriteString("   " + Muted.Render("↑/↓ / j/k / pgup/pgdn scroll") + Dim.Render("  ·  ") + Muted.Render("q/esc exit") + "\n")
	return s.String()
}

func ShowViewport(title, content string) {
	fmt.Print("\033[H\033[2J\033[3J")
	m := NewViewportModel(title, content)
	p := tea.NewProgram(m)
	_, _ = p.Run()
	fmt.Print("\033[H\033[2J\033[3J")
}
