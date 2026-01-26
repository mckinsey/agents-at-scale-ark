# Claude SDK Executor

An execution engine for Ark that uses Claude Agent SDK for agent execution with lifecycle hooks, critic validation, and git workspace management.

## Features

- **Claude Agent SDK Integration**: Uses Claude's native built-in tools (Read, Edit, Write, Bash, Glob, Grep, Skill)
- **ExecutionProfile Support**: Reusable, SDK-agnostic execution workflows
- **Lifecycle Hooks**: Pre/post execution hooks for git operations, PR creation, notifications
- **Critic Validation**: Inline (session continuity) and subagent validation modes
- **Git Workspace**: Automatic git clone, branch creation, commit, and push
- **Multi-Provider Authentication**: Supports Anthropic direct, AWS Bedrock, Google Vertex AI, and Azure AI Foundry
- **Telemetry**: Full execution telemetry capture for observability
- **Subagents**: Parallel task execution with context isolation and specialized tools
- **Structured Outputs**: JSON Schema validation for consistent parseable responses
- **File Checkpointing**: Track and rollback file changes on critic failure
- **Sandbox Mode**: Secure bash execution with network/filesystem restrictions
- **Fallback Model**: Automatic failover to backup model for resilience
- **Declarative Hooks**: YAML-configurable security policies (block commands, audit changes)
- **System Prompt Presets**: Use Claude Code's system prompt with custom additions
- **Skills Loading**: Load specialized capabilities from `.claude/skills/` directories

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
      allowedTools: [Read, Edit, Write, Bash, Glob, Grep, Skill]
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

## Advanced Features

### Subagents

Define specialized subagents for parallel task execution with isolated context and restricted tools:

```yaml
sdkConfig:
  claude:
    allowedTools: [Read, Edit, Write, Bash, Glob, Grep, Task]
    subagents:
      code-reviewer:
        description: "Expert code review specialist"
        prompt: "You are a code review specialist. Analyze code quality, security, and best practices."
        tools: [Read, Grep, Glob]
        model: claude-haiku-4-5  # Optional model override
      test-writer:
        description: "Unit test generator"
        prompt: "You write comprehensive unit tests following best practices."
        tools: [Read, Write, Bash]
```

When subagents are configured, the `Task` tool is automatically added to allowed tools.

### Structured Outputs

Enforce JSON Schema validation for consistent parseable responses:

```yaml
sdkConfig:
  claude:
    outputFormat:
      type: json_schema
      schema:
        type: object
        properties:
          summary:
            type: string
            description: "Brief summary of changes"
          files_changed:
            type: array
            items:
              type: string
          confidence:
            type: number
            minimum: 0
            maximum: 1
        required: [summary, files_changed]
```

The structured output is captured in telemetry as `structured_output`.

### File Checkpointing

Track file changes and automatically rollback on critic failure:

```yaml
sdkConfig:
  claude:
    fileCheckpointing:
      enabled: true
      rollbackOnCriticFailure: true

critic:
  enabled: true
  mode: inline
```

When enabled, the executor captures checkpoint UUIDs during execution and can rewind files to their state before agent modifications if the critic rejects the output.

### Sandbox Mode

Enable secure bash execution for multi-tenant or untrusted content scenarios:

```yaml
sdkConfig:
  claude:
    sandbox:
      enabled: true
      autoAllowBashIfSandboxed: true
      excludedCommands: [docker, kubectl, aws]
      network:
        allowLocalBinding: true
```

### Fallback Model

Specify a fallback model for resilience when the primary model fails:

```yaml
sdkConfig:
  claude:
    model: claude-sonnet-4-20250514
    fallbackModel: claude-haiku-4-5-20251001
```

### Declarative Security Hooks

Configure security policies via YAML without code:

```yaml
sdkConfig:
  claude:
    hooks:
      # Built-in presets for common security policies
      presets:
        - block-dangerous-commands  # Blocks rm -rf, sudo, chmod 777, etc.
        - audit-file-changes        # Logs all file writes
      
      # Custom patterns
      preToolUse:
        - pattern: "\.env$"
          action: block
          reason: "Cannot modify .env files"
        - pattern: "secrets?|password|api.?key"
          action: block
          reason: "Cannot access secret files"
      
      postToolUse:
        - pattern: "Write|Edit"
          action: audit
```

Available presets:
- `block-dangerous-commands`: Blocks `rm -rf`, `sudo`, `chmod 777`, `mkfs`, `dd if=`
- `audit-file-changes`: Logs all Write and Edit operations

### System Prompt Presets

Use Claude Code's full system prompt with custom additions:

```yaml
sdkConfig:
  claude:
    systemPrompt:
      type: preset
      preset: claude_code  # Use Claude Code's system prompt
      append: |
        Additional project-specific instructions:
        - Follow our coding standards at /docs/standards.md
        - Always run tests before committing
```

Alternatively, use a fully custom system prompt:

```yaml
sdkConfig:
  claude:
    systemPrompt:
      type: custom
      custom: "You are a specialized agent for financial services..."
```

### Skills Loading

Skills are specialized capabilities defined as `SKILL.md` files in `.claude/skills/` directories. They are automatically discovered and loaded when:

1. `setting_sources` includes `project` (default)
2. `Skill` is in `allowedTools` (default)

Example `.claude/skills/database-migration.SKILL.md`:

```markdown
---
name: database-migration
description: Generate and apply database migrations
---

## Instructions

When asked to create a database migration:
1. Analyze the current schema in /db/schema.sql
2. Generate migration file in /db/migrations/
3. Update the schema documentation
```

Configure in ExecutionProfile:

```yaml
sdkConfig:
  claude:
    allowedTools: [Read, Edit, Write, Bash, Glob, Grep, Skill]
    settingSources: [project]  # Required for Skills discovery
```

Claude will automatically discover and invoke skills when the task matches their description.

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

## Lifecycle Hooks (ExecutionProfile)

> **Note:** These lifecycle hooks are **not part of the Claude SDK**. They are custom additions to this executor that run deterministically before and after Claude SDK execution. They are configured via the `preExecute`, `postExecute`, and `onFailure` fields in the ExecutionProfile CRD.

The executor wraps Claude SDK execution with deterministic lifecycle phases:

```
┌─────────────────────────────────────────┐
│  preExecute hooks (deterministic)       │  ← ExecutionProfile.spec.preExecute
│  git_clone, git_create_branch, etc.     │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  Claude SDK execution (non-deterministic)│  ← Claude decides what to do
│  + Claude SDK hooks (PreToolUse, etc.)   │  ← sdkConfig.claude.hooks
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  postExecute hooks (deterministic)       │  ← ExecutionProfile.spec.postExecute
│  git_commit, git_push, pr_create, etc.   │
└─────────────────────────────────────────┘
```

### Available Lifecycle Hooks

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

### Claude SDK Hooks vs Lifecycle Hooks

| Type | Configured In | When They Run | Purpose |
|------|---------------|---------------|---------|
| **Lifecycle hooks** | `ExecutionProfile.spec.preExecute/postExecute` | Before/after SDK execution | Git ops, PR creation, notifications |
| **Claude SDK hooks** | `sdkConfig.claude.hooks` | During SDK execution (per tool call) | Security policies, auditing, blocking |

Lifecycle hooks are deterministic and always run in order. Claude SDK hooks are event-driven and fire when Claude uses specific tools.

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
