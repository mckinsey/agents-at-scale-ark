package content

import (
	"fmt"
	"os"
	"os/exec"
	"strings"

	"go.uber.org/zap"
)

type GitProvisioner struct {
	logger *zap.Logger
}

func NewGitProvisioner(logger *zap.Logger) *GitProvisioner {
	return &GitProvisioner{logger: logger}
}

func (g *GitProvisioner) Provision(params ProvisionParams) error {
	url, _ := params.Config["url"].(string)
	if url == "" {
		return fmt.Errorf("git url is required")
	}

	branch, _ := params.Config["branch"].(string)
	if branch == "" {
		branch = "main"
	}

	depth, _ := params.Config["depth"].(int)

	if token, ok := params.Credentials["token"]; ok && token != "" {
		url = buildAuthURL(url, token)
	}

	args := []string{"clone", "--single-branch", "-b", branch}
	if depth > 0 {
		args = append(args, "--depth", fmt.Sprintf("%d", depth))
	}
	args = append(args, url, ".")

	cmd := exec.Command("git", args...)
	cmd.Dir = params.TargetPath
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git clone failed: %s: %w", maskURL(string(output)), err)
	}

	g.logger.Info("git clone completed",
		zap.String("branch", branch),
		zap.String("target", params.TargetPath),
	)
	return nil
}

type GitCommitConfig struct {
	Enabled    bool
	Message    string
	PushBranch string
	UserName   string
	UserEmail  string
}

func (g *GitProvisioner) CommitAndPush(repoPath string, config *GitCommitConfig) error {
	if config == nil || !config.Enabled {
		return nil
	}

	env := append(os.Environ(), "GIT_TERMINAL_PROMPT=0")

	hasChanges, err := g.hasChanges(repoPath, env)
	if err != nil || !hasChanges {
		return err
	}

	userName := config.UserName
	if userName == "" {
		userName = "Ark Agent"
	}
	userEmail := config.UserEmail
	if userEmail == "" {
		userEmail = "ark-agent@noreply.github.com"
	}

	commands := [][]string{
		{"config", "user.name", userName},
		{"config", "user.email", userEmail},
		{"add", "-A"},
		{"commit", "-m", config.Message},
	}

	for _, args := range commands {
		cmd := exec.Command("git", args...)
		cmd.Dir = repoPath
		cmd.Env = env
		if output, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("git %s failed: %s: %w", args[0], string(output), err)
		}
	}

	if config.PushBranch != "" {
		cmd := exec.Command("git", "push", "origin", fmt.Sprintf("HEAD:%s", config.PushBranch))
		cmd.Dir = repoPath
		cmd.Env = env
		if output, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("git push failed: %s: %w", maskURL(string(output)), err)
		}
	}

	g.logger.Info("committed and pushed changes", zap.String("path", repoPath))
	return nil
}

type GitInfo struct {
	LastCommit string
	Dirty      bool
}

func (g *GitProvisioner) GetInfo(repoPath string) (*GitInfo, error) {
	env := append(os.Environ(), "GIT_TERMINAL_PROMPT=0")

	cmd := exec.Command("git", "rev-parse", "HEAD")
	cmd.Dir = repoPath
	cmd.Env = env
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git rev-parse HEAD failed: %w", err)
	}
	lastCommit := strings.TrimSpace(string(output))

	dirty, err := g.hasChanges(repoPath, env)
	if err != nil {
		return nil, err
	}

	return &GitInfo{
		LastCommit: lastCommit,
		Dirty:      dirty,
	}, nil
}

func (g *GitProvisioner) hasChanges(repoPath string, env []string) (bool, error) {
	cmd := exec.Command("git", "status", "--porcelain")
	cmd.Dir = repoPath
	cmd.Env = env
	output, err := cmd.Output()
	if err != nil {
		return false, fmt.Errorf("git status failed: %w", err)
	}
	return len(strings.TrimSpace(string(output))) > 0, nil
}

func buildAuthURL(url, token string) string {
	if !strings.HasPrefix(url, "https://") {
		return url
	}
	if strings.Contains(url, "github.com") {
		return strings.Replace(url, "https://", fmt.Sprintf("https://x-access-token:%s@", token), 1)
	}
	if strings.Contains(url, "gitlab") {
		return strings.Replace(url, "https://", fmt.Sprintf("https://oauth2:%s@", token), 1)
	}
	return strings.Replace(url, "https://", fmt.Sprintf("https://%s@", token), 1)
}

func maskURL(s string) string {
	if idx := strings.Index(s, "@"); idx > 0 {
		if prefix := strings.Index(s, "://"); prefix > 0 {
			return s[:prefix+3] + "***" + s[idx:]
		}
	}
	return s
}
