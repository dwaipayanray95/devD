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
	BorderColor = lipgloss.Color("#818cf8")
	AppBg       = "" // Empty means transparent/default terminal background
)

type ThemePalette struct {
	Primary    string
	Success    string
	Warning    string
	Error      string
	Muted      string
	Info       string
	Accent     string
	Bright     string
	Border     string
	Background string
}

var DarkTheme = ThemePalette{
	Primary:    "#cbd5e1",
	Success:    "#34d399",
	Warning:    "#fbbf24",
	Error:      "#f87171",
	Muted:      "#94a3b8",
	Info:       "#38bdf8",
	Accent:     "#818cf8",
	Bright:     "#ffffff",
	Border:     "#818cf8",
	Background: "", // Transparent dark fallback
}

var LightTheme = ThemePalette{
	Primary:    "#334155",
	Success:    "#16a34a",
	Warning:    "#ea580c",
	Error:      "#dc2626",
	Muted:      "#475569",
	Info:       "#0284c7",
	Accent:     "#4f46e5",
	Bright:     "#0f172a",
	Border:     "#4f46e5",
	Background: "#fafaf9", // Premium warm off-white cream
}

func InitTheme(themeMode string) {
	palette := DarkTheme
	if themeMode == "light" {
		palette = LightTheme
	} else if themeMode == "system" {
		if lipgloss.HasDarkBackground() {
			palette = DarkTheme
		} else {
			palette = LightTheme
		}
	}

	AppBg = palette.Background

	// Set foregrounds and backgrounds
	if AppBg != "" {
		bgCol := lipgloss.Color(AppBg)
		Primary = lipgloss.NewStyle().Foreground(lipgloss.Color(palette.Primary)).Background(bgCol)
		Success = lipgloss.NewStyle().Foreground(lipgloss.Color(palette.Success)).Background(bgCol)
		Warning = lipgloss.NewStyle().Foreground(lipgloss.Color(palette.Warning)).Background(bgCol)
		Error = lipgloss.NewStyle().Foreground(lipgloss.Color(palette.Error)).Background(bgCol)
		Muted = lipgloss.NewStyle().Foreground(lipgloss.Color(palette.Muted)).Background(bgCol)
		Info = lipgloss.NewStyle().Foreground(lipgloss.Color(palette.Info)).Background(bgCol)
		Accent = lipgloss.NewStyle().Foreground(lipgloss.Color(palette.Accent)).Background(bgCol)
		Bright = lipgloss.NewStyle().Foreground(lipgloss.Color(palette.Bright)).Background(bgCol).Bold(true)
	} else {
		Primary = lipgloss.NewStyle().Foreground(lipgloss.Color(palette.Primary))
		Success = lipgloss.NewStyle().Foreground(lipgloss.Color(palette.Success))
		Warning = lipgloss.NewStyle().Foreground(lipgloss.Color(palette.Warning))
		Error = lipgloss.NewStyle().Foreground(lipgloss.Color(palette.Error))
		Muted = lipgloss.NewStyle().Foreground(lipgloss.Color(palette.Muted))
		Info = lipgloss.NewStyle().Foreground(lipgloss.Color(palette.Info))
		Accent = lipgloss.NewStyle().Foreground(lipgloss.Color(palette.Accent))
		Bright = lipgloss.NewStyle().Foreground(lipgloss.Color(palette.Bright)).Bold(true)
	}
	BorderColor = lipgloss.Color(palette.Border)
}

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
		BorderForeground(BorderColor).
		Width(width)

	if AppBg != "" {
		borderStyle = borderStyle.Background(lipgloss.Color(AppBg))
	}

	title := "🚀  devD CLI v" + version
	titleStyle := Bright
	titleCellWidth := lipgloss.Width(title)
	titlePadding := (width - titleCellWidth) / 2
	if titlePadding < 0 {
		titlePadding = 0
	}
	// Pad spaces with background style if present
	var spacePaddingStyle lipgloss.Style
	if AppBg != "" {
		spacePaddingStyle = lipgloss.NewStyle().Background(lipgloss.Color(AppBg))
	}
	titleLine := spacePaddingStyle.Render(strings.Repeat(" ", titlePadding)) + titleStyle.Render(title)

	subtitle := "Accelerating Developer Workflows"
	subtitleStyle := Muted
	subCellWidth := lipgloss.Width(subtitle)
	subPadding := (width - subCellWidth) / 2
	if subPadding < 0 {
		subPadding = 0
	}
	subtitleLine := spacePaddingStyle.Render(strings.Repeat(" ", subPadding)) + subtitleStyle.Render(subtitle)

	workspaceLine := " 📂  Workspace: " + Accent.Render(projectStr)

	dividerStyle := lipgloss.NewStyle().Foreground(BorderColor)
	if AppBg != "" {
		dividerStyle = dividerStyle.Background(lipgloss.Color(AppBg))
	}
	dividerLine := dividerStyle.Render(strings.Repeat("═", width))

	boxContent := titleLine + "\n" + subtitleLine + "\n" + dividerLine + "\n" + workspaceLine

	return borderStyle.Render(boxContent) + "\n\n"
}

func PrintBanner(version string) {
	fmt.Print("\033[H\033[2J") // Clear terminal screen and reset cursor
	if AppBg != "" {
		// ANSI escape sequence to set terminal window background color block (if supported by terminal emulator)
		// Or clear the screen with background color
		fmt.Printf("\033[48;5;15m") // Cream background clear fallback
	}
	fmt.Print(RenderBanner(version))
}

func PressEnterToContinue() {
	fmt.Println()
	fmt.Print(Muted.Render("Press Enter to return to main menu..."))
	reader := bufio.NewReader(os.Stdin)
	_, _ = reader.ReadString('\n')
}
