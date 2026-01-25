# PR Reviewer Sample

An agent that reviews pull requests and submits structured feedback.

## What It Does

1. Clones the repository
2. Checks out the PR branch
3. Reviews the code changes
4. Submits a GitHub review with approval or requested changes

## Files

- `agent.yaml` - The PR reviewer agent with code review expertise
- `execution-profile.yaml` - Workflow for cloning, reviewing, and submitting feedback
- `query.yaml` - Example query to review a specific PR

## Usage

```bash
# Apply the resources
kubectl apply -f . -n your-namespace

# Edit query.yaml with your PR details, then apply
kubectl apply -f query.yaml -n your-namespace

# Watch the result
kubectl get queries -n your-namespace -w
```

## Configuration

### Required Secrets

```bash
# GitHub token with repo scope
kubectl create secret generic github-creds \
  --from-literal=token=$GITHUB_TOKEN

# SSH key for git clone
kubectl create secret generic git-ssh \
  --from-file=ssh-privatekey=$HOME/.ssh/id_ed25519
```

### Query Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `repo_url` | Repository SSH URL | `git@github.com:org/repo.git` |
| `pr_number` | Pull request number | `123` |
| `pr_branch` | PR branch name | `feature/new-feature` |
| `base_branch` | Target branch | `main` |

## Customization

### Review Focus

Edit the agent prompt in `agent.yaml` to focus on specific aspects:
- Security vulnerabilities
- Performance issues
- Code style
- Test coverage

### Review Strictness

Adjust the prompt to be more or less strict:
```yaml
prompt: |
  You are a senior code reviewer. Be thorough but constructive.
  Focus on: security, performance, maintainability.
  Approve if the code is production-ready with minor suggestions.
```
