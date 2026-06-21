package logger

import (
	"fmt"
	"net/url"
	"os/exec"
	"runtime"
	"strings"

	"github.com/dwaipayanray95/devD/internal/ui"
)

func openUrl(target string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", target)
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", target)
	default: // linux / bsd
		cmd = exec.Command("xdg-open", target)
	}
	_ = cmd.Start()
}

func copyToClipboard(text string) bool {
	var cmd *exec.Cmd
	if runtime.GOOS == "darwin" {
		cmd = exec.Command("pbcopy")
	} else if runtime.GOOS == "windows" {
		cmd = exec.Command("clip")
	} else {
		cmd = exec.Command("xclip", "-selection", "clipboard")
	}
	
	cmd.Stdin = strings.NewReader(text)
	err := cmd.Run()
	return err == nil
}

func ManageLogsMenu(errorDetail string) {
	ui.PrintBanner(ui.GetProjectInfo())
	fmt.Println(ui.Accent.Render("  │  Manage System Logs"))
	fmt.Println()

	choices := []string{
		"📋 View Logs inside devD",
		"🚀 Submit/Report Issue with Logs (GitHub)",
		"📁 Open Folder where Logs are saved",
		"↩ Return",
	}

	chosen, err := ui.PromptSelect("Select log operation:", choices)
	if err != nil {
		return
	}

	switch {
	case strings.Contains(chosen, "Return") || strings.Contains(chosen, "↩"):
		return

	case strings.Contains(chosen, "View Logs"):
		content := GetLastLines(50)
		ui.PrintBanner(ui.GetProjectInfo())
		fmt.Println(ui.Accent.Render("  │  View System Logs"))
		fmt.Println()
		if content != "" {
			fmt.Println(content)
		} else {
			fmt.Println(ui.Warning.Render("No logs recorded yet."))
		}
		fmt.Println()

		subChoices := []string{
			"📋 Copy logs to clipboard",
			"↩ Return",
		}
		subChosen, err := ui.PromptSelect("Choose action:", subChoices)
		if err == nil && strings.Contains(subChosen, "Copy") {
			if copyToClipboard(content) {
				fmt.Println(ui.Success.Render("\n✔ Logs successfully copied to clipboard!"))
			} else {
				fmt.Println(ui.Warning.Render("\n⚠️  Failed to copy logs automatically (ensure clip/xclip/pbcopy is installed)."))
			}
			ui.PressEnterToContinue()
		}
		ManageLogsMenu(errorDetail)

	case strings.Contains(chosen, "Submit/Report"):
		logSnippet := GetLastLines(30)
		issueTitle := url.QueryEscape("Bug Report / CLI Issue")
		issueBody := fmt.Sprintf(`### Environment Details
- **OS Platform**: %s
- **Architecture**: %s
- **Node.js/Go Version**: Go %s

### Error / Failure Details
%s

### System Logs (Last 30 lines)
`+"```text"+`
%s
`+"```", runtime.GOOS, runtime.GOARCH, runtime.Version(), errorDetail, logSnippet)

		urlTarget := fmt.Sprintf("https://github.com/dwaipayanray95/devD/issues/new?title=%s&body=%s", issueTitle, url.QueryEscape(issueBody))
		fmt.Println(ui.Info.Render("\nOpening GitHub to submit new issue with system details..."))
		openUrl(urlTarget)

	case strings.Contains(chosen, "Open Folder"):
		dir := GetLogDirPath()
		fmt.Printf(ui.Info.Render("\nOpening log directory: %s\n"), dir)
		openUrl(dir)
	}
}
