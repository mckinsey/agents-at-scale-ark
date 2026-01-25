# Claude SDK Executor

An execution engine for Ark that uses Claude Agent SDK for agent execution with lifecycle hooks, critic validation, and git workspace management.

## Features

- **Claude Agent SDK Integration**: Uses Claude's native built-in tools (Read, Edit, Write, Bash, Glob, Grep)
- **ExecutionProfile Support**: Reusable, SDK-agnostic execution workflows
- **Lifecycle Hooks**: Pre/post execution hooks for git operations, PR creation, notifications
- **Critic Validation**: Inline (session continuity) and subagent validation modes
- **Git Workspace**: Automatic git clone, branch creation, commit, and push
- **Multi-Provider Authentication**: Supports Anthropic direct, AWS Bedrock, Google Vertex AI, and Azure AI Foundry
- **Telemetry**: Full execution telemetry capture for observability

## Architecture

The executor separates workflow into deterministic and non-deterministic phases:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DETERMINISTIC PHASE                                 │
│  Pre-Execute Hooks: git_clone → git_create_branch → ...                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       NON-DETERMINISTIC PHASE                               │
│  Claude Agent SDK: Claude decides what to read, write, execute              │
│  Critic Validation: Optional output validation with retry                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DETERMINISTIC PHASE                                 │
│  Post-Execute Hooks: git_commit → git_push → pr_create → ...                │
└─────────────────────────────────────────────────────────────────────────────┘
```

This separation ensures that git operations, PR creation, and notifications happen reliably regardless of agent behavior.

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 20+ (for Claude Code CLI)
- Claude Code CLI: `npm install -g @anthropic-ai/claude-code`
- API credentials (Anthropic, AWS Bedrock, GCP Vertex, or Azure Foundry)

### Local Development

```bash
# Install dependencies
uv sync

# Set up credentials (choose one)
export ANTHROPIC_API_KEY=your-key           # Anthropic direct
export CLAUDE_CODE_USE_BEDROCK=1            # AWS Bedrock
export CLAUDE_CODE_USE_VERTEX=1             # Google Vertex AI
export CLAUDE_CODE_USE_FOUNDRY=1            # Azure AI Foundry

# Run the executor
uv run executor-claude-sdk
```

### Kubernetes Deployment

```bash
# Deploy with Helm
helm install executor-claude-sdk ./chart \
  --set claude.provider=bedrock \
  --set git.sshKeySecret=git-ssh-key
```

## ExecutionProfile Example

```yaml
apiVersion: ark.mckinsey.com/v1prealpha1
kind: ExecutionProfile
metadata:
  name: feature-builder
spec:
  workspace:
    type: git
    git:
      branchPrefix: "agent/feature/"
  
  preExecute:
    - name: clone
      action: git_clone
    - name: branch
      action: git_create_branch
  
  execution:
    maxIterations: 25
    timeout: "30m"
  
  critic:
    enabled: true
    mode: inline
    inline:
      prompt: "Review the changes..."
      passCondition: "{{.CriticApproved}}"
  
  sdkConfig:
    claude:
      allowedTools: [Read, Edit, Write, Bash, Glob, Grep]
      permissionMode: acceptEdits
      settingSources: [project]
  
  postExecute:
    - name: commit
      action: git_commit
      condition: "{{.HasChanges}}"
    - name: push
      action: git_push
    - name: pr
      action: pr_create
```

## Agent Example

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: feature-developer
spec:
  prompt: |
    You are a senior software engineer.
    Write clean, tested, well-documented code.
  
  modelRef:
    name: platform-claude-sonnet
  
  executionEngine:
    name: claude-sdk-executor
    profileRef:
      name: feature-builder
```

## Available Hooks

| Action | Description | Parameters |
|--------|-------------|------------|
| `git_clone` | Clone a repository | `branch`, `depth`, `ref` |
| `git_create_branch` | Create and checkout new branch | `nameTemplate` |
| `git_checkout` | Checkout existing branch/ref | `ref` |
| `git_commit` | Stage and commit changes | `messageTemplate` |
| `git_push` | Push to remote | `remote`, `force` |
| `pr_create` | Create GitHub pull request | `titleTemplate`, `bodyTemplate`, `labels` |
| `pr_comment` | Comment on a pull request | `prNumber`, `body` |
| `pr_submit_review` | Submit PR review | `prNumber`, `bodyTemplate`, `event` |

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `HOST` | Server host | `0.0.0.0` |
| `PORT` | Server port | `8000` |
| `ANTHROPIC_API_KEY` | Anthropic API key (direct provider) | - |
| `CLAUDE_CODE_USE_BEDROCK` | Set to `1` to use AWS Bedrock | - |
| `CLAUDE_CODE_USE_VERTEX` | Set to `1` to use Google Vertex AI | - |
| `CLAUDE_CODE_USE_FOUNDRY` | Set to `1` to use Azure AI Foundry | - |
| `GITHUB_TOKEN` | GitHub token for PR operations | - |
| `GIT_SSH_KEY` | SSH key for git operations | - |

---

## Authentication & Model Configuration

### How Models Work

The executor uses the model name from the Ark Model CRD, but credentials come from deployment:

| What comes from Ark | What comes from deployment |
|---------------------|----------------------------|
| Model name (`spec.model`) | Authentication credentials |

**Important:** The Model CRD's `spec.config` section (API keys, base URLs) is **NOT** used by this executor. Only the model name is extracted. Credentials are configured at deployment time via environment variables.

This design ensures credentials never transit HTTP requests and operators can use their preferred auth method (secrets, workload identity, IRSA).

### Authentication Providers

| Provider | Environment Variables | Auth Method |
|----------|----------------------|-------------|
| Anthropic Direct | `ANTHROPIC_API_KEY=sk-...` | API key |
| AWS Bedrock | `CLAUDE_CODE_USE_BEDROCK=1` | AWS credentials (IRSA, instance profile) |
| Google Vertex AI | `CLAUDE_CODE_USE_VERTEX=1` | GCP credentials (workload identity) |
| Azure AI Foundry | `CLAUDE_CODE_USE_FOUNDRY=1` | Azure credentials (managed identity) |

### Model ID Formats

Different providers use different model ID formats:

| Provider | Example Model ID |
|----------|------------------|
| Anthropic | `claude-sonnet-4-20250514`, `claude-3-5-haiku-latest` |
| AWS Bedrock | `anthropic.claude-3-5-sonnet-20241022-v2:0` |
| Google Vertex | `claude-sonnet-4@20250514` |
| Azure Foundry | `claude-sonnet-4-20250514` |

### Helm Configuration Examples

#### Direct Anthropic API

```yaml
claude:
  provider: anthropic
  anthropic:
    apiKeySecret: my-anthropic-secret
    apiKeySecretKey: api-key
```

#### AWS Bedrock

```yaml
claude:
  provider: bedrock
  bedrock:
    region: us-east-1

serviceAccount:
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789:role/claude-executor
```

#### Google Vertex AI

```yaml
claude:
  provider: vertex
  vertex:
    project: my-gcp-project
    region: us-central1

serviceAccount:
  annotations:
    iam.gke.io/gcp-service-account: claude-executor@my-project.iam.gserviceaccount.com
```

#### Azure AI Foundry

```yaml
claude:
  provider: foundry
  foundry:
    endpoint: https://my-aoai.openai.azure.com/

serviceAccount:
  name: ark-tenant  # Uses workload identity
```

## Troubleshooting

### "No Claude authentication configured"

The executor couldn't find any authentication environment variables. Check that one of these is set:
- `ANTHROPIC_API_KEY`
- `CLAUDE_CODE_USE_BEDROCK=1` (with AWS credentials)
- `CLAUDE_CODE_USE_VERTEX=1` (with GCP credentials)
- `CLAUDE_CODE_USE_FOUNDRY=1` (with Azure credentials)

### "Claude Code CLI is not installed"

The Claude Agent SDK requires the Claude Code CLI. Install with:
```bash
npm install -g @anthropic-ai/claude-code
```

### Model not found errors

Ensure your Model CRD uses the correct model ID format for your provider. Bedrock and Vertex use different formats than direct Anthropic API.

## License

Copyright 2026 McKinsey & Company
