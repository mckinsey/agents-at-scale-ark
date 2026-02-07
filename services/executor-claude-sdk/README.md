# executor-claude-sdk

Claude Agent SDK executor for Ark. Executes agents using the [Claude Agent SDK](https://docs.claude.com/en/docs/agent-sdk/overview) with autonomous tools, extended thinking, structured outputs, and streaming.

## Quickstart

```bash
make help
make install
make dev
```

## Features

- **Autonomous Tools** - Built-in tools for file operations (Read, Write, Edit), shell execution (Bash), search (Glob, Grep), and web access (WebSearch, WebFetch)
- **Extended Thinking** - Enable deeper reasoning with configurable thinking token budget
- **Structured Outputs** - Return validated JSON matching a schema via `outputSchema`
- **Streaming** - Real-time response streaming via SSE
- **Token Tracking** - Automatic token usage reporting
- **Subagent Support** - Enable Task tool for multi-agent workflows

## Agent Configuration

Configure agent behavior using labels on the Agent CRD:

| Label | Default | Description |
|-------|---------|-------------|
| `claude-max-turns` | `50` | Maximum conversation turns before stopping |
| `claude-permission-mode` | `bypassPermissions` | Permission handling (`bypassPermissions`, `acceptEdits`, `plan`) |
| `claude-cwd` | `/workspace` | Working directory for file operations |
| `claude-tools` | (default set) | Comma-separated tool list, or `all` for all tools |
| `claude-extended-thinking` | `false` | Enable extended thinking mode |
| `claude-thinking-tokens` | `10000` | Max thinking tokens (when extended thinking enabled) |

### Available Tools

**Default tools** (enabled by default):
- `Read`, `Write`, `Edit` - File operations
- `Bash` - Shell command execution
- `Glob`, `Grep` - File and content search
- `WebSearch`, `WebFetch` - Web access

**Additional tools** (enable with `claude-tools: "all"` or list explicitly):
- `TodoWrite` - Task list management
- `NotebookEdit` - Jupyter notebook editing
- `Task` - Spawn subagents

### Example Agent

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: code-assistant
  labels:
    claude-max-turns: "100"
    claude-extended-thinking: "true"
    claude-thinking-tokens: "20000"
    claude-tools: "all"
spec:
  executionEngine: claude-sdk
  model: claude-sonnet-4
  prompt: |
    You are a senior software engineer. Analyze code, suggest improvements,
    and implement changes when requested. Use extended thinking for complex
    architectural decisions.
```

### Extended Thinking Example

Enable extended thinking for complex reasoning tasks:

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: architect-agent
  labels:
    claude-extended-thinking: "true"
    claude-thinking-tokens: "50000"
spec:
  executionEngine: claude-sdk
  model: claude-sonnet-4
  prompt: You are a software architect. Think deeply about system design.
```

When extended thinking is enabled, the agent's reasoning process is included in responses wrapped in `<thinking>` tags.

### Structured Outputs Example

Return validated JSON using `outputSchema`:

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: analyzer-agent
spec:
  executionEngine: claude-sdk
  model: claude-sonnet-4
  prompt: Analyze the provided code and return structured findings.
  outputSchema:
    type: object
    properties:
      summary:
        type: string
      issues:
        type: array
        items:
          type: object
          properties:
            severity:
              type: string
              enum: ["low", "medium", "high"]
            description:
              type: string
          required: ["severity", "description"]
    required: ["summary", "issues"]
```

## Model Configuration

The executor uses the model name from the Model CRD. Model-specific parameters like temperature are not exposed through the Claude Agent SDK.

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Model
metadata:
  name: claude-sonnet-4
spec:
  name: claude-sonnet-4-20250514
  provider: anthropic
  credentials:
    secretRef:
      name: anthropic-credentials
      key: api-key
```

## Security

The executor runs with secure defaults following [Claude SDK deployment guidelines](https://docs.claude.com/en/docs/agent-sdk/secure-deployment).

### Filesystem Isolation (Default)

By default, the container runs with:
- **Read-only root filesystem** - Prevents persistent modifications to the container
- **Ephemeral workspace** - `/workspace` uses `emptyDir` that's cleared on pod restart
- **Ephemeral tmp** - `/tmp` uses `emptyDir` with size limits

This ensures agent-written files don't persist between pod restarts, preventing:
- Accumulated malicious code from prompt injection attacks
- Data leakage between queries
- Disk exhaustion from accumulated files

Configure workspace size in `values.yaml`:

```yaml
workspace:
  enabled: true
  sizeLimit: "1Gi"

tmpVolume:
  enabled: true
  sizeLimit: "256Mi"
```

### SDK Sandboxing (Optional)

For additional isolation, enable the Claude SDK's built-in sandboxing which uses OS-level primitives (bubblewrap on Linux) to restrict filesystem and network access.

To enable, pass sandbox configuration via environment:

```yaml
env:
  CLAUDE_SANDBOX_ENABLED: "true"
  CLAUDE_SANDBOX_AUTO_ALLOW_BASH: "true"
  CLAUDE_SANDBOX_EXCLUDED_COMMANDS: "docker,kubectl"
  CLAUDE_SANDBOX_ALLOW_LOCAL_BINDING: "true"
  CLAUDE_SANDBOX_ALLOW_UNIX_SOCKETS: "/var/run/docker.sock"
  CLAUDE_SANDBOX_ALLOW_UNSANDBOXED: "false"
```

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_SANDBOX_ENABLED` | `false` | Enable SDK sandboxing |
| `CLAUDE_SANDBOX_AUTO_ALLOW_BASH` | `false` | Auto-approve bash commands when sandboxed |
| `CLAUDE_SANDBOX_EXCLUDED_COMMANDS` | - | Comma-separated commands that bypass sandbox |
| `CLAUDE_SANDBOX_ALLOW_LOCAL_BINDING` | `false` | Allow binding to local ports |
| `CLAUDE_SANDBOX_ALLOW_UNIX_SOCKETS` | - | Comma-separated unix socket paths to allow |
| `CLAUDE_SANDBOX_ALLOW_UNSANDBOXED` | `false` | Allow model to request unsandboxed execution |

Sandboxing provides:
- **Command isolation** - Restrict which commands can run unsandboxed
- **Network control** - Control local port binding and unix socket access
- **OS-level enforcement** - Restrictions apply to all spawned processes

See the [Claude Agent SDK sandbox docs](https://docs.anthropic.com/en/docs/agent-sdk/python#sandbox-configuration) for details.

### Network Isolation (Optional)

For high-security deployments, add a NetworkPolicy to restrict egress:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: executor-claude-sdk-egress
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: executor-claude-sdk
  policyTypes:
    - Egress
  egress:
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
      ports:
        - protocol: TCP
          port: 443
```

### Security Recommendations

| Scenario | Recommended Configuration |
|----------|--------------------------|
| Development | Defaults (ephemeral workspace) |
| Production | Defaults + NetworkPolicy |
| Multi-tenant | Defaults + SDK sandboxing + NetworkPolicy |
| Processing untrusted content | Full isolation: sandboxing + strict NetworkPolicy + per-query pods |

## Git Repository Integration

Clone repositories into the workspace before execution, and optionally commit/push changes after. This enables agents to work with codebases, access skills, or contribute to repositories.

### Clone Configuration (Agent Labels)

| Label | Description |
|-------|-------------|
| `git-repo-url` | Repository URL (required to enable) |
| `git-branch` | Branch to checkout (default: `main`) |
| `git-path` | Subdirectory to clone into |
| `git-sparse-paths` | Comma-separated paths for sparse checkout |
| `git-depth` | Clone depth (default: `0` = full, `1` for shallow) |
| `git-auto-commit` | Commit changes after execution |
| `git-auto-push` | Push after commit (implies auto-commit) |
| `git-commit-message` | Commit message |
| `git-push-branch` | Target branch for push |

### Secrets (Environment Variables)

| Variable | Description |
|----------|-------------|
| `GIT_AUTH_TOKEN` | HTTPS auth token for private repos |
| `GIT_SSH_KEY_PATH` | Path to SSH key (default: `/secrets/git-ssh-key`) |
| `GIT_USER_NAME` | Git commit author name |
| `GIT_USER_EMAIL` | Git commit author email |
| `GIT_SSH_STRICT_HOST_KEY` | Enable SSH host key verification |

### Example

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: code-reviewer
  labels:
    git-repo-url: "https://github.com/org/repo.git"
    git-branch: "main"
spec:
  executionEngine:
    name: executor-claude-sdk
  modelRef:
    name: claude-sonnet
  prompt: Review the code in /workspace.
```

Query parameters (`git_branch`, `git_repo_url`, etc.) can override labels per-query. See [execution-engines docs](/developer-guide/execution-engines) for full documentation.

## MCP Servers

Connect to external MCP servers for additional tool capabilities. Configure via environment variables:

```yaml
env:
  ARK_MCP_SERVER_GITHUB_URL: "https://mcp.github.com/sse"
  ARK_MCP_SERVER_GITHUB_LABEL: "github"
  ARK_MCP_SERVER_GITHUB_HEADERS: "Authorization=Bearer token"
```

| Variable Pattern | Description |
|------------------|-------------|
| `ARK_MCP_SERVER_{NAME}_URL` | Server URL (required) |
| `ARK_MCP_SERVER_{NAME}_LABEL` | Server label for tool names (default: lowercase NAME) |
| `ARK_MCP_SERVER_{NAME}_TYPE` | Server type: `sse` (default) or `stdio` |
| `ARK_MCP_SERVER_{NAME}_HEADERS` | Comma-separated key=value headers |
| `ARK_MCP_SERVER_{NAME}_COMMAND` | Command for stdio servers |
| `ARK_MCP_SERVER_{NAME}_ARGS` | Comma-separated args for stdio servers |

MCP tools are automatically added to allowed tools as `mcp__{label}__*`.

## Hooks

The executor includes built-in hooks for logging and auditing:

- **PreToolUse** - Logs tool name and input keys before execution
- **PostToolUse** - Logs tool completion

Hook output appears in executor logs at INFO level.

## Telemetry

The executor integrates with OpenTelemetry for distributed tracing. Traces are automatically created for:

- Overall execution span
- Individual tool calls

Traces link to Ark's parent trace via W3C trace context headers (`traceparent`, `tracestate`).

### Configuration

| Environment Variable          | Description                             |
| ----------------------------- | --------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP collector endpoint                 |
| `OTEL_SERVICE_NAME`           | Service name (default: claude-executor) |

## Subagents

Define specialized subagents via `agent.parameters.subagents`. The main agent can spawn these using the `Task` tool.

```yaml
spec:
  parameters:
    subagents:
      researcher:
        description: "Research technical topics"
        tools: ["WebSearch", "WebFetch", "Read"]
      coder:
        description: "Write code"
        tools: ["Read", "Write", "Edit", "Bash"]
        model: "claude-sonnet-4-20250514"
```

| Field         | Required | Description                      |
| ------------- | -------- | -------------------------------- |
| `description` | Yes      | What the subagent does           |
| `prompt`      | No       | System prompt for subagent       |
| `tools`       | No       | Allowed tools (subset of parent) |
| `model`       | No       | Model override                   |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Server bind address |
| `PORT` | `8000` | Server port |
| `ANTHROPIC_API_KEY` | - | API key (can also use Model CRD credentials) |

## Helm Values

Key configuration options in `chart/values.yaml`:

```yaml
securityContext:
  readOnlyRootFilesystem: true

workspace:
  enabled: true
  sizeLimit: "1Gi"

tmpVolume:
  enabled: true
  sizeLimit: "256Mi"

env:
  HOST: "0.0.0.0"
  PORT: "8000"

executionEngine:
  description: "Claude Agent SDK Executor"
  timeout: "30m"
  streaming: true
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/execute` | POST | Execute agent (blocking) |
| `/execute-stream` | POST | Execute agent (SSE streaming) |

## Notes

- Requires `ANTHROPIC_API_KEY` environment variable or Ark Model CRD with credentials
- `spec.tools` on Agent CRD is ignored; Claude uses its built-in autonomous tools
- Container includes Node.js runtime for Claude Code CLI
- Default timeout is 30 minutes; suitable for long-running autonomous tasks
- Permission mode `bypassPermissions` skips tool approval prompts for automated execution
- Workspace is ephemeral by default; files are cleared on pod restart
- Design queries to be idempotent when possible (clone, analyze, report in one query)
