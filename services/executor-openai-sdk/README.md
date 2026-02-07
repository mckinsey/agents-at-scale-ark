# executor-openai-sdk

OpenAI Agents SDK executor for Ark. Executes agents using the [OpenAI Agents SDK](https://github.com/openai/openai-agents-sdk-python) with support for hosted tools, MCP integration, workspaces, and streaming.

## Quickstart

```bash
make help
make install
make dev
```

## Features

- **Web Search** - Built-in web search tool (enabled by default)
- **Code Interpreter** - Execute Python code in a sandboxed environment
- **File Search** - Search across OpenAI vector stores
- **Hosted MCP** - Connect to remote MCP servers for tool access
- **Workspaces** - Local file access via Codex tool with skills support
- **Streaming** - Real-time response streaming via SSE
- **Token Tracking** - Automatic token usage reporting

## Agent Configuration

Configure agent behavior using labels on the Agent CRD:

| Label                                  | Default | Description                                      |
| -------------------------------------- | ------- | ------------------------------------------------ |
| `openai-web-search`                    | `true`  | Enable built-in web search tool                  |
| `openai-code-interpreter`              | `false` | Enable code interpreter for Python execution     |
| `openai-code-interpreter-memory-limit` | `1g`    | Container memory: `1g`, `4g`, `16g`, or `64g`    |
| `openai-code-interpreter-container-id` | -       | Use explicit container ID instead of auto mode   |
| `openai-file-search-vector-stores`     | -       | Comma-separated vector store IDs for file search |
| `openai-codex`                         | `true`  | Enable Codex tool when workspace is available    |

### Example Agent

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: research-agent
  labels:
    openai-web-search: "true"
    openai-code-interpreter: "true"
    openai-code-interpreter-memory-limit: "4g"
    openai-file-search-vector-stores: "vs_abc123,vs_def456"
spec:
  executionEngine: openai-sdk
  model: gpt-4o
  prompt: |
    You are a research assistant with access to web search,
    code execution, and document retrieval capabilities.
```

## Workspace Integration

When a workspace is provided (via Ark Workspace CRD or git clone), the executor automatically enables the **Codex tool** to give agents local file access. This is the recommended approach for code-aware agents that need to read, write, or modify files.

### How It Works

1. **Workspace provision**: Ark provides a workspace path via:
   - **Workspace CRD**: Pre-provisioned PVC with git clone or container image content
   - **Git labels**: Agent-level git clone configuration (see Git Repository Integration)

2. **Codex activation**: When workspace path is available, the Codex tool is automatically added to the agent's toolset (unless `openai-codex: "false"`)

3. **Skills discovery**: Codex automatically discovers skills from `.agents/skills/` directories within the workspace

### Codex Tool Capabilities

The Codex tool wraps OpenAI's Codex CLI, providing:

- **File operations**: Read, write, and modify files in the workspace
- **Shell execution**: Run commands within a sandboxed environment
- **Code patching**: Apply targeted edits to source files
- **Skills support**: Execute task-specific skills bundled in the workspace

### Codex Configuration

| Label                       | Default            | Description                                |
| --------------------------- | ------------------ | ------------------------------------------ |
| `openai-codex`              | `true`             | Enable/disable Codex when workspace exists |
| `openai-codex-model`        | `gpt-5.2-codex`    | Model for Codex operations                 |
| `openai-codex-sandbox`      | `workspace-write`  | Sandbox mode (`workspace-write`, `none`)   |
| `openai-codex-approval-policy` | `never`         | Approval policy (`never`, `always`)        |
| `openai-codex-network`      | `true`             | Allow network access                       |
| `openai-codex-idle-timeout` | `120`              | Idle timeout in seconds                    |

Environment variable overrides: `CODEX_MODEL`, `CODEX_SANDBOX_MODE`, `CODEX_APPROVAL_POLICY`, `CODEX_NETWORK_ACCESS`, `CODEX_IDLE_TIMEOUT`.

### Skills

Skills are task-specific capabilities bundled with your codebase. Place skills in `.agents/skills/` relative to the workspace root:

```
workspace/
├── .agents/
│   └── skills/
│       ├── build-project/
│       │   ├── SKILL.md          # Skill instructions
│       │   └── scripts/
│       │       └── build.sh      # Supporting scripts
│       └── run-tests/
│           └── SKILL.md
├── src/
└── ...
```

Each skill directory contains a `SKILL.md` with instructions the agent follows when the skill is invoked. Skills are automatically discovered by Codex from the working directory.

### Example: Workspace Agent

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Workspace
metadata:
  name: my-project
spec:
  environment:
    image: python:3.12-slim
  content:
    git:
      repository: https://github.com/org/my-project.git
      branch: main
---
apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: code-assistant
  labels:
    openai-codex: "true"
    openai-web-search: "false"
spec:
  executionEngine:
    name: executor-openai-sdk
  workspaceRef:
    name: my-project
  modelRef:
    name: gpt-4o
  prompt: |
    You are a coding assistant. Use the codex tool to read, understand,
    and modify code in the workspace. Check .agents/skills/ for available
    skills that can help with common tasks.
```

### Hosted Tools vs Codex

| Capability         | Hosted Tools                          | Codex Tool                    |
| ------------------ | ------------------------------------- | ----------------------------- |
| File access        | Cloud vector stores only              | Local workspace files         |
| Code execution     | Sandboxed Python (CodeInterpreter)    | Full shell access (sandboxed) |
| Skills             | Not supported                         | Auto-discovered from workspace |
| Network access     | Cloud-based                           | Configurable per-agent        |
| Use case           | General-purpose, cloud-first          | Code-aware, workspace-centric |

Use hosted tools (WebSearch, CodeInterpreter, FileSearch) for cloud-first workflows. Use Codex for agents that need to work with local codebases, apply patches, or leverage skills.

## Model Settings

Configure model behavior via the Model CRD's `properties` field:

| Property              | Type   | Description                                      |
| --------------------- | ------ | ------------------------------------------------ |
| `temperature`         | float  | Sampling temperature (0.0-2.0)                   |
| `top_p`               | float  | Nucleus sampling parameter                       |
| `max_tokens`          | int    | Maximum tokens in response                       |
| `frequency_penalty`   | float  | Reduce repetition (-2.0 to 2.0)                  |
| `presence_penalty`    | float  | Encourage new topics (-2.0 to 2.0)               |
| `tool_choice`         | string | Tool selection mode (`auto`, `required`, `none`) |
| `parallel_tool_calls` | bool   | Allow parallel tool execution                    |
| `truncation`          | string | Context truncation (`auto`, `disabled`)          |
| `store`               | bool   | Store conversation in OpenAI                     |

### Example Model

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Model
metadata:
  name: gpt-4o
spec:
  name: gpt-4o
  provider: openai
  properties:
    temperature: "0.7"
    max_tokens: "4096"
    parallel_tool_calls: "true"
```

## Git Repository Integration

Clone repositories into the workspace before execution, and optionally commit/push changes after. This enables agents to work with codebases or contribute to repositories.

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
  name: repo-analyst
  labels:
    git-repo-url: "https://github.com/org/repo.git"
    git-branch: "main"
    openai-web-search: "false"
spec:
  executionEngine:
    name: executor-openai-sdk
  modelRef:
    name: gpt-4o
  prompt: Analyze the code in /workspace.
```

Query parameters (`git_branch`, `git_repo_url`, etc.) can override labels per-query. See [execution-engines docs](/developer-guide/execution-engines) for full documentation.

## MCP Server Configuration

Connect agents to hosted MCP servers using environment variables. Each server requires a URL and optionally a label and headers:

```bash
# Server URL (required)
ARK_MCP_SERVER_GITHUB_URL=https://mcp.example.com/github

# Server label (optional, defaults to lowercase suffix)
ARK_MCP_SERVER_GITHUB_LABEL=github

# Custom headers (optional, comma-separated key=value pairs)
ARK_MCP_SERVER_GITHUB_HEADERS=Authorization=Bearer token,X-Custom=value
```

Multiple MCP servers can be configured by using different suffixes:

```bash
ARK_MCP_SERVER_JIRA_URL=https://mcp.example.com/jira
ARK_MCP_SERVER_CONFLUENCE_URL=https://mcp.example.com/confluence
```

### MCP Security

MCP tools execute without approval. When a configured MCP server exposes a tool, the agent can invoke it automatically. Only configure MCP servers you trust and use authentication headers to restrict access.

Unlike OpenAI's hosted tools (WebSearch, CodeInterpreter, FileSearch) which run in OpenAI's sandboxed infrastructure, MCP tools run wherever the MCP server is deployed.

## Telemetry

The executor integrates with OpenTelemetry for distributed tracing. Traces are automatically created for:

- Overall execution span
- Tool calls via ArkAgentHooks

### Configuration

| Environment Variable          | Description                             |
| ----------------------------- | --------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP collector endpoint                 |
| `OTEL_SERVICE_NAME`           | Service name (default: openai-executor) |

## Handoffs

Define agents for handoff via `agent.parameters.handoffs`. The main agent can transfer control to these agents.

```yaml
spec:
  parameters:
    handoffs:
      researcher:
        instructions: "Research technical topics"
        model: "gpt-4o"
      developer:
        instructions: "Implement code changes"
        model: "gpt-4o"
```

| Field          | Required | Description                    |
| -------------- | -------- | ------------------------------ |
| `instructions` | Yes      | Instructions for handoff agent |
| `model`        | No       | Model (default: gpt-4o)        |

## Environment Variables

| Variable                        | Default           | Description                          |
| ------------------------------- | ----------------- | ------------------------------------ |
| `HOST`                          | `0.0.0.0`         | Server bind address                  |
| `PORT`                          | `8000`            | Server port                          |
| `OPENAI_AGENTS_DISABLE_TRACING` | `0`               | Set to `1` to disable OpenAI tracing |
| `CODEX_MODEL`                   | `gpt-5.2-codex`   | Default model for Codex operations   |
| `CODEX_SANDBOX_MODE`            | `workspace-write` | Codex sandbox mode                   |
| `CODEX_APPROVAL_POLICY`         | `never`           | Codex tool approval policy           |
| `CODEX_NETWORK_ACCESS`          | `true`            | Enable network access for Codex      |
| `CODEX_IDLE_TIMEOUT`            | `120`             | Codex idle timeout in seconds        |

## Helm Values

Key configuration options in `chart/values.yaml`:

```yaml
env:
  HOST: "0.0.0.0"
  PORT: "8000"
  OPENAI_AGENTS_DISABLE_TRACING: "1"
  ARK_MCP_SERVER_GITHUB_URL: "https://mcp.example.com/github"

executionEngine:
  description: "OpenAI Agents SDK Executor"
  timeout: "5m"
  streaming: true
```

## API Endpoints

| Endpoint          | Method | Description                   |
| ----------------- | ------ | ----------------------------- |
| `/health`         | GET    | Health check                  |
| `/execute`        | POST   | Execute agent (blocking)      |
| `/execute-stream` | POST   | Execute agent (SSE streaming) |

## Notes

- Requires `OPENAI_API_KEY` environment variable or Ark Model CRD with API key
- Web search is enabled by default; disable with `openai-web-search: "false"` label
- OpenAI tracing enabled by default for observability in OpenAI dashboard
- Codex tool is experimental (`agents.extensions.experimental.codex`) but provides the best workspace integration with skills support
- When no workspace is provided, only hosted tools (WebSearch, CodeInterpreter, FileSearch) are available
