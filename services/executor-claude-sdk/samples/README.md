# Claude SDK Executor Samples

Sample agents and queries for validating the Claude Agent SDK executor.

## Prerequisites

1. Deploy the Claude SDK executor to your cluster
2. Create an Anthropic API key secret:

```bash
kubectl create secret generic anthropic-api-key \
  --from-literal=api-key=YOUR_ANTHROPIC_API_KEY
```

## Deploy Agents

```bash
# Deploy all agents
kubectl apply -k .

# Or deploy individually
kubectl apply -f model-claude.yaml
kubectl apply -f agent-basic.yaml
```

## Sample Agents

| Agent                      | Description                     | Features                            |
| -------------------------- | ------------------------------- | ----------------------------------- |
| `claude-basic`             | Simple agent for basic Q&A      | None                                |
| `claude-with-tools`        | File system and shell tools     | `claude-tools`, `claude-cwd` labels |
| `claude-extended-thinking` | Complex reasoning with thinking | `claude-extended-thinking` label    |
| `claude-json-output`       | Structured JSON output          | `outputSchema`                      |
| `claude-all-tools`         | All tools including subagents   | `claude-tools=all` label            |
| `claude-with-parameters`   | Parameter substitution demo     | `parameters` with defaults          |
| `claude-feature-developer` | Multi-agent with subagents      | `parameters.subagents`              |

## Run Queries

```bash
# Basic query
kubectl apply -f query-basic.yaml
kubectl get query test-claude-basic -o yaml

# With tools
kubectl apply -f query-with-tools.yaml

# Extended thinking
kubectl apply -f query-extended-thinking.yaml

# JSON output
kubectl apply -f query-json-output.yaml

# All tools
kubectl apply -f query-all-tools.yaml

# Subagents
kubectl apply -f query-subagents.yaml
```

## Configuration Labels

| Label                      | Default             | Description                    |
| -------------------------- | ------------------- | ------------------------------ |
| `claude-max-turns`         | `50`                | Maximum agent turns            |
| `claude-permission-mode`   | `bypassPermissions` | Tool permission handling       |
| `claude-cwd`               | `/workspace`        | Working directory              |
| `claude-tools`             | Default set         | Comma-separated tools or `all` |
| `claude-extended-thinking` | `false`             | Enable extended thinking       |
| `claude-thinking-tokens`   | `10000`             | Max thinking tokens            |

## Default Tools

- `Read`, `Write`, `Edit` - File operations
- `Bash` - Shell commands
- `Glob`, `Grep` - File search
- `WebSearch`, `WebFetch` - Web access

## All Tools (with `claude-tools=all`)

Adds: `TodoWrite`, `NotebookEdit`, `Task` (subagents)
