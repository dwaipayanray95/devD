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
	checkAndPromptUpdate()

	if err := RootCmd.Execute(); err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
}

func getLatestGithubTag() (string, error) {
	url := "https://api.github.com/repos/dwaipayanray95/devD/releases/latest"
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "devD-CLI-Go")
	token := config.GetStoredToken()
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	client := &http.Client{}
	resp, err := client.Do(req)
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

func isVersionNewer(latest, current string) bool {
	lParts := strings.Split(strings.TrimPrefix(latest, "v"), ".")
	cParts := strings.Split(strings.TrimPrefix(current, "v"), ".")

	for i := 0; i < 3; i++ {
		var lNum, cNum int
		if i < len(lParts) {
			fmt.Sscanf(lParts[i], "%d", &lNum)
		}
		if i < len(cParts) {
			fmt.Sscanf(cParts[i], "%d", &cNum)
		}
		if lNum > cNum {
			return true
		}
		if lNum < cNum {
			return false
		}
	}
	return false
}

func checkAndPromptUpdate() {
	latestTag, err := getLatestGithubTag()
	if err != nil || latestTag == "" {
		return // Silently skip if offline or failed
	}

	if isVersionNewer(latestTag, Version) {
		promptMsg := fmt.Sprintf("Download & install release %s (current: %s)?", latestTag, Version)
		confirm, err := ui.PromptConfirm(promptMsg, true)
		if err == nil && confirm {
			RunSelfUpdateWithTag(latestTag)
		}
	}
}

func RunMenuLoop() {
	for {
		gitActive := git.IsGitRepository()
		
		m := ui.NewMenuModel(Version, gitActive, config.GetTheme())
		m.GitStatusFn = func() (int, int, bool, int, int, int) {
			ab, _ := git.GetAheadBehind()
			files, _ := git.GetChangedFiles()
			var staged, unstaged, untracked int
			for _, f := range files {
				if f.State == "staged" {
					staged++
				} else if f.State == "unstaged" || f.State == "both" {
					unstaged++
				} else if f.RawStatus == "??" {
					untracked++
				}
			}
			return ab.Ahead, ab.Behind, ab.HasUpstream, staged, unstaged, untracked
		}
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
				
				// Dynamically resolve shell for cross-platform execution (zsh, bash, sh, or cmd.exe on Windows)
				shellPath := os.Getenv("SHELL")
				var shellCmd *exec.Cmd
				if os.Getenv("OS") == "Windows_NT" || strings.ToLower(os.Getenv("OS")) == "windows" {
					shellCmd = exec.Command("cmd.exe", "/c", shellInput)
				} else {
					if shellPath == "" {
						shellPath = "/bin/sh"
						if _, err := os.Stat("/bin/zsh"); err == nil {
							shellPath = "/bin/zsh"
						} else if _, err := os.Stat("/bin/bash"); err == nil {
							shellPath = "/bin/bash"
						}
					}
					shellCmd = exec.Command(shellPath, "-c", shellInput)
				}
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
	case "diff", "d":
		return "diff"
	case "stashes":
		return "stashes"
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
		"diff":           true,
		"stashes":        true,
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
		resp, err := ui.RunTaskWithSpinner("Fetching Git Repository Status", func() (string, error) {
			res := git.RunGitCommand([]string{"status"})
			if !res.Success {
				return "", fmt.Errorf("%s", res.Stderr)
			}
			return res.Stdout, nil
		})
		if err != nil {
			fmt.Println(ui.Error.Render("Error: " + err.Error()))
			ui.PressEnterToContinue()
		} else {
			ui.ShowViewport("Git Repository Status", resp)
		}
	case "sync":
		resp, err := ui.RunTaskWithSpinner("Synchronizing Repository (Pulling & Pushing)", func() (string, error) {
			pullRes := git.Pull()
			if !pullRes.Success {
				return "", fmt.Errorf("Pull failed: %s", pullRes.Stderr)
			}
			pushRes := git.Push()
			if !pushRes.Success {
				return "", fmt.Errorf("Push failed: %s", pushRes.Stderr)
			}
			var output strings.Builder
			output.WriteString("✔ Pull rebase successful.\n")
			output.WriteString("✔ Pushed local commits to remote.\n\n")
			if pullRes.Stdout != "" {
				output.WriteString("Pull Log:\n" + pullRes.Stdout + "\n\n")
			}
			if pushRes.Stdout != "" {
				output.WriteString("Push Log:\n" + pushRes.Stdout + "\n")
			}
			return output.String(), nil
		})
		if err != nil {
			fmt.Println(ui.Error.Render("Sync failed: " + err.Error()))
			ui.PressEnterToContinue()
		} else {
			ui.ShowViewport("Git Sync Results", resp)
		}
	case "pull":
		resp, err := ui.RunTaskWithSpinner("Pulling Remote Changes (git pull --rebase)", func() (string, error) {
			res := git.Pull()
			if !res.Success {
				return "", fmt.Errorf("Pull failed: %s", res.Stderr)
			}
			if res.Stdout == "" {
				return "✔ Pulled remote changes successfully.", nil
			}
			return res.Stdout, nil
		})
		if err != nil {
			fmt.Println(ui.Error.Render("Pull failed: " + err.Error()))
			ui.PressEnterToContinue()
		} else {
			ui.ShowViewport("Git Pull Results", resp)
		}
	case "push":
		resp, err := ui.RunTaskWithSpinner("Pushing Local Commits to Remote", func() (string, error) {
			res := git.Push()
			if !res.Success {
				return "", fmt.Errorf("Push failed: %s", res.Stderr)
			}
			if res.Stdout == "" {
				return "✔ Pushed local commits to remote successfully.", nil
			}
			return res.Stdout, nil
		})
		if err != nil {
			fmt.Println(ui.Error.Render("Push failed: " + err.Error()))
			ui.PressEnterToContinue()
		} else {
			ui.ShowViewport("Git Push Results", resp)
		}
	case "stash":
		resp, err := ui.RunTaskWithSpinner("Stashing Working Modifications", func() (string, error) {
			res := git.RunGitCommand([]string{"stash"})
			if !res.Success {
				return "", fmt.Errorf("Stash failed: %s", res.Stderr)
			}
			return res.Stdout, nil
		})
		if err != nil {
			fmt.Println(ui.Error.Render("Stash failed: " + err.Error()))
			ui.PressEnterToContinue()
		} else {
			ui.ShowViewport("Git Stash Results", resp)
		}
	case "stash-pop":
		resp, err := ui.RunTaskWithSpinner("Restoring Stashed Modifications (stash pop)", func() (string, error) {
			res := git.RunGitCommand([]string{"stash", "pop"})
			if !res.Success {
				return "", fmt.Errorf("Stash pop failed: %s", res.Stderr)
			}
			return res.Stdout, nil
		})
		if err != nil {
			fmt.Println(ui.Error.Render("Stash pop failed: " + err.Error()))
			ui.PressEnterToContinue()
		} else {
			ui.ShowViewport("Git Stash Pop Results", resp)
		}
	case "diff":
		resp, err := ui.RunTaskWithSpinner("Generating Git Diff View", func() (string, error) {
			res := git.RunGitCommand([]string{"diff", "HEAD"})
			if !res.Success {
				return "", fmt.Errorf("%s", res.Stderr)
			}
			if res.Stdout == "" {
				return "No uncommitted modifications detected in working tree.", nil
			}
			return res.Stdout, nil
		})
		if err != nil {
			fmt.Println(ui.Error.Render("Diff failed: " + err.Error()))
			ui.PressEnterToContinue()
		} else {
			ui.ShowViewport("Git Diff Viewer", resp)
		}
	case "stashes":
		stashes, err := git.GetStashes()
		if err != nil || len(stashes) == 0 {
			ui.PrintBanner(Version)
			fmt.Println(ui.Warning.Render("No stashes found in stash stack."))
			ui.PressEnterToContinue()
		} else {
			chosen, err := ui.PromptSelect("Select stash entry to apply:", stashes)
			if err == nil && chosen != "" {
				parts := strings.Split(chosen, ":")
				stashRef := strings.TrimSpace(parts[0])
				resp, err := ui.RunTaskWithSpinner("Applying Stash "+stashRef, func() (string, error) {
					res := git.RunGitCommand([]string{"stash", "apply", stashRef})
					if !res.Success {
						return "", fmt.Errorf("Stash apply failed: %s", res.Stderr)
					}
					return fmt.Sprintf("✔ Successfully applied %s to working directory.", stashRef), nil
				})
				if err != nil {
					fmt.Println(ui.Error.Render("Error: " + err.Error()))
					ui.PressEnterToContinue()
				} else {
					ui.ShowViewport("Stash Apply Results", resp)
				}
			}
		}
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
			resp, err := ui.RunTaskWithSpinner("Querying Gemini AI Model", func() (string, error) {
				return gemini.AskGemini(prompt)
			})
			if err != nil {
				fmt.Println("\n" + ui.Error.Render("Error: "+err.Error()))
				ui.PressEnterToContinue()
			} else {
				ui.ShowViewport("Gemini AI Response", resp)
			}
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
		pInfo := detector.DetectPlatform()
		if pInfo == nil {
			ui.PrintBanner(Version)
			fmt.Println(ui.Warning.Render("Could not auto-detect any supported platform in this folder."))
			ui.PressEnterToContinue()
			return
		}
		
		taskTitle := fmt.Sprintf("Building %s (%s %s)", pInfo.PlatformName, pInfo.BuildCommand, strings.Join(pInfo.BuildArgs, " "))
		resp, err := ui.RunTaskWithSpinner(taskTitle, func() (string, error) {
			cmd := exec.Command(pInfo.BuildCommand, pInfo.BuildArgs...)
			out, err := cmd.CombinedOutput()
			if err != nil {
				return "", fmt.Errorf("Build failed: %w\n%s", err, string(out))
			}
			if len(out) == 0 {
				return "✔ Application built successfully.", nil
			}
			return string(out), nil
		})

		if err != nil {
			fmt.Println("\n" + ui.Error.Render("Build failed: "+err.Error()))
			ui.PressEnterToContinue()
		} else {
			ui.ShowViewport("Build Output", resp)
		}
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

	fmt.Printf(ui.Muted.Render("Executing: npm install -g %s --no-progress --silent\n"), npmTarget)
	cmd := exec.Command("npm", "install", "-g", npmTarget, "--no-progress", "--silent")
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
