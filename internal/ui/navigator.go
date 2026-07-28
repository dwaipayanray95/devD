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
	Drives       []string
	IsRootDrives bool
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

func getAvailableDrives() []string {
	var drives []string
	if os.Getenv("OS") == "Windows_NT" || strings.ToLower(os.Getenv("OS")) == "windows" {
		for _, drive := range "ABCDEFGHIJKLMNOPQRSTUVWXYZ" {
			d := string(drive) + ":\\"
			if _, err := os.Stat(d); err == nil {
				drives = append(drives, d)
			}
		}
	} else {
		drives = append(drives, "/")
	}
	return drives
}

func (m *NavigatorModel) readDir() {
	if m.IsRootDrives {
		m.Error = nil
		m.Entries = []fs.DirEntry{}
		m.Drives = getAvailableDrives()
		if m.Cursor >= len(m.Drives)+1 {
			m.Cursor = 0
		}
		return
	}

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

	// Reset cursor or cap it (static items: index 0 is Select, 1 is Parent Directory)
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
			if m.IsRootDrives {
				total = len(m.Drives) + 1
			}
			if m.Cursor < 0 {
				m.Cursor = total - 1
			}

		case "down":
			m.Cursor++
			total := len(m.Entries) + 2
			if m.IsRootDrives {
				total = len(m.Drives) + 1
			}
			if m.Cursor >= total {
				m.Cursor = 0
			}

		case "space", "enter":
			if m.IsRootDrives {
				if m.Cursor == 0 {
					// Cancel drive selection
					m.Canceled = true
					return m, tea.Quit
				}
				// Switch to selected drive
				m.CurrentDir = m.Drives[m.Cursor-1]
				m.IsRootDrives = false
				m.Cursor = 0
				m.readDir()
				return m, nil
			}

			if m.Cursor == 0 {
				// Confirm selection of the current folder
				m.Confirmed = true
				return m, tea.Quit
			} else if m.Cursor == 1 {
				// Navigate up
				parent := filepath.Dir(m.CurrentDir)
				if parent == m.CurrentDir || parent == "." || parent == "" {
					// We reached root! On Windows or Unix, show drives list
					m.IsRootDrives = true
					m.Cursor = 0
					m.readDir()
				} else {
					m.CurrentDir = parent
					m.Cursor = 0
					m.readDir()
				}
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

	if m.IsRootDrives {
		s.WriteString(RenderDivider("Select Hard Drive", 54) + "\n")
		s.WriteString("   " + Dim.Render("◆ ") + Accent.Render("Local System Hard Drives") + "\n\n")

		if m.Cursor == 0 {
			s.WriteString("   " + Highlight.Render(" ◁  Cancel Drive Selection ") + "\n")
		} else {
			s.WriteString("     " + Dim.Render("◁") + "  " + Muted.Render("Cancel Drive Selection") + "\n")
		}

		for i, drive := range m.Drives {
			idx := i + 1
			if idx == m.Cursor {
				s.WriteString("   " + Highlight.Render(" 🖴  "+drive+" (Local Disk) ") + "\n")
			} else {
				s.WriteString("     " + Dim.Render("🖴") + "  " + Muted.Render(drive+" (Local Disk)") + "\n")
			}
		}

		s.WriteString("\n" + Dim.Render("  ────────────────────────────────────────────────────") + "\n")
		s.WriteString("   " + Muted.Render("↑↓ navigate") + Dim.Render("  ·  ") +
			Muted.Render("enter select drive") + Dim.Render("  ·  ") +
			Muted.Render("esc cancel") + "\n")

		return s.String()
	}

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
		s.WriteString("   " + Highlight.Render(" ✔  Select this folder ("+filepath.Base(m.CurrentDir)+") ") + "\n")
	} else {
		s.WriteString("     " + Dim.Render("✔") + "  " + Muted.Render("Select this folder ("+filepath.Base(m.CurrentDir)+")") + "\n")
	}

	// Option 1: .. (Go Up / Go Back to Root / Drives)
	if m.Cursor == 1 {
		s.WriteString("   " + Highlight.Render(" ◁  .. (Parent Directory / Local Drives) ") + "\n")
	} else {
		s.WriteString("     " + Dim.Render("◁") + "  " + Muted.Render(".. (Parent Directory / Local Drives)") + "\n")
	}

	// Directories (offset by 2)
	for i, entry := range m.Entries {
		idx := i + 2
		name := entry.Name()
		if idx == m.Cursor {
			s.WriteString("   " + Highlight.Render(" ▸  "+name+" ") + "\n")
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
