# Feature Developer Sample

An agent that develops features from descriptions, validates its own work, and creates pull requests.

## How It Works

```
┌─────────────────────────────────────────┐
│  preExecute (deterministic)             │
│  1. Clone repository                    │
│  2. Create feature branch               │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  Agent execution (non-deterministic)    │
│  - Explore codebase with Glob/Grep      │
│  - Read existing patterns               │
│  - Implement feature with Edit/Write    │
│  - Add tests                            │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  Inline critic (self-validation)        │
│  - Check completeness                   │
│  - Verify code quality                  │
│  - Retry if NEEDS_REVISION (max 2x)     │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  postExecute (deterministic)            │
│  - Commit changes                       │
│  - Push branch                          │
│  - Create pull request                  │
└─────────────────────────────────────────┘
```

The agent uses **full development tools** (Read, Edit, Write, Bash) to implement features. The inline critic validates the work before creating a PR.

## Key Feature: Inline Critic

This sample demonstrates **inline critic validation** - the agent reviews its own work in the same session before creating the PR. This ensures:

- Code compiles/lints correctly
- Implementation matches requirements
- No obvious issues before PR creation

## Files

| File | Description |
|------|-------------|
| `agent.yaml` | Agent definition with development guidelines |
| `execution-profile.yaml` | Workspace setup, inline critic, and PR creation |
| `query.yaml` | Example query (edit for your feature) |

## Tools Used

The agent has access to full development tools:

| Tool | Purpose |
|------|---------|
| `Read` | Read file contents to understand existing code |
| `Edit` | Modify existing files |
| `Write` | Create new files |
| `Bash` | Run commands (tests, linting, etc.) |
| `Glob` | Find files by pattern |
| `Grep` | Search for patterns in the codebase |
| `Skill` | Use `.claude/skills/` from the repository |

## Usage

1. Edit `query.yaml` with your repository and feature details:
   ```yaml
   parameters:
     - name: RepoUrl
       value: "git@github.com:your-org/your-repo.git"
     - name: FeatureName
       value: "user-auth"
     - name: FeatureDescription
       value: "Add JWT authentication with login/logout"
     - name: TargetPath
       value: "src/auth"
   ```

2. Apply the resources:
   ```bash
   kubectl apply -f agent.yaml
   kubectl apply -f execution-profile.yaml
   kubectl apply -f query.yaml
   ```

3. The agent will:
   - Clone your repo and create a feature branch
   - Implement the feature following existing patterns
   - Self-validate using the inline critic
   - Commit, push, and create a pull request

## Configuration

### Query Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `RepoUrl` | Repository URL (SSH or HTTPS) | `git@github.com:org/repo.git` |
| `FeatureName` | Short feature identifier | `user-auth` |
| `FeatureDescription` | What to implement | `Add JWT authentication...` |
| `TargetPath` | Directory to work in | `src/auth` |

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
