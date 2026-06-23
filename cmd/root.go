package cmd

import (
	"fmt"
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
	Version = config.GetVersion()
	
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

	if err := RootCmd.Execute(); err != nil {
		fmt.Println(err)
		os.Exit(1)
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
				fmt.Printf("\nUnknown command/shortcut: \"%s\"\n", menuModel.ChosenValue)
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
	case "pull":
		return "pull"
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
		res := git.Pull()
		if res.Success {
			fmt.Println(ui.Success.Render("✔ Pulled remote changes successfully."))
		} else {
			fmt.Println(ui.Error.Render("Pull failed: " + res.Stderr))
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
				"⟳  Sync Repo (Pull & Push)",
				"▽  Stash Current Changes",
				"△  Pop Last Stash",
				"◁  Back to main menu",
			}
			chosen, err := ui.PromptSelect("Select Git action:", choices)
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
			case strings.Contains(chosen, "Sync"):
				HandleMenuAction("sync")
			case strings.Contains(chosen, "Stash Current"):
				HandleMenuAction("stash")
			case strings.Contains(chosen, "Pop"):
				HandleMenuAction("stash-pop")
			}
		}
	case "bump":
		ui.PrintBanner(Version)
		fmt.Println("Running version bumper...")
		cmd := exec.Command("npm", "run", "bump-version")
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		cmd.Stdin = os.Stdin
		_ = cmd.Run()
		ui.PressEnterToContinue()
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
		RunSelfUpdate()
	case "help":
		ShowHelpMenu()
	case "restart":
		RestartCLI()
	}
}

func RunSelfUpdate() {
	ui.PrintBanner(Version)
	fmt.Println(ui.Info.Render("Updating devD CLI..."))
	
	// Production: run npm install -g dwaipayanray95/devD
	fmt.Println(ui.Muted.Render("Executing: npm install -g dwaipayanray95/devD"))
	cmd := exec.Command("npm", "install", "-g", "dwaipayanray95/devD")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	err := cmd.Run()
	if err != nil {
		fmt.Println(ui.Error.Render("\n✖ Update failed: " + err.Error()))
		fmt.Println(ui.Warning.Render("If this is a permission error, please run: sudo npm install -g dwaipayanray95/devD"))
	} else {
		fmt.Println(ui.Success.Render("\n✔ devD updated successfully!"))
		ui.PressEnterToContinue()
		RestartCLI()
	}
	ui.PressEnterToContinue()
}
