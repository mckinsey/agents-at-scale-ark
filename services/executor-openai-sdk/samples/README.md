# OpenAI SDK Executor Samples

Sample agents demonstrating the OpenAI Agents SDK executor capabilities.

## Prerequisites

1. Deploy the `executor-openai-sdk` service
2. Create an OpenAI API key secret

## Samples

### Model Configuration

**`model-openai.yaml`** - OpenAI model with API key secret

```bash
kubectl apply -f model-openai.yaml
```

### Agents

| Agent                | Tools                       | Description                                    |
| -------------------- | --------------------------- | ---------------------------------------------- |
| `researcher`         | WebSearch                   | Research agent that searches the web           |
| `code-assistant`     | CodeInterpreter             | Python code execution in sandboxed environment |
| `document-analyst`   | FileSearch                  | RAG over OpenAI Vector Stores                  |
| `simple-assistant`   | None                        | Basic conversational assistant                 |
| `multi-tool-analyst` | WebSearch + CodeInterpreter | Combined research and analysis                 |
| `codex-developer`    | Codex                       | Workspace file operations via Codex            |

### Tool Configuration via Labels

```yaml
metadata:
  labels:
    openai-web-search: "true" # Default: true
    openai-code-interpreter: "true" # Default: false
    openai-file-search-vector-stores: "vs_abc123,vs_def456"
    openai-codex: "true" # Default: true (when workspace provided)
    openai-max-turns: "10" # Default: unlimited
```

### Codex Configuration via Labels

```yaml
metadata:
  labels:
    openai-codex-model: "gpt-5.2-codex" # Default: gpt-5.2-codex
    openai-codex-sandbox: "workspace-write" # Default: workspace-write
    openai-codex-approval-policy: "never" # Default: never
    openai-codex-network: "true" # Default: true
    openai-codex-idle-timeout: "120" # Default: 120
    openai-codex-reasoning-effort: "low" # Default: low
    openai-codex-persist-session: "false" # Default: false
    openai-codex-skip-git-check: "false" # Default: false
    openai-codex-additional-dirs: "/data,/config" # Default: none
```

### Workspace Integration

Workspaces provide the filesystem for agents. Create a Workspace CRD and reference it from queries:

**`workspace-git.yaml`** - Workspace with git repository content

```bash
kubectl apply -f workspace-git.yaml
```

**`query-with-workspace.yaml`** - Query referencing a workspace

```bash
kubectl apply -f query-with-workspace.yaml
```

**`query-inline-workspace.yaml`** - Query with inline workspace definition

```bash
kubectl apply -f query-inline-workspace.yaml
```

## Usage

```bash
kubectl apply -f model-openai.yaml
kubectl apply -f workspace-git.yaml
kubectl apply -f agent-codex.yaml
kubectl apply -f query-with-workspace.yaml
kubectl get query analyze-repo -o yaml
```

## Vector Store Setup (for FileSearch)

1. Create a Vector Store in the OpenAI platform
2. Upload your documents
3. Copy the Vector Store ID (starts with `vs_`)
4. Update the label in `agent-document-analyst.yaml`
