package ui

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
)

// Declare a global or package-level version hook that gets set on start
var Version = "1.1.0"

type NavigatorModel struct {
	CurrentDir   string
	Entries      []fs.DirEntry
	Cursor       int
	Confirmed    bool
	Canceled     bool
	Error        error
	SearchBuffer string
	LastKeyTime  time.Time
}

func NewNavigatorModel(startDir string) NavigatorModel {
	absStart, err := filepath.Abs(startDir)
	if err != nil {
		absStart = startDir
	}
	m := NavigatorModel{
		CurrentDir: absStart,
		Cursor:     0,
	}
	m.readDir()
	return m
}

func (m *NavigatorModel) readDir() {
	entries, err := os.ReadDir(m.CurrentDir)
	if err != nil {
		m.Error = err
		m.Entries = []fs.DirEntry{}
		return
	}
	m.Error = nil

	var dirs []fs.DirEntry
	for _, entry := range entries {
		if entry.IsDir() {
			dirs = append(dirs, entry)
		}
	}
	m.Entries = dirs

	// Reset cursor or cap it (we have 2 static items at index 0 and 1)
	if m.Cursor >= len(m.Entries)+2 {
		m.Cursor = 0
	}
}

func (m NavigatorModel) Init() tea.Cmd {
	return nil
}

func (m NavigatorModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		keyStr := msg.String()
		switch keyStr {
		case "ctrl+c", "esc":
			m.Canceled = true
			return m, tea.Quit

		case "up":
			m.Cursor--
			total := len(m.Entries) + 2
			if m.Cursor < 0 {
				m.Cursor = total - 1
			}

		case "down":
			m.Cursor++
			total := len(m.Entries) + 2
			if m.Cursor >= total {
				m.Cursor = 0
			}

		case "space", "enter":
			if m.Cursor == 0 {
				// Confirm selection of the current folder
				m.Confirmed = true
				return m, tea.Quit
			} else if m.Cursor == 1 {
				// Navigate up
				parent := filepath.Dir(m.CurrentDir)
				m.CurrentDir = parent
				m.Cursor = 0
				m.readDir()
			} else {
				// Navigate into the subdirectory
				target := filepath.Join(m.CurrentDir, m.Entries[m.Cursor-2].Name())
				m.CurrentDir = target
				m.Cursor = 0
				m.readDir()
			}

		default:
			// Supporting fast folder snapping:
			if len(keyStr) == 1 {
				now := time.Now()
				if now.Sub(m.LastKeyTime) > 800*time.Millisecond {
					m.SearchBuffer = ""
				}
				m.SearchBuffer += strings.ToLower(keyStr)
				m.LastKeyTime = now

				// Look for any subdirectory matching the search buffer prefix
				for i, entry := range m.Entries {
					name := strings.ToLower(entry.Name())
					if strings.HasPrefix(name, m.SearchBuffer) {
						m.Cursor = i + 2 // +2 because index 0 is "Select" and 1 is "Go up"
						break
					}
				}
			}
		}
	}
	return m, nil
}

func (m NavigatorModel) View() string {
	var s strings.Builder
	s.WriteString(RenderBanner(Version))

	// Path breadcrumb
	s.WriteString(RenderDivider("Navigate", 54) + "\n")
	s.WriteString("   " + Dim.Render("◆ ") + Accent.Render(m.CurrentDir) + "\n\n")

	if m.Error != nil {
		s.WriteString("   " + Error.Render(fmt.Sprintf("Error reading directory: %v", m.Error)) + "\n\n")
		s.WriteString("   " + Muted.Render("Press Esc to cancel") + "\n")
		return s.String()
	}

	// Option 0: Confirm selection of current directory
	if m.Cursor == 0 {
		s.WriteString("   " + Accent.Render("▌") + " " + Success.Render("✔") + "  " + Bright.Render("Select this folder ("+filepath.Base(m.CurrentDir)+")") + "\n")
	} else {
		s.WriteString("     " + Dim.Render("✔") + "  " + Muted.Render("Select this folder ("+filepath.Base(m.CurrentDir)+")") + "\n")
	}

	// Option 1: .. (Go Up / Go Back)
	if m.Cursor == 1 {
		s.WriteString("   " + Accent.Render("▌") + " " + Info.Render("◁") + "  " + Bright.Render(".. (Parent Directory)") + "\n")
	} else {
		s.WriteString("     " + Dim.Render("◁") + "  " + Muted.Render(".. (Parent Directory)") + "\n")
	}

	// Directories (offset by 2)
	for i, entry := range m.Entries {
		idx := i + 2
		name := entry.Name()
		if idx == m.Cursor {
			s.WriteString("   " + Accent.Render("▌") + " " + Accent.Render("▸") + "  " + Bright.Render(name) + "\n")
		} else {
			s.WriteString("     " + Dim.Render("▸") + "  " + Muted.Render(name) + "\n")
		}
	}

	s.WriteString("\n" + Dim.Render("  ────────────────────────────────────────────────────") + "\n")
	s.WriteString("   " + Muted.Render("↑↓ navigate") + Dim.Render("  ·  ") +
		Muted.Render("enter select") + Dim.Render("  ·  ") +
		Muted.Render("type to jump") + Dim.Render("  ·  ") +
		Muted.Render("esc cancel") + "\n")

	return s.String()
}
