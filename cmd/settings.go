package cmd

import (
	"fmt"
	"os"
	"os/exec"
	"strings"

	"syscall"

	"github.com/dwaipayanray95/devD/internal/config"
	"github.com/dwaipayanray95/devD/internal/logger"
	"github.com/dwaipayanray95/devD/internal/ui"
)

func ShowSettingsMenu() {
	for {
		ui.PrintBanner(Version)
		fmt.Println(ui.RenderDivider("Settings", 54))
		fmt.Println()

		choices := []string{
			"▲  Update devD CLI",
			"◇  Help & Commands",
			"●  Preferences",
			"▤  Manage System Logs",
			"⟳  Restart devD CLI",
			"♡  GitHub Repository",
			"◁  Back to main menu",
		}

		chosen, err := ui.PromptSelect("Select setting option:", choices)
		fmt.Print("\033[H\033[2J\033[3J") // Clean screen scrollback on menu exit
		if err != nil || strings.Contains(chosen, "Back") || strings.Contains(chosen, "◁") {
			return
		}

		switch {
		case strings.Contains(chosen, "Update"):
			RunSelfUpdate()

		case strings.Contains(chosen, "Help"):
			ShowHelpMenu()

		case strings.Contains(chosen, "Preferences"):
			ShowPreferencesMenu()

		case strings.Contains(chosen, "Logs"):
			logger.ManageLogsMenu("")

		case strings.Contains(chosen, "Restart"):
			RestartCLI()

		case strings.Contains(chosen, "Repository"):
			fmt.Println(ui.Info.Render("Opening repository..."))
			openUrl("https://github.com/dwaipayanray95/devD")
		}
	}
}

func ShowPreferencesMenu() {
	for {
		ui.PrintBanner(Version)
		fmt.Println(ui.RenderDivider("Preferences", 54))
		fmt.Println()

		choices := []string{
			"◆  Configure GitHub Token",
			"◇  Toggle Theme (Dark / Light / System)",
			"◁  Back to settings menu",
		}

		chosen, err := ui.PromptSelect("Select preference option:", choices)
		fmt.Print("\033[H\033[2J\033[3J") // Clean screen scrollback on menu exit
		if err != nil || strings.Contains(chosen, "Back") || strings.Contains(chosen, "◁") {
			return
		}

		if strings.Contains(chosen, "Configure GitHub Token") {
			ui.PrintBanner(Version)
			fmt.Println(ui.RenderDivider("Configure GitHub Token", 54))
			fmt.Println()

			currentToken := config.GetStoredToken()
			if currentToken != "" {
				masked := "****" + currentToken[len(currentToken)-4:]
				fmt.Printf(ui.Info.Render("A GitHub Token is currently stored locally (masked: %s).\n\n"), masked)
				
				opts := []string{
					"⟳  Replace stored token",
					"✕  Clear stored token",
					"◁  Return",
				}
				opt, err := ui.PromptSelect("What would you like to do?", opts)
				if err != nil || strings.Contains(opt, "Return") {
					continue
				}

				if strings.Contains(opt, "Clear") {
					config.SaveStoredToken("")
					fmt.Println(ui.Success.Render("\n✔ Token cleared successfully."))
				} else if strings.Contains(opt, "Replace") {
					newToken, err := ui.PromptInput("Enter new GitHub PAT:", "")
					if err == nil && newToken != "" {
						config.SaveStoredToken(newToken)
						fmt.Println(ui.Success.Render("\n✔ Token saved successfully."))
					}
				}
			} else {
				fmt.Println(ui.Warning.Render("No GitHub Token is currently stored locally."))
				add, err := ui.PromptConfirm("Would you like to add one now?", true)
				if err == nil && add {
					newToken, err := ui.PromptInput("Enter your GitHub PAT:", "")
					if err == nil && newToken != "" {
						config.SaveStoredToken(newToken)
						fmt.Println(ui.Success.Render("\n✔ Token saved successfully."))
					}
				}
			}
			ui.PressEnterToContinue()
		}

		if strings.Contains(chosen, "Toggle Theme") {
			ui.PrintBanner(Version)
			fmt.Println(ui.RenderDivider("Toggle Theme", 54))
			fmt.Println()

			currentTheme := config.GetTheme()
			if currentTheme == "" {
				currentTheme = "system"
			}
			fmt.Printf(ui.Info.Render("Current active theme mode: %s\n\n"), currentTheme)

			opts := []string{
				"●  Dark Mode",
				"○  Light Mode",
				"◐  Solarized Light Mode",
				"◑  System Mode",
				"◁  Return",
			}
			opt, err := ui.PromptSelect("Select theme preference:", opts)
			if err != nil || strings.Contains(opt, "Return") {
				continue
			}

			newTheme := "system"
			if strings.Contains(opt, "Dark") {
				newTheme = "dark"
			} else if strings.Contains(opt, "Solarized") {
				newTheme = "solarized"
			} else if strings.Contains(opt, "Light") {
				newTheme = "light"
			}

			config.SaveTheme(newTheme)
			ui.InitTheme(newTheme)
			fmt.Println(ui.Success.Render("\n✔ Theme updated successfully."))
			ui.PressEnterToContinue()
		}
	}
}

func ShowHelpMenu() {
	ui.PrintBanner(Version)
	fmt.Println(ui.RenderDivider("Commands Reference", 54))
	fmt.Println()

	// Print commands in a clean, compact two-column format
	commandsHelp := []struct {
		Cmd  string
		Desc string
	}{
		{"run / dev", "Run auto-detected app"},
		{"build", "Build auto-detected app"},
		{"status / s", "Repo status dashboard"},
		{"commit / c", "Conventional Commit Wizard"},
		{"sync / y", "Sync repo (Pull & Push)"},
		{"pull", "Pull upstream (rebase)"},
		{"stash", "Save modifications to stash"},
		{"pop", "Apply last stash"},
		{"bump / b", "Bump package version"},
		{"tag / t", "Create & push release tag"},
		{"release", "Create GitHub release"},
		{"ai / a", "Query Gemini Assistant"},
		{"settings", "Theme & GitHub configurations"},
		{"restart / r", "Restart devD session"},
		{"exit / q", "Exit devD companion"},
	}

	for i := 0; i < len(commandsHelp); i += 2 {
		left := commandsHelp[i]
		leftStr := fmt.Sprintf("  %s %s", ui.Bright.Render(fmt.Sprintf("%-12s", left.Cmd)), ui.Muted.Render(left.Desc))
		
		if i+1 < len(commandsHelp) {
			right := commandsHelp[i+1]
			rightStr := fmt.Sprintf("  %s %s", ui.Bright.Render(fmt.Sprintf("%-12s", right.Cmd)), ui.Muted.Render(right.Desc))
			// Space columns to keep clean alignment
			spacing := 34 - len([]rune(left.Cmd)) - len([]rune(left.Desc))
			if spacing < 2 {
				spacing = 2
			}
			fmt.Print(leftStr + strings.Repeat(" ", spacing) + rightStr + "\n")
		} else {
			fmt.Print(leftStr + "\n")
		}
	}
	fmt.Println()

	fmt.Println(ui.RenderDivider("Key Bindings & Shortcuts", 54))
	fmt.Println()
	
	keyHelp := []struct {
		Keys string
		Desc string
	}{
		{"Ctrl + A", "Select & copy all typed text"},
		{"Ctrl + X", "Cut (copy & clear) typed text"},
		{"Ctrl + V", "Paste from system clipboard"},
		{"Ctrl + W", "Fast backspace (delete word)"},
		{"Ctrl + C", "Force quit devD companion CLI"},
	}

	for _, kh := range keyHelp {
		fmt.Printf("  %-12s %s\n", ui.Bright.Render(kh.Keys), ui.Muted.Render(kh.Desc))
	}
	fmt.Println()

	ui.PressEnterToContinue()
}

func RestartCLI() {
	fmt.Println(ui.Info.Render("\nRestarting devD..."))
	
	exePath, err := os.Executable()
	if err != nil {
		exePath = os.Args[0]
	}
	
	// Use syscall.Exec to replace the current process image cleanly with the resolved binary.
	// We pass os.Args to preserve command line flags.
	_ = syscall.Exec(exePath, os.Args, os.Environ())
	
	// Fallback to spawning process if syscall.Exec fails
	cmd := exec.Command(exePath, os.Args[1:]...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	_ = cmd.Run()
	os.Exit(0)
}

func openUrl(target string) {
	var cmd *exec.Cmd
	switch os.Getenv("OS") { // fallback checks
	default:
		cmd = exec.Command("open", target)
	}
	_ = cmd.Start()
}
