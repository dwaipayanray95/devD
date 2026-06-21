package git

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"

	"github.com/dwaipayanray95/devD/internal/logger"
)

type GitResult struct {
	Success bool
	Stdout  string
	Stderr  string
	Error   error
}

type ChangedFile struct {
	Path      string
	Type      string
	State     string // "staged", "unstaged", "both", "conflict"
	RawStatus string
}

type AheadBehindResult struct {
	Branch      string
	Ahead       int
	Behind      int
	HasUpstream bool
}

type CommitInfo struct {
	Hash    string
	Message string
	Author  string
}

type BranchInfo struct {
	Name      string
	IsCurrent bool
	IsRemote  bool
}

func RunGitCommand(args []string) GitResult {
	cmdStr := "git " + strings.Join(args, " ")
	cmd := exec.Command("git", args...)
	
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	stdoutStr := strings.TrimSpace(stdout.String())
	stderrStr := strings.TrimSpace(stderr.String())

	if err != nil {
		logger.LogMessage(fmt.Sprintf("Failed: %s - Error: %s - Stderr: %s", cmdStr, err.Error(), stderrStr), "ERROR")
		return GitResult{
			Success: false,
			Stdout:  stdoutStr,
			Stderr:  stderrStr,
			Error:   err,
		}
	}

	logger.LogMessage(fmt.Sprintf("Executed: %s", cmdStr), "INFO")
	return GitResult{
		Success: true,
		Stdout:  stdoutStr,
		Stderr:  stderrStr,
	}
}

func IsGitRepository() bool {
	res := RunGitCommand([]string{"rev-parse", "--is-inside-work-tree"})
	return res.Success && res.Stdout == "true"
}

func GetChangedFiles() ([]ChangedFile, error) {
	res := RunGitCommand([]string{"status", "--porcelain"})
	if !res.Success {
		return nil, res.Error
	}
	if res.Stdout == "" {
		return nil, nil
	}

	var files []ChangedFile
	lines := strings.Split(res.Stdout, "\n")
	for _, line := range lines {
		if len(line) < 4 {
			continue
		}
		status := line[:2]
		filePath := strings.Trim(line[3:], "\" ")
		
		state := "unstaged"
		fileType := "Modified"

		if status == "??" {
			fileType = "Untracked"
		} else if status == " A" || status == "A " {
			fileType = "Added"
			if status == "A " {
				state = "staged"
			}
		} else if status == " D" || status == "D " {
			fileType = "Deleted"
			if status == "D " {
				state = "staged"
			}
		} else if status == "M " {
			fileType = "Modified"
			state = "staged"
		} else if status == " M" {
			fileType = "Modified"
			state = "unstaged"
		} else if status == "MM" {
			fileType = "Modified (Staged & Unstaged)"
			state = "both"
		} else if status == "R " {
			fileType = "Renamed"
			state = "staged"
		} else if status == "UU" || status == "U" || strings.Contains(status, "U") {
			fileType = "Conflict"
			state = "conflict"
		}

		files = append(files, ChangedFile{
			Path:      filePath,
			Type:      fileType,
			State:     state,
			RawStatus: status,
		})
	}
	return files, nil
}

func StageFiles(files []string) GitResult {
	if len(files) == 1 && files[0] == "all" {
		return RunGitCommand([]string{"add", "."})
	}
	args := append([]string{"add"}, files...)
	return RunGitCommand(args)
}

func UnstageFiles(files []string) GitResult {
	if len(files) == 1 && files[0] == "all" {
		return RunGitCommand([]string{"reset", "HEAD"})
	}
	args := append([]string{"reset", "HEAD"}, files...)
	return RunGitCommand(args)
}

func Commit(message string) GitResult {
	cmd := exec.Command("git", "commit", "-m", message)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	err := cmd.Run()
	if err != nil {
		return GitResult{
			Success: false,
			Error:   err,
		}
	}
	return GitResult{
		Success: true,
		Stdout:  "Commit created successfully",
	}
}

func GetLocalBranches() ([]string, error) {
	res := RunGitCommand([]string{"branch"})
	if !res.Success {
		return nil, res.Error
	}
	var branches []string
	lines := strings.Split(res.Stdout, "\n")
	for _, line := range lines {
		name := strings.TrimSpace(strings.ReplaceAll(line, "*", ""))
		if name != "" {
			branches = append(branches, name)
		}
	}
	return branches, nil
}

func GetAheadBehind() (AheadBehindResult, error) {
	branchRes := RunGitCommand([]string{"symbolic-ref", "--short", "HEAD"})
	if !branchRes.Success {
		branchRes = RunGitCommand([]string{"rev-parse", "--abbrev-ref", "HEAD"})
	}
	if !branchRes.Success {
		return AheadBehindResult{Branch: "unknown", Ahead: 0, Behind: 0, HasUpstream: false}, errors.New("cannot resolve HEAD branch")
	}
	branch := branchRes.Stdout

	upstreamRes := RunGitCommand([]string{"rev-parse", "--abbrev-ref", "HEAD@{upstream}"})
	if !upstreamRes.Success {
		return AheadBehindResult{Branch: branch, Ahead: 0, Behind: 0, HasUpstream: false}, nil
	}

	diffRes := RunGitCommand([]string{"rev-list", "--left-right", "--count", "HEAD...HEAD@{upstream}"})
	if !diffRes.Success {
		return AheadBehindResult{Branch: branch, Ahead: 0, Behind: 0, HasUpstream: true}, nil
	}

	parts := strings.Fields(diffRes.Stdout)
	if len(parts) < 2 {
		return AheadBehindResult{Branch: branch, Ahead: 0, Behind: 0, HasUpstream: true}, nil
	}

	ahead, _ := strconv.Atoi(parts[0])
	behind, _ := strconv.Atoi(parts[1])

	return AheadBehindResult{
		Branch:      branch,
		Ahead:       ahead,
		Behind:      behind,
		HasUpstream: true,
	}, nil
}

func Pull() GitResult {
	return RunGitCommand([]string{"pull", "--rebase"})
}

func Push() GitResult {
	ab, err := GetAheadBehind()
	if err == nil && !ab.HasUpstream {
		return RunGitCommand([]string{"push", "--set-upstream", "origin", ab.Branch})
	}
	return RunGitCommand([]string{"push"})
}

func GetStashes() ([]string, error) {
	res := RunGitCommand([]string{"stash", "list"})
	if !res.Success {
		return nil, res.Error
	}
	if res.Stdout == "" {
		return nil, nil
	}
	return strings.Split(res.Stdout, "\n"), nil
}

func StashSave(message string) GitResult {
	args := []string{"stash", "push"}
	if message != "" {
		args = append(args, "-m", message)
	}
	return RunGitCommand(args)
}

func StashPop() GitResult {
	return RunGitCommand([]string{"stash", "pop"})
}

func GetRecentCommits(limit int) ([]CommitInfo, error) {
	res := RunGitCommand([]string{"log", fmt.Sprintf("-n %d", limit), "--pretty=format:%h|%s|%an"})
	if !res.Success {
		return nil, res.Error
	}
	if res.Stdout == "" {
		return nil, nil
	}

	var commits []CommitInfo
	lines := strings.Split(res.Stdout, "\n")
	for _, line := range lines {
		parts := strings.Split(line, "|")
		if len(parts) >= 3 {
			commits = append(commits, CommitInfo{
				Hash:    parts[0],
				Message: parts[1],
				Author:  parts[2],
			})
		}
	}
	return commits, nil
}
