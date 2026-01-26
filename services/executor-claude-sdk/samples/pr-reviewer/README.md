# PR Reviewer Sample

An agent that reviews pull requests by analysing local git diffs. No GitHub API access is required during the review - the PR branch is checked out locally by the execution profile.

## How It Works

```
┌─────────────────────────────────────────┐
│  preExecute (deterministic)             │
│  1. Clone repository                    │
│  2. Fetch PR branch                     │
│  3. Checkout PR branch                  │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  Agent execution (non-deterministic)    │
│  - git diff to see changes              │
│  - Read files for context               │
│  - Analyse and review                   │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  postExecute (deterministic)            │
│  - Submit review to GitHub              │
└─────────────────────────────────────────┘
```

The agent uses **local git commands** (`git diff`, `git log`) to analyse changes. This is more reliable than GitHub API calls and works in any git repository.

## Files

| File | Description |
|------|-------------|
| `agent.yaml` | Agent definition with review guidelines |
| `execution-profile.yaml` | Workspace setup and GitHub integration |
| `query.yaml` | Example query (edit for your PR) |

## Usage

1. Edit `query.yaml` with your repository and PR details:
   ```yaml
   parameters:
     - name: RepoUrl
       value: "git@github.com:your-org/your-repo.git"
     - name: PrNumber
       value: "42"
     - name: PrBranch
       value: "feature/your-feature"
     - name: BaseBranch
       value: "main"
   ```

2. Apply the resources:
```bash
   kubectl apply -f agent.yaml
   kubectl apply -f execution-profile.yaml
   kubectl apply -f query.yaml
   ```

3. The agent will:
   - Clone your repo and checkout the PR branch
   - Run `git diff` to see the changes
   - Analyse the code and provide feedback
   - Submit the review to GitHub (APPROVE or REQUEST_CHANGES)

## Tools Used

The agent has access to read-only tools:

| Tool | Purpose |
|------|---------|
| `Bash` | Run git commands (`git diff`, `git log`, etc.) |
| `Read` | Read file contents for additional context |
| `Glob` | Find related files (tests, configs) |
| `Grep` | Search for patterns in the codebase |

## Customisation

### Adjust Review Guidelines

Edit the `prompt` in `agent.yaml` to focus on specific concerns:
- Security-focused reviews
- Performance reviews
- Style/convention reviews

### Skip GitHub Posting

Remove the `postExecute` section from `execution-profile.yaml` if you just want the review output without posting to GitHub.

### Add Custom Checks

Enable `Skill` in `allowedTools` to let the agent use `.claude/skills/` from the repository for project-specific review scripts.
