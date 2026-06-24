package git

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/dwaipayanray95/devD/internal/config"
	"github.com/dwaipayanray95/devD/internal/ui"
)

// ==========================================
// 1. CONVENTIONAL COMMIT WIZARD
// ==========================================

func RunCommitWizard() {
	ui.PrintBanner(ui.GetProjectInfo())
	fmt.Println(ui.Accent.Render("  │  Conventional Commit Wizard"))
	fmt.Println()

	// 1. Commit Type
	types := []string{
		"custom: Direct custom message (no type/scope prefix)",
		"feat: A new feature",
		"fix: A bug fix",
		"docs: Documentation only",
		"style: Code style/formatting",
		"refactor: Refactoring code",
		"perf: Performance improvement",
		"chore: Tooling/auxiliary changes",
	}
	chosenType, err := ui.PromptSelect("Select commit type:", types)
	if err != nil {
		return
	}
	commitType := strings.Split(chosenType, ":")[0]

	var msg string

	if commitType == "custom" {
		// Custom commit option - direct message entry
		customMsg, err := ui.PromptInput("Enter commit message:", "")
		if err != nil || customMsg == "" {
			if customMsg == "" {
				fmt.Println(ui.Error.Render("Commit message is required."))
				ui.PressEnterToContinue()
			}
			return
		}
		msg = customMsg
	} else {
		// 2. Scope
		scope, err := ui.PromptInput("Enter scope (optional):", "")
		if err != nil {
			return
		}

		// 3. Subject
		subject, err := ui.PromptInput("Enter short description / subject:", "")
		if err != nil || subject == "" {
			if subject == "" {
				fmt.Println(ui.Error.Render("Subject description is required."))
				ui.PressEnterToContinue()
			}
			return
		}

		// 4. Body
		body, err := ui.PromptInput("Enter detailed body (optional):", "")
		if err != nil {
			return
		}

		// Format commit message
		if scope != "" {
			msg = fmt.Sprintf("%s(%s): %s", commitType, scope, subject)
		} else {
			msg = fmt.Sprintf("%s: %s", commitType, subject)
		}
		if body != "" {
			msg = fmt.Sprintf("%s\n\n%s", msg, body)
		}
	}

	ui.PrintBanner(ui.GetProjectInfo())
	fmt.Println(ui.Accent.Render("  │  Commit Confirmation"))
	fmt.Println()
	fmt.Println(ui.Info.Render("Proposed Commit Message:"))
	fmt.Println(ui.Bright.Render(msg))
	fmt.Println()

	confirm, err := ui.PromptConfirm("Stage all changes and commit?", true)
	if err != nil || !confirm {
		return
	}

	stageRes := StageFiles([]string{"all"})
	if !stageRes.Success {
		fmt.Println(ui.Error.Render("Failed to stage files: " + stageRes.Stderr))
		ui.PressEnterToContinue()
		return
	}

	commitRes := Commit(msg)
	if commitRes.Success {
		fmt.Println(ui.Success.Render("\n✔ Commit created successfully!"))
		
		// Prompt to push online
		fmt.Println()
		pushConfirm, err := ui.PromptConfirm("Push commits to remote repository now?", true)
		if err == nil && pushConfirm {
			// Ask which branch to push to
			ui.PrintBanner(ui.GetProjectInfo())
			fmt.Println(ui.Accent.Render("  │  Push Commits Online"))
			fmt.Println()
			
			choices, _ := getBranchList()
			if len(choices) > 0 {
				chosenDisplayName, err := ui.PromptSelect("Select branch to push to:", choices)
				if err == nil {
					branchName := chosenDisplayName
					branchName = strings.ReplaceAll(branchName, "🌿 ", "")
					branchName = strings.ReplaceAll(branchName, "🌎 ", "")
					branchName = strings.ReplaceAll(branchName, " (current)", "")
					branchName = strings.TrimSpace(branchName)
					
					ui.PrintBanner(ui.GetProjectInfo())
					fmt.Printf("%s Pushing commits to remote branch: %s...\n\n", ui.Info.Render("❯"), ui.Bright.Render(branchName))
					
					// Execute git push origin <branch>
					pushRes := RunGitCommand([]string{"push", "origin", branchName})
					if pushRes.Success {
						fmt.Println(ui.Success.Render("\n✔ Pushed successfully!"))
					} else {
						fmt.Printf(ui.Error.Render("\n✖ Push failed: %s\n"), pushRes.Stderr)
					}
				}
			} else {
				fmt.Println(ui.Warning.Render("No branches found to push to."))
			}
		}
	} else {
		fmt.Println(ui.Error.Render("\n✖ Commit failed: " + commitRes.Error.Error()))
	}
	ui.PressEnterToContinue()
}

// ==========================================
// 2. GIT BRANCH MANAGER
// ==========================================

func getBranchList() ([]string, map[string]BranchInfo) {
	branchesMap := make(map[string]BranchInfo)
	res := RunGitCommand([]string{"branch", "-a"})
	if !res.Success {
		return nil, nil
	}

	var choices []string
	lines := strings.Split(res.Stdout, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		isCurrent := strings.HasPrefix(line, "*")
		name := strings.TrimSpace(strings.ReplaceAll(line, "*", ""))
		isRemote := strings.HasPrefix(name, "remotes/")
		if isRemote {
			name = strings.ReplaceAll(name, "remotes/", "")
		}

		info := BranchInfo{
			Name:      name,
			IsCurrent: isCurrent,
			IsRemote:  isRemote,
		}
		branchesMap[name] = info

		displayName := name
		if isCurrent {
			displayName = "🌿 " + name + " (current)"
		} else if isRemote {
			displayName = "🌎 " + name
		} else {
			displayName = "🌿 " + name
		}
		choices = append(choices, displayName)
	}
	return choices, branchesMap
}

func ManageBranches() {
	ui.PrintBanner(ui.GetProjectInfo())
	fmt.Println(ui.Accent.Render("  │  Git Branch Manager"))
	fmt.Println()

	choices, branchesMap := getBranchList()
	if len(choices) == 0 {
		fmt.Println(ui.Warning.Render("No branches found."))
		ui.PressEnterToContinue()
		return
	}

	chosenDisplayName, err := ui.PromptSelect("Select branch to operate on:", choices)
	if err != nil {
		return
	}

	// Resolve the raw branch name from the chosen display name
	branchName := chosenDisplayName
	branchName = strings.ReplaceAll(branchName, "🌿 ", "")
	branchName = strings.ReplaceAll(branchName, "🌎 ", "")
	branchName = strings.ReplaceAll(branchName, " (current)", "")
	branchName = strings.TrimSpace(branchName)

	selectedBranch, ok := branchesMap[branchName]
	if !ok {
		return
	}

	// 2. Select Branch action
	actions := []string{
		"🌿 Checkout to this branch",
		"➕ Create new branch from here",
		"❌ Delete this branch",
		"🔀 Merge this branch into current",
		"🔄 Rebase current onto this branch",
		"↩ Return",
	}

	actionChosen, err := ui.PromptSelect(fmt.Sprintf("Select operation for: %s", branchName), actions)
	if err != nil {
		return
	}

	ui.PrintBanner(ui.GetProjectInfo())
	switch {
	case strings.Contains(actionChosen, "Checkout"):
		res := RunGitCommand([]string{"checkout", branchName})
		if res.Success {
			fmt.Printf(ui.Success.Render("✔ Successfully checked out to: %s\n"), branchName)
		} else {
			fmt.Printf(ui.Error.Render("✖ Checkout failed: %s\n"), res.Stderr)
		}

	case strings.Contains(actionChosen, "Create new branch"):
		newBranch, err := ui.PromptInput("Enter new branch name:", "")
		if err != nil || newBranch == "" {
			return
		}
		res := RunGitCommand([]string{"checkout", "-b", newBranch, branchName})
		if res.Success {
			fmt.Printf(ui.Success.Render("✔ Successfully created and checked out branch: %s\n"), newBranch)
		} else {
			fmt.Printf(ui.Error.Render("✖ Branch creation failed: %s\n"), res.Stderr)
		}

	case strings.Contains(actionChosen, "Delete"):
		if selectedBranch.IsCurrent {
			fmt.Println(ui.Error.Render("✖ Cannot delete active current branch."))
			ui.PressEnterToContinue()
			return
		}
		confirm, _ := ui.PromptConfirm(fmt.Sprintf("Are you sure you want to delete branch: %s?", branchName), false)
		if confirm {
			res := RunGitCommand([]string{"branch", "-d", branchName})
			if !res.Success {
				// Try force delete
				force, _ := ui.PromptConfirm("Delete failed. Force delete (git branch -D)?", false)
				if force {
					res = RunGitCommand([]string{"branch", "-D", branchName})
				}
			}
			if res.Success {
				fmt.Printf(ui.Success.Render("✔ Branch deleted successfully: %s\n"), branchName)
			} else {
				fmt.Printf(ui.Error.Render("✖ Failed to delete branch: %s\n"), res.Stderr)
			}
		}

	case strings.Contains(actionChosen, "Merge"):
		confirm, _ := ui.PromptConfirm(fmt.Sprintf("Merge %s into your current branch?", branchName), true)
		if confirm {
			res := RunGitCommand([]string{"merge", branchName})
			if res.Success {
				fmt.Println(ui.Success.Render("✔ Merged successfully."))
			} else {
				fmt.Println(ui.Error.Render("✖ Merge failed: " + res.Stderr))
			}
		}

	case strings.Contains(actionChosen, "Rebase"):
		confirm, _ := ui.PromptConfirm(fmt.Sprintf("Rebase current branch onto %s?", branchName), true)
		if confirm {
			res := RunGitCommand([]string{"rebase", branchName})
			if res.Success {
				fmt.Println(ui.Success.Render("✔ Rebased successfully."))
			} else {
				fmt.Println(ui.Error.Render("✖ Rebase failed: " + res.Stderr))
			}
		}
	}
	ui.PressEnterToContinue()
}

// ==========================================
// 3. RELEASE TAG WIZARD
// ==========================================

func CreateGitTag() {
	ui.PrintBanner(ui.GetProjectInfo())
	fmt.Println(ui.Accent.Render("  │  Create Git Tag"))
	fmt.Println()

	tagName, err := ui.PromptInput("Enter tag name (e.g., v1.0.0):", "")
	if err != nil || tagName == "" {
		return
	}

	tagMsg, err := ui.PromptInput("Enter tag message (optional):", "")
	if err != nil {
		return
	}

	confirm, _ := ui.PromptConfirm("Push this tag to origin?", true)
	if err != nil {
		return
	}

	fmt.Println("\nCreating local tag...")
	var tagRes GitResult
	if tagMsg != "" {
		tagRes = RunGitCommand([]string{"tag", "-a", tagName, "-m", tagMsg})
	} else {
		tagRes = RunGitCommand([]string{"tag", tagName})
	}

	if !tagRes.Success {
		fmt.Println(ui.Error.Render("✖ Failed to create tag: " + tagRes.Stderr))
		ui.PressEnterToContinue()
		return
	}
	fmt.Println(ui.Success.Render("✔ Local tag created successfully."))

	if confirm {
		fmt.Println("Pushing tag to remote...")
		pushRes := RunGitCommand([]string{"push", "origin", tagName})
		if pushRes.Success {
			fmt.Println(ui.Success.Render("✔ Tag successfully pushed to origin remote."))
		} else {
			fmt.Println(ui.Error.Render("✖ Failed to push tag: " + pushRes.Stderr))
		}
	}
	ui.PressEnterToContinue()
}

// ==========================================
// 4. GITHUB RELEASE WIZARD
// ==========================================

func GetGitHubRepoDetails() (string, string, bool) {
	res := RunGitCommand([]string{"remote", "get-url", "origin"})
	if !res.Success || res.Stdout == "" {
		return "", "", false
	}
	url := res.Stdout
	// match git@github.com:owner/repo.git or https://github.com/owner/repo
	parts := strings.Split(url, "github.com")
	if len(parts) < 2 {
		return "", "", false
	}
	path := strings.Trim(parts[1], ":/ ")
	path = strings.TrimSuffix(path, ".git")
	subparts := strings.Split(path, "/")
	if len(subparts) < 2 {
		return "", "", false
	}
	return subparts[0], subparts[1], true
}

func CreateGitHubRelease() {
	ui.PrintBanner(ui.GetProjectInfo())
	fmt.Println(ui.Accent.Render("  │  Create GitHub Release"))
	fmt.Println()

	owner, repo, ok := GetGitHubRepoDetails()
	if !ok {
		fmt.Println(ui.Error.Render("✖ Could not resolve GitHub repository details from git remote origin URL."))
		ui.PressEnterToContinue()
		return
	}

	tagName, err := ui.PromptInput("Enter tag name (e.g. v1.0.0):", "")
	if err != nil || tagName == "" {
		return
	}

	title, err := ui.PromptInput("Enter release title:", "Release "+tagName)
	if err != nil {
		return
	}

	body, err := ui.PromptInput("Enter description notes (optional):", "")
	if err != nil {
		return
	}

	draft, err := ui.PromptConfirm("Is this a draft release?", false)
	if err != nil {
		return
	}

	prerelease, err := ui.PromptConfirm("Is this a pre-release?", false)
	if err != nil {
		return
	}

	// Retrieve token
	token := os.Getenv("GITHUB_TOKEN")
	if token == "" {
		token = os.Getenv("GH_TOKEN")
	}
	if token == "" {
		token = config.GetStoredToken()
	}

	if token == "" {
		fmt.Println(ui.Warning.Render("\n⚠️  No GITHUB_TOKEN or GH_TOKEN found."))
		newToken, err := ui.PromptInput("Paste your GitHub Personal Access Token (PAT):", "")
		if err != nil || newToken == "" {
			return
		}
		token = newToken
		save, _ := ui.PromptConfirm("Store this token locally for future releases?", true)
		if save {
			config.SaveStoredToken(token)
		}
	}

	fmt.Println("\nCreating GitHub Release...")
	
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases", owner, repo)
	
	reqBody, _ := json.Marshal(map[string]interface{}{
		"tag_name":         tagName,
		"name":             title,
		"body":             body,
		"draft":            draft,
		"prerelease":       prerelease,
		"target_commitish": "main", // fallback default
	})

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(reqBody))
	if err != nil {
		fmt.Println(ui.Error.Render("✖ Request failed: " + err.Error()))
		ui.PressEnterToContinue()
		return
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("User-Agent", "devD-CLI-Go")
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Println(ui.Error.Render("✖ Connection failed: " + err.Error()))
		ui.PressEnterToContinue()
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusCreated || resp.StatusCode == http.StatusOK {
		var resData struct {
			HTMLURL string `json:"html_url"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&resData)
		fmt.Println(ui.Success.Render("\n✔ GitHub Release created successfully!"))
		fmt.Println(ui.Info.Render("URL: " + resData.HTMLURL))
	} else {
		var errData struct {
			Message string `json:"message"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&errData)
		fmt.Printf(ui.Error.Render("\n✖ Release failed (status %d): %s\n"), resp.StatusCode, errData.Message)
	}
	ui.PressEnterToContinue()
}
