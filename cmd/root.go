package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/spf13/cobra"

	"github.com/dwaipayanray95/devD/internal/config"
	"github.com/dwaipayanray95/devD/internal/detector"
	"github.com/dwaipayanray95/devD/internal/gemini"
	"github.com/dwaipayanray95/devD/internal/git"
	"github.com/dwaipayanray95/devD/internal/logger"
	"github.com/dwaipayanray95/devD/internal/ui"
)

var Version = "1.1.0"

var RootCmd = &cobra.Command{
	Use:   "devd",
	Short: "devD is a developer companion CLI tool for Git & Version Bumping workflow automation.",
	Run: func(cmd *cobra.Command, args []string) {
		RunMenuLoop()
	},
}

func Execute(ver string) {
	// Scale terminal to at least 42 rows and 65 columns
	fmt.Print("\033[8;42;65t")
	// Clear the terminal screen and reset cursor position so it starts at the top
	fmt.Print("\033[H\033[2J")
	
	if ver != "" {
		Version = ver
	} else {
		Version = config.GetVersion()
	}
	
	// Load stored theme or run onboarding
	activeTheme := config.GetTheme()
	if activeTheme == "" {
		// Run onboarding theme selection prompt
		ui.PrintBanner(Version)
		fmt.Println(ui.Accent.Render("  │  Welcome to devD Companion CLI!"))
		fmt.Println(ui.Muted.Render("  │  Please select a color theme preference to get started."))
		fmt.Println()

		opts := []string{
			"●  Dark — High contrast slate & indigo",
			"○  Light — Clean off-white & indigo",
			"◐  Solarized — Warm cream & teal accents",
			"◑  System — Auto-detect terminal theme",
		}
		
		chosen, err := ui.PromptSelect("Select theme preference:", opts)
		if err == nil {
			newTheme := "system"
			if strings.Contains(chosen, "Dark") {
				newTheme = "dark"
			} else if strings.Contains(chosen, "Solarized") {
				newTheme = "solarized"
			} else if strings.Contains(chosen, "Light") {
				newTheme = "light"
			}
			config.SaveTheme(newTheme)
			activeTheme = newTheme
		} else {
			activeTheme = "system"
		}
	}
	
	ui.InitTheme(activeTheme)

	// Check for updates on startup
	go checkAndPromptUpdate()

	if err := RootCmd.Execute(); err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
}

func getLatestGithubTag() (string, error) {
	// Call GitHub API to get the latest release tag name of the repo
	url := "https://api.github.com/repos/dwaipayanray95/devD/releases/latest"
	resp, err := http.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GitHub API returned status code %d", resp.StatusCode)
	}

	var release struct {
		TagName string `json:"tag_name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return "", err
	}
	return strings.TrimSpace(release.TagName), nil
}

func checkAndPromptUpdate() {
	latestTag, err := getLatestGithubTag()
	if err != nil || latestTag == "" {
		return // Silently skip if offline or failed
	}

	// Clean 'v' prefix if present to compare semantic version cleanly
	cleanLatest := strings.TrimPrefix(latestTag, "v")
	cleanCurrent := strings.TrimPrefix(Version, "v")

	if cleanLatest != cleanCurrent {
		fmt.Printf("\n  %s A new version of devD is available: %s (current: %s)\n", ui.Info.Render("✦"), ui.Success.Render(latestTag), ui.Muted.Render(Version))
		confirm, err := ui.PromptConfirm("  Would you like to download and install this release now?", true)
		if err == nil && confirm {
			RunSelfUpdateWithTag(latestTag)
		}
	}
}

func RunMenuLoop() {
	for {
		gitActive := git.IsGitRepository()
		
		m := ui.NewMenuModel(Version, gitActive, config.GetTheme())
		p := tea.NewProgram(m)
		
		finalModel, err := p.Run()
		if err != nil {
			fmt.Printf("Alas, TUI error: %v\n", err)
			os.Exit(1)
		}

		menuModel, ok := finalModel.(ui.MenuModel)
		if !ok {
			os.Exit(1)
		}

		if menuModel.ChosenType == "input" {
			action := ParseCommand(menuModel.ChosenValue)
			if action != "" {
				if strings.HasPrefix(strings.ToLower(strings.TrimSpace(action)), "cd") {
					HandleCDAction(action)
					continue
				}
				if IsGitAction(action) && !EnsureGitRepo() {
					continue
				}
				HandleMenuAction(action)
			} else {
				// Execute the command directly in the shell
				shellInput := menuModel.ChosenValue
				ui.PrintBanner(Version)
				fmt.Printf("%s Running shell command: %s\n\n", ui.Info.Render("❯"), ui.Bright.Render(shellInput))
				
				// We run via /bin/zsh -c "command" to support aliases/pipes/etc.
				shellCmd := exec.Command("/bin/zsh", "-c", shellInput)
				shellCmd.Stdout = os.Stdout
				shellCmd.Stderr = os.Stderr
				shellCmd.Stdin = os.Stdin
				
				_ = shellCmd.Run()
				ui.PressEnterToContinue()
			}
		} else {
			action := menuModel.ChosenValue
			if IsGitAction(action) && !EnsureGitRepo() {
				continue
			}
			HandleMenuAction(action)
		}
	}
}

func HandleCDAction(action string) {
	trimmed := strings.TrimSpace(action)
	parts := strings.Fields(trimmed)
	if len(parts) == 1 {
		// Just "cd" - launch interactive navigator
		cwd, err := os.Getwd()
		if err != nil {
			cwd = "."
		}
		nav := ui.NewNavigatorModel(cwd)
		p := tea.NewProgram(nav)
		finalModel, err := p.Run()
		fmt.Print("\033[H\033[2J\033[3J") // Clear scrollback when navigator exits
		if err == nil {
			if navModel, ok := finalModel.(ui.NavigatorModel); ok && navModel.Confirmed {
				if err := os.Chdir(navModel.CurrentDir); err != nil {
					fmt.Printf("\nError changing directory: %v\n", err)
					ui.PressEnterToContinue()
				}
			}
		}
	} else {
		// cd <path>
		path := strings.Join(parts[1:], " ")
		if err := os.Chdir(path); err != nil {
			fmt.Printf("\nError changing directory to %s: %v\n", path, err)
			ui.PressEnterToContinue()
		}
	}
}

func ParseCommand(cmdInput string) string {
	lowerCmd := strings.TrimSpace(strings.ToLower(cmdInput))
	switch lowerCmd {
	case "run", "dev":
		return "run-app"
	case "build":
		return "build-app"
	case "status", "s", "dashboard":
		return "status"
	case "commit", "c", "wizard":
		return "commit"
	case "sync", "y":
		return "sync"
	case "pull", "pl":
		return "pull"
	case "push", "ps":
		return "push"
	case "stash":
		return "stash"
	case "stash-pop", "pop":
		return "stash-pop"
	case "bump", "b":
		return "bump"
	case "tag", "t":
		return "tag"
	case "release", "rel":
		return "release"
	case "ai", "a", "gemini":
		return "ai"
	case "update", "u":
		return "update"
	case "help", "h", "?":
		return "help"
	case "restart", "r":
		return "restart"
	case "settings", "set":
		return "settings"
	case "logs", "log":
		return "logs"
	case "exit", "q", "quit":
		return "exit"
	}
	if strings.HasPrefix(lowerCmd, "cd") {
		return cmdInput // Return the full input so we can parse the path
	}
	return ""
}

func IsGitAction(action string) bool {
	gitActions := map[string]bool{
		"git-controls":   true,
		"branch-manager": true,
		"commit":         true,
		"sync":           true,
		"pull":           true,
		"push":           true,
		"stash":          true,
		"stash-pop":      true,
		"status":         true,
		"bump":           true,
		"tag":            true,
		"release":        true,
	}
	return gitActions[action]
}

func EnsureGitRepo() bool {
	if git.IsGitRepository() {
		return true
	}
	fmt.Println(ui.Warning.Render("⚠️  Not inside a Git repository. Cannot execute Git actions."))
	ui.PressEnterToContinue()
	return false
}

func HandleMenuAction(action string) {
	switch action {
	case "exit":
		fmt.Println(ui.Success.Render("\nGoodbye!"))
		os.Exit(0)
	case "status":
		ui.PrintBanner(Version)
		res := git.RunGitCommand([]string{"status"})
		fmt.Println(res.Stdout)
		ui.PressEnterToContinue()
	case "sync":
		ui.PrintBanner(Version)
		fmt.Println(ui.Info.Render("Syncing... pulling remote changes..."))
		pullRes := git.Pull()
		if !pullRes.Success {
			fmt.Println(ui.Error.Render("Pull failed: " + pullRes.Stderr))
			ui.PressEnterToContinue()
			return
		}
		fmt.Println(ui.Info.Render("Pushing local changes..."))
		pushRes := git.Push()
		if !pushRes.Success {
			fmt.Println(ui.Error.Render("Push failed: " + pushRes.Stderr))
		} else {
			fmt.Println(ui.Success.Render("✔ Repository synchronized successfully."))
		}
		ui.PressEnterToContinue()
	case "pull":
		ui.PrintBanner(Version)
		fmt.Println("Pulling remote changes...")
		res := git.Pull()
		if res.Success {
			fmt.Println(ui.Success.Render("✔ Pulled remote changes successfully."))
		} else {
			fmt.Println(ui.Error.Render("Pull failed: " + res.Stderr))
		}
		ui.PressEnterToContinue()
	case "push":
		ui.PrintBanner(Version)
		fmt.Println("Pushing local commits to remote...")
		res := git.Push()
		if res.Success {
			fmt.Println(ui.Success.Render("✔ Pushed local commits successfully."))
		} else {
			fmt.Println(ui.Error.Render("Push failed: " + res.Stderr))
		}
		ui.PressEnterToContinue()
	case "stash":
		ui.PrintBanner(Version)
		fmt.Println("Stashing changes...")
		res := git.StashSave("")
		if res.Success {
			fmt.Println(ui.Success.Render("✔ Stashed changes successfully."))
		} else {
			fmt.Println(ui.Error.Render("Failed: " + res.Stderr))
		}
		ui.PressEnterToContinue()
	case "stash-pop":
		ui.PrintBanner(Version)
		res := git.StashPop()
		if res.Success {
			fmt.Println(ui.Success.Render("✔ Restored stashed changes."))
		} else {
			fmt.Println(ui.Error.Render("Failed: " + res.Stderr))
		}
		ui.PressEnterToContinue()
	case "commit":
		git.RunCommitWizard()
	case "branch-manager":
		git.ManageBranches()
	case "tag":
		git.CreateGitTag()
	case "release":
		git.CreateGitHubRelease()
	case "git-controls":
		for {
			ui.PrintBanner(Version)
			fmt.Println(ui.RenderDivider("Git Controls", 54))
			fmt.Println()
			choices := []string{
				"◆  Stage & Commit Wizard (Conventional)",
				"◇  Git Branch Manager",
				"▣  Create & Push Release Tag",
				"▶  Create GitHub Release",
				"◈  Show Repo Status Dashboard",
				"↑  Push Commits to Remote",
				"↓  Pull Commits from Remote",
				"⟳  Sync Repo (Pull & Push)",
				"▽  Stash Current Changes",
				"△  Pop Last Stash",
				"◁  Back to main menu",
			}
			chosen, err := ui.PromptSelect("Select Git action:", choices)
			fmt.Print("\033[H\033[2J\033[3J") // Clean screen scrollback on prompt return/exit
			if err != nil || strings.Contains(chosen, "Back") || strings.Contains(chosen, "◁") {
				break
			}
			switch {
			case strings.Contains(chosen, "Commit"):
				git.RunCommitWizard()
			case strings.Contains(chosen, "Branch"):
				git.ManageBranches()
			case strings.Contains(chosen, "Tag"):
				git.CreateGitTag()
			case strings.Contains(chosen, "Release"):
				git.CreateGitHubRelease()
			case strings.Contains(chosen, "Status"):
				HandleMenuAction("status")
			case strings.Contains(chosen, "Push Commits"):
				HandleMenuAction("push")
			case strings.Contains(chosen, "Pull Commits"):
				HandleMenuAction("pull")
			case strings.Contains(chosen, "Sync"):
				HandleMenuAction("sync")
			case strings.Contains(chosen, "Stash Current"):
				HandleMenuAction("stash")
			case strings.Contains(chosen, "Pop"):
				HandleMenuAction("stash-pop")
			}
		}
	case "bump":
		git.BumpVersion()
	case "ai":
		ui.PrintBanner(Version)
		fmt.Println(ui.RenderDivider("Gemini AI Assistant", 54))
		fmt.Println()
		prompt, err := ui.PromptInput("Ask Gemini anything:", "")
		if err == nil && prompt != "" {
			fmt.Println("\nThinking...")
			resp, err := gemini.AskGemini(prompt)
			if err != nil {
				fmt.Println(ui.Error.Render("Error: " + err.Error()))
			} else {
				fmt.Println("\n" + ui.Bright.Render("Response:") + "\n" + resp)
			}
			ui.PressEnterToContinue()
		}
	case "run-app":
		ui.PrintBanner(Version)
		pInfo := detector.DetectPlatform()
		if pInfo == nil {
			fmt.Println(ui.Warning.Render("Could not auto-detect any supported platform in this folder."))
			ui.PressEnterToContinue()
			return
		}
		fmt.Printf(ui.Info.Render("Detected Platform: %s\n"), pInfo.PlatformName)
		fmt.Printf(ui.Muted.Render("Running: %s %s\n\n"), pInfo.RunCommand, strings.Join(pInfo.RunArgs, " "))
		
		cmd := exec.Command(pInfo.RunCommand, pInfo.RunArgs...)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		cmd.Stdin = os.Stdin
		_ = cmd.Run()
		ui.PressEnterToContinue()
	case "build-app":
		ui.PrintBanner(Version)
		pInfo := detector.DetectPlatform()
		if pInfo == nil {
			fmt.Println(ui.Warning.Render("Could not auto-detect any supported platform in this folder."))
			ui.PressEnterToContinue()
			return
		}
		fmt.Printf(ui.Info.Render("Detected Platform: %s\n"), pInfo.PlatformName)
		fmt.Printf(ui.Muted.Render("Building: %s %s\n\n"), pInfo.BuildCommand, strings.Join(pInfo.BuildArgs, " "))
		
		cmd := exec.Command(pInfo.BuildCommand, pInfo.BuildArgs...)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		cmd.Stdin = os.Stdin
		_ = cmd.Run()
		ui.PressEnterToContinue()
	case "settings":
		ShowSettingsMenu()
	case "logs":
		logger.ManageLogsMenu("")
	case "update":
		latestTag, err := getLatestGithubTag()
		if err == nil && latestTag != "" {
			RunSelfUpdateWithTag(latestTag)
		} else {
			// fallback to latest branch version if tag fetch failed
			RunSelfUpdateWithTag("latest")
		}
	case "help":
		ShowHelpMenu()
	case "restart":
		RestartCLI()
	}
}

func RunSelfUpdateWithTag(tag string) {
	ui.PrintBanner(Version)
	
	targetVersion := tag
	if targetVersion == "latest" {
		targetVersion = "latest release"
	}

	fmt.Println(ui.Info.Render("Updating devD CLI to " + targetVersion + "..."))
	
	// Format the git tag target url for npm installation (e.g. dwaipayanray95/devD#v1.1.38)
	npmTarget := "dwaipayanray95/devD"
	if tag != "latest" {
		npmTarget = fmt.Sprintf("dwaipayanray95/devD#%s", tag)
	}

	fmt.Printf(ui.Muted.Render("Executing: npm install -g %s --no-progress\n"), npmTarget)
	cmd := exec.Command("npm", "install", "-g", npmTarget, "--no-progress")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	err := cmd.Run()
	if err != nil {
		fmt.Println(ui.Error.Render("\n✖ Update failed: " + err.Error()))
		fmt.Printf(ui.Warning.Render("If this is a permission error, please run: sudo npm install -g %s\n"), npmTarget)
	} else {
		fmt.Println(ui.Success.Render("\n✔ devD updated successfully!"))
		ui.PressEnterToContinue()
		RestartCLI()
	}
	ui.PressEnterToContinue()
}
