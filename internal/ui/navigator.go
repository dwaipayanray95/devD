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

	// Filter or order? Usually we want directory first, or at least we want to show dirs.
	// Let's filter to only directories since we are cd-ing (changing directory).
	var dirs []fs.DirEntry
	for _, entry := range entries {
		if entry.IsDir() {
			dirs = append(dirs, entry)
		}
	}
	m.Entries = dirs
	
	// Reset cursor or cap it
	if m.Cursor >= len(m.Entries)+1 { // +1 for the ".." go up option
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
			total := len(m.Entries) + 1 // +1 for ".."
			if m.Cursor < 0 {
				m.Cursor = total - 1
			}

		case "down":
			m.Cursor++
			total := len(m.Entries) + 1 // +1 for ".."
			if m.Cursor >= total {
				m.Cursor = 0
			}

		case "space", "enter":
			// space or enter confirms selection or navigates.
			// In standard folder navigator:
			// - Enter on a directory navigates into it.
			// - Enter on ".." navigates up.
			// - Space/Enter can also confirm/CD if we want. Wait, the user prompt comments:
			//   "confirm/CD" using Space or Enter.
			//   Let's check the spec: "Enter: Navigate into folder or confirm current path selection.", "Space: Select the highlighted folder and exit."
			//   So Space selects the highlighted folder and exits.
			//   Enter on a directory navigates inside. If they want to confirm the current directory, how do they do that?
			//   Let's check: "Space: Select the highlighted folder and exit." or maybe Enter on a special option or Space at any point to select the highlighted folder (or the current folder if on "..").
			if keyStr == "space" {
				// Confirm selection
				if m.Cursor == 0 {
					// We are on ".." (Parent directory)
					// In this context, space on ".." can select the current directory, or parent directory.
					// Let's select the current directory as the choice.
					m.Confirmed = true
					return m, tea.Quit
				} else {
					// Select the highlighted subdirectory
					target := filepath.Join(m.CurrentDir, m.Entries[m.Cursor-1].Name())
					m.CurrentDir = target
					m.Confirmed = true
					return m, tea.Quit
				}
			} else { // "enter"
				if m.Cursor == 0 {
					// Navigate up
					parent := filepath.Dir(m.CurrentDir)
					m.CurrentDir = parent
					m.Cursor = 0
					m.readDir()
				} else {
					// Navigate into the subdirectory
					target := filepath.Join(m.CurrentDir, m.Entries[m.Cursor-1].Name())
					m.CurrentDir = target
					m.Cursor = 0
					m.readDir()
				}
			}

		default:
			// Supporting fast folder snapping:
			// Accumulate characters if they are pressed within 800ms of each other.
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
						m.Cursor = i + 1 // +1 because index 0 is ".."
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
	
	s.WriteString(Accent.Render(fmt.Sprintf("  📂  CD Navigator: %s\n\n", m.CurrentDir)))

	if m.Error != nil {
		s.WriteString(Error.Render(fmt.Sprintf("  Error reading directory: %v\n\n", m.Error)))
		s.WriteString(Muted.Render("  Press Esc to cancel\n"))
		return s.String()
	}

	// Option 0: .. (Go Up)
	if m.Cursor == 0 {
		s.WriteString(Primary.Render("    ❯ ") + Bright.Render(".. (Parent Directory)") + "\n")
	} else {
		s.WriteString(Muted.Render("      .. (Parent Directory)") + "\n")
	}

	// Directories
	for i, entry := range m.Entries {
		idx := i + 1
		name := entry.Name()
		if idx == m.Cursor {
			s.WriteString(Primary.Render("    ❯ ") + Bright.Render("📁 "+name) + "\n")
		} else {
			s.WriteString(Muted.Render("      📁 "+name) + "\n")
		}
	}

	s.WriteString("\n")
	s.WriteString(Muted.Render("  ▲/▼ Navigate  •  Enter Open/Go Up  •  Space Confirm/CD highlighted  •  Letter Jump  •  Esc Cancel\n"))

	return s.String()
}
