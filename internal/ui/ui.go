package ui

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

var (
	Primary = lipgloss.NewStyle().Foreground(lipgloss.Color("#cbd5e1"))
	Success = lipgloss.NewStyle().Foreground(lipgloss.Color("#34d399"))
	Warning = lipgloss.NewStyle().Foreground(lipgloss.Color("#fbbf24"))
	Error   = lipgloss.NewStyle().Foreground(lipgloss.Color("#f87171"))
	Muted   = lipgloss.NewStyle().Foreground(lipgloss.Color("#94a3b8"))
	Info    = lipgloss.NewStyle().Foreground(lipgloss.Color("#38bdf8"))
	Accent  = lipgloss.NewStyle().Foreground(lipgloss.Color("#818cf8"))
	Bright  = lipgloss.NewStyle().Foreground(lipgloss.Color("#ffffff")).Bold(true)
)

func GetProjectInfo() string {
	cwd, err := os.Getwd()
	if err != nil {
		return "unknown"
	}
	folderName := filepath.Base(cwd)

	// 1. Check package.json
	pkgPath := filepath.Join(cwd, "package.json")
	if data, err := os.ReadFile(pkgPath); err == nil {
		var pkg struct {
			Name    string `json:"name"`
			Version string `json:"version"`
		}
		if err := json.Unmarshal(data, &pkg); err == nil && pkg.Name != "" {
			if pkg.Version != "" {
				return fmt.Sprintf("%s v%s", pkg.Name, pkg.Version)
			}
			return pkg.Name
		}
	}

	// 2. Check pubspec.yaml (Flutter)
	pubspecPath := filepath.Join(cwd, "pubspec.yaml")
	if data, err := os.ReadFile(pubspecPath); err == nil {
		var name, version string
		lines := strings.Split(string(data), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "name:") {
				name = strings.TrimSpace(strings.TrimPrefix(line, "name:"))
			}
			if strings.HasPrefix(line, "version:") {
				version = strings.TrimSpace(strings.TrimPrefix(line, "version:"))
			}
		}
		if name != "" {
			if version != "" {
				return fmt.Sprintf("%s v%s", name, version)
			}
			return name
		}
	}

	return folderName
}

func RenderBanner(version string) string {
	var s strings.Builder
	
	rawInfo := GetProjectInfo()
	maxLen := 35
	projectStr := rawInfo
	if len(rawInfo) > maxLen {
		projectStr = rawInfo[:maxLen-3] + "..."
	}

	// Draw clean left vertical border lines for premium look
	s.WriteString(Muted.Render("  │  ") + Bright.Render("🚀  devD CLI v"+version) + "\n")
	s.WriteString(Muted.Render("  │  ") + Muted.Render("Accelerating Developer Workflows") + "\n")
	s.WriteString(Muted.Render("  │  ") + Accent.Render("📂  Workspace: "+projectStr) + "\n")
	s.WriteString("\n")
	return s.String()
}

func PrintBanner(version string) {
	fmt.Print("\033[H\033[2J") // Clear terminal screen and reset cursor
	fmt.Print(RenderBanner(version))
}

func PressEnterToContinue() {
	fmt.Println()
	fmt.Print(Muted.Render("Press Enter to return to main menu..."))
	reader := bufio.NewReader(os.Stdin)
	_, _ = reader.ReadString('\n')
}
