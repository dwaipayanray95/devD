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
	rawInfo := GetProjectInfo()
	maxLen := 40
	projectStr := rawInfo
	if len(rawInfo) > maxLen {
		projectStr = rawInfo[:maxLen-3] + "..."
	}

	width := 56

	borderStyle := lipgloss.NewStyle().
		Border(lipgloss.DoubleBorder()).
		BorderForeground(lipgloss.Color("#818cf8")).
		Width(width)

	title := "🚀  devD CLI v" + version
	titleStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#ffffff")).Bold(true)
	titleCellWidth := lipgloss.Width(title)
	titlePadding := (width - titleCellWidth) / 2
	if titlePadding < 0 {
		titlePadding = 0
	}
	titleLine := strings.Repeat(" ", titlePadding) + titleStyle.Render(title)

	subtitle := "Accelerating Developer Workflows"
	subtitleStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#94a3b8"))
	subCellWidth := lipgloss.Width(subtitle)
	subPadding := (width - subCellWidth) / 2
	if subPadding < 0 {
		subPadding = 0
	}
	subtitleLine := strings.Repeat(" ", subPadding) + subtitleStyle.Render(subtitle)

	workspaceLine := " 📂  Workspace: " + Accent.Render(projectStr)

	dividerStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#818cf8"))
	dividerLine := dividerStyle.Render(strings.Repeat("═", width))

	boxContent := titleLine + "\n" + subtitleLine + "\n" + dividerLine + "\n" + workspaceLine

	return borderStyle.Render(boxContent) + "\n\n"
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
