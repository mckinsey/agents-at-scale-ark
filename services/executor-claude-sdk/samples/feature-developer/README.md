# Feature Developer Sample

An agent that develops features from descriptions, validates its own work, and creates pull requests.

## What It Does

1. Clones the repository
2. Creates a feature branch
3. Implements the feature based on the description
4. Self-validates using inline critic
5. Commits, pushes, and creates a pull request

## Key Feature: Inline Critic

This sample demonstrates **inline critic validation** - the agent reviews its own work in the same session before creating the PR. This ensures:

- Code compiles/lints correctly
- Implementation matches requirements
- No obvious issues before PR creation

## Files

- `agent.yaml` - Feature developer agent with coding expertise
- `execution-profile.yaml` - Full workflow with inline critic and PR creation
- `query.yaml` - Example query to develop a feature

## Usage

```bash
# Apply the resources
kubectl apply -f . -n your-namespace

# Edit query.yaml with your feature details, then apply
kubectl apply -f query.yaml -n your-namespace

# Watch the result
kubectl get queries -n your-namespace -w
```

## Configuration

### Required Secrets

```bash
# GitHub token with repo scope (for PR creation)
kubectl create secret generic github-creds \
  --from-literal=token=$GITHUB_TOKEN

# SSH key for git operations
kubectl create secret generic git-ssh \
  --from-file=ssh-privatekey=$HOME/.ssh/id_ed25519
```

### Query Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `repo_url` | Repository SSH URL | `git@github.com:org/repo.git` |
| `feature_name` | Short feature identifier | `user-auth` |
| `feature_description` | What to implement | `Add JWT authentication...` |
| `target_path` | Directory to work in | `src/auth` |

## Inline Critic Configuration

The critic validates the agent's work before proceeding:

```yaml
critic:
  enabled: true
  mode: inline
  maxRetries: 2  # Agent gets 3 total attempts
  inline:
    prompt: |
      Review your implementation:
      1. Does it match the requirements?
      2. Are there any syntax errors?
      3. Is the code well-structured?
```

If the critic finds issues, the agent will attempt to fix them (up to `maxRetries` times).

## Customization

### Language-Specific Prompts

Edit `agent.yaml` to focus on your stack:

```yaml
prompt: |
  You are a TypeScript expert specializing in React applications.
  Follow these conventions:
  - Use functional components with hooks
  - Use TypeScript strict mode
  - Write unit tests with Jest
```

### Disable PR Creation

Remove the `pr_create` hook to just commit without creating a PR.
