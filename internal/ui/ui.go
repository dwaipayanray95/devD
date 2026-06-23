package ui

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// ─── Style Tokens ──────────────────────────────────────────

var (
	Primary     = lipgloss.NewStyle().Foreground(lipgloss.Color("#cbd5e1"))
	Success     = lipgloss.NewStyle().Foreground(lipgloss.Color("#34d399"))
	Warning     = lipgloss.NewStyle().Foreground(lipgloss.Color("#fbbf24"))
	Error       = lipgloss.NewStyle().Foreground(lipgloss.Color("#f87171"))
	Muted       = lipgloss.NewStyle().Foreground(lipgloss.Color("#94a3b8"))
	Info        = lipgloss.NewStyle().Foreground(lipgloss.Color("#38bdf8"))
	Accent      = lipgloss.NewStyle().Foreground(lipgloss.Color("#818cf8"))
	Bright      = lipgloss.NewStyle().Foreground(lipgloss.Color("#ffffff")).Bold(true)
	Dim         = lipgloss.NewStyle().Foreground(lipgloss.Color("#475569"))
	Highlight   = lipgloss.NewStyle().Background(lipgloss.Color("#312e81")).Foreground(lipgloss.Color("#e0e7ff")).Bold(true)
	BorderColor = lipgloss.Color("#818cf8")
	AppBg       = ""

	// Gradient endpoints for the ASCII art logo
	GradientStart = "#38bdf8"
	GradientEnd   = "#a78bfa"
)

// ─── Theme Palettes ────────────────────────────────────────

type ThemePalette struct {
	Primary       string
	Success       string
	Warning       string
	Error         string
	Muted         string
	Info          string
	Accent        string
	Bright        string
	Border        string
	Background    string
	Dim           string
	HighlightBg   string
	HighlightFg   string
	GradientStart string
	GradientEnd   string
}

var DarkTheme = ThemePalette{
	Primary:       "#cbd5e1",
	Success:       "#34d399",
	Warning:       "#fbbf24",
	Error:         "#f87171",
	Muted:         "#94a3b8",
	Info:          "#38bdf8",
	Accent:        "#818cf8",
	Bright:        "#ffffff",
	Border:        "#818cf8",
	Background:    "",
	Dim:           "#475569",
	HighlightBg:   "#312e81",
	HighlightFg:   "#e0e7ff",
	GradientStart: "#38bdf8",
	GradientEnd:   "#a78bfa",
}

var LightTheme = ThemePalette{
	Primary:       "#334155",
	Success:       "#16a34a",
	Warning:       "#ea580c",
	Error:         "#dc2626",
	Muted:         "#475569",
	Info:          "#0284c7",
	Accent:        "#4f46e5",
	Bright:        "#0f172a",
	Border:        "#4f46e5",
	Background:    "#fafaf9",
	Dim:           "#94a3b8",
	HighlightBg:   "#4f46e5",
	HighlightFg:   "#ffffff",
	GradientStart: "#2563eb",
	GradientEnd:   "#7c3aed",
}

var SolarizedTheme = ThemePalette{
	Primary:       "#586e75",
	Success:       "#859900",
	Warning:       "#cb4b16",
	Error:         "#dc322f",
	Muted:         "#93a1a1",
	Info:          "#268bd2",
	Accent:        "#6c71c4",
	Bright:        "#073642",
	Border:        "#2aa198",
	Background:    "#fdf6e3",
	Dim:           "#839496",
	HighlightBg:   "#2aa198",
	HighlightFg:   "#fdf6e3",
	GradientStart: "#2aa198",
	GradientEnd:   "#6c71c4",
}

// ─── (ASCII art removed for compact layout) ───────────────

// ─── Gradient Rendering ────────────────────────────────────

func hexToRGB(hex string) (int, int, int) {
	hex = strings.TrimPrefix(hex, "#")
	if len(hex) < 6 {
		return 0, 0, 0
	}
	r, _ := strconv.ParseInt(hex[0:2], 16, 64)
	g, _ := strconv.ParseInt(hex[2:4], 16, 64)
	b, _ := strconv.ParseInt(hex[4:6], 16, 64)
	return int(r), int(g), int(b)
}

// GradientText renders a string with a smooth color gradient from startHex to endHex.
// Only visible (non-space) characters receive the gradient; spaces preserve background.
func GradientText(text, startHex, endHex string) string {
	runes := []rune(text)
	if len(runes) == 0 {
		return text
	}

	r1, g1, b1 := hexToRGB(startHex)
	r2, g2, b2 := hexToRGB(endHex)

	visibleCount := 0
	for _, ch := range runes {
		if ch != ' ' {
			visibleCount++
		}
	}
	if visibleCount == 0 {
		if AppBg != "" {
			return lipgloss.NewStyle().Background(lipgloss.Color(AppBg)).Render(text)
		}
		return text
	}

	var result strings.Builder
	colorIdx := 0
	for _, ch := range runes {
		if ch == ' ' {
			if AppBg != "" {
				result.WriteString(lipgloss.NewStyle().Background(lipgloss.Color(AppBg)).Render(" "))
			} else {
				result.WriteRune(' ')
			}
			continue
		}
		t := 0.0
		if visibleCount > 1 {
			t = float64(colorIdx) / float64(visibleCount-1)
		}
		r := int(float64(r1) + t*float64(r2-r1))
		g := int(float64(g1) + t*float64(g2-g1))
		b := int(float64(b1) + t*float64(b2-b1))
		hexColor := fmt.Sprintf("#%02x%02x%02x", r, g, b)
		style := lipgloss.NewStyle().Foreground(lipgloss.Color(hexColor)).Bold(true)
		if AppBg != "" {
			style = style.Background(lipgloss.Color(AppBg))
		}
		result.WriteString(style.Render(string(ch)))
		colorIdx++
	}
	return result.String()
}

// ─── UI Helpers ────────────────────────────────────────────

// WrapText wrap a given string to a max width.
func WrapText(text string, maxWidth int) string {
	if maxWidth <= 0 {
		return text
	}
	var result strings.Builder
	lines := strings.Split(text, "\n")
	for i, line := range lines {
		if i > 0 {
			result.WriteRune('\n')
		}
		runes := []rune(line)
		if len(runes) <= maxWidth {
			result.WriteString(line)
			continue
		}
		for len(runes) > 0 {
			chunkSize := maxWidth
			if len(runes) < chunkSize {
				chunkSize = len(runes)
			}
			result.WriteString(string(runes[:chunkSize]))
			runes = runes[chunkSize:]
			if len(runes) > 0 {
				result.WriteRune('\n')
			}
		}
	}
	return result.String()
}

// RenderDivider creates a styled horizontal rule with an optional title.
func RenderDivider(title string, width int) string {
	if title == "" {
		return Dim.Render("  " + strings.Repeat("─", width))
	}
	prefix := "─── "
	suffix := " "
	remaining := width - len(prefix) - len(title) - len(suffix)
	if remaining < 3 {
		remaining = 3
	}
	return Dim.Render("  "+prefix) + Muted.Render(title) + Dim.Render(suffix+strings.Repeat("─", remaining))
}

// ─── Theme Initialization ──────────────────────────────────

func InitTheme(themeMode string) {
	palette := DarkTheme
	if themeMode == "light" {
		palette = LightTheme
	} else if themeMode == "solarized" {
		palette = SolarizedTheme
	} else if themeMode == "system" {
		if lipgloss.HasDarkBackground() {
			palette = DarkTheme
		} else {
			palette = LightTheme
		}
	}

	AppBg = palette.Background
	GradientStart = palette.GradientStart
	GradientEnd = palette.GradientEnd

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
		Dim = lipgloss.NewStyle().Foreground(lipgloss.Color(palette.Dim)).Background(bgCol)
		Highlight = lipgloss.NewStyle().
			Background(lipgloss.Color(palette.HighlightBg)).
			Foreground(lipgloss.Color(palette.HighlightFg)).
			Bold(true)
	} else {
		Primary = lipgloss.NewStyle().Foreground(lipgloss.Color(palette.Primary))
		Success = lipgloss.NewStyle().Foreground(lipgloss.Color(palette.Success))
		Warning = lipgloss.NewStyle().Foreground(lipgloss.Color(palette.Warning))
		Error = lipgloss.NewStyle().Foreground(lipgloss.Color(palette.Error))
		Muted = lipgloss.NewStyle().Foreground(lipgloss.Color(palette.Muted))
		Info = lipgloss.NewStyle().Foreground(lipgloss.Color(palette.Info))
		Accent = lipgloss.NewStyle().Foreground(lipgloss.Color(palette.Accent))
		Bright = lipgloss.NewStyle().Foreground(lipgloss.Color(palette.Bright)).Bold(true)
		Dim = lipgloss.NewStyle().Foreground(lipgloss.Color(palette.Dim))
		Highlight = lipgloss.NewStyle().
			Background(lipgloss.Color(palette.HighlightBg)).
			Foreground(lipgloss.Color(palette.HighlightFg)).
			Bold(true)
	}
	BorderColor = lipgloss.Color(palette.Border)
}

// ─── Project Info ──────────────────────────────────────────

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

// ─── ASCII Art Banner ──────────────────────────────────────

const asciiArt = `
  ██████╗ ███████╗██╗   ██╗██████╗ 
  ██╔══██╗██╔════╝██║   ██║██╔══██╗
  ██║  ██║█████╗  ██║   ██║██║  ██║
  ██║  ██║██╔══╝  ╚██╗ ██╔╝██║  ██║
  ██████╔╝███████╗ ╚████╔╝ ██████╔╝
  ╚══════╝╚══════╝  ╚═══╝  ╚═════╝ 
`

func RenderBanner(version string) string {
	rawInfo := GetProjectInfo()
	maxLen := 40
	projectStr := rawInfo
	if len(rawInfo) > maxLen {
		projectStr = rawInfo[:maxLen-3] + "..."
	}

	width := 56

	borderStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(BorderColor).
		Width(width)

	if AppBg != "" {
		borderStyle = borderStyle.Background(lipgloss.Color(AppBg))
	}

	var content strings.Builder

	// Render ASCII art line by line with gradient
	artLines := strings.Split(strings.Trim(asciiArt, "\n"), "\n")
	for _, line := range artLines {
		// Indent the ASCII art a bit to center it inside width 56
		lineLen := len([]rune(line))
		indentSize := (width-lineLen)/2 - 1
		if indentSize < 0 {
			indentSize = 0
		}
		indent := strings.Repeat(" ", indentSize)
		content.WriteString(indent + GradientText(line, GradientStart, GradientEnd) + "\n")
	}
	content.WriteString("\n")

	// Centered tagline
	tagline := "Accelerating Developer Workflows"
	taglineLen := len([]rune(tagline))
	taglineIndentSize := (width-taglineLen)/2 - 1
	if taglineIndentSize < 0 {
		taglineIndentSize = 0
	}
	taglineIndent := strings.Repeat(" ", taglineIndentSize)
	content.WriteString(taglineIndent + Muted.Render(tagline) + "\n\n")

	// Divider line inside the box
	var dividerLine string
	if AppBg != "" {
		dividerLine = lipgloss.NewStyle().Foreground(BorderColor).Background(lipgloss.Color(AppBg)).Render(strings.Repeat("─", width))
	} else {
		dividerLine = lipgloss.NewStyle().Foreground(BorderColor).Render(strings.Repeat("─", width))
	}
	content.WriteString(dividerLine + "\n")

	// Workspace and Version in columns at the bottom
	workspaceLabel := " Workspace: "
	workspaceValue := projectStr
	versionLabel := "Version: "
	versionValue := "v" + version

	leftCol := Dim.Render("◇") + Muted.Render(workspaceLabel) + Accent.Render(workspaceValue)
	rightCol := Muted.Render(versionLabel) + Dim.Render(versionValue)

	// Calculate spacing between columns
	leftLen := 2 + len(workspaceLabel) + len(workspaceValue)
	rightLen := len(versionLabel) + len(versionValue)
	spacing := width - leftLen - rightLen - 2
	if spacing < 1 {
		spacing = 1
	}

	var padStr string
	if AppBg != "" {
		padStr = lipgloss.NewStyle().Background(lipgloss.Color(AppBg)).Render(strings.Repeat(" ", spacing))
	} else {
		padStr = strings.Repeat(" ", spacing)
	}

	content.WriteString(" " + leftCol + padStr + rightCol + "\n")

	// Gradient accent bar below the box
	accentBar := GradientText(strings.Repeat("━", width+2), GradientStart, GradientEnd)

	return borderStyle.Render(content.String()) + "\n" + accentBar + "\n\n"
}

func PrintBanner(version string) {
	fmt.Print("\033[H\033[2J\033[3J") // Clear screen, reset cursor, clear scrollback buffer
	fmt.Print(RenderBanner(version))
}

func PressEnterToContinue() {
	fmt.Println()
	fmt.Print(Muted.Render("  Press Enter to continue..."))
	reader := bufio.NewReader(os.Stdin)
	_, _ = reader.ReadString('\n')
	fmt.Print("\033[H\033[2J\033[3J") // Clear scrollback when leaving the prompt
}
