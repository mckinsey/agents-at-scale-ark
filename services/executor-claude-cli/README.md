# executor-claude-cli

A2A execution engine that wraps the Claude Code SDK for Ark agent workloads. Provides Claude-native execution with built-in tools (Read, Write, Edit, Bash, Glob, Grep).

## Quickstart

```bash
make help

make executor-claude-cli-deps
make executor-claude-cli-test
make executor-claude-cli-dev
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKSPACE_DIR` | `/workspace` | Working directory for Claude |
| `ALLOWED_TOOLS` | `Read,Write,Edit,Bash,Glob,Grep` | Comma-separated tool list |
| `PERMISSION_MODE` | `acceptEdits` | Claude permission mode |
| `MAX_TURNS` | `25` | Maximum conversation turns |
| `MAX_BUDGET_USD` | (none) | Cost limit per execution |
| `PORT` | `8000` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `MOCK_MODE` | `false` | Return canned responses without calling Claude |
| `MOCK_RESPONSE` | (default text) | Response text in mock mode |

## Provider Authentication

| model.type | Provider | Auth |
|------------|----------|------|
| `anthropic` | Anthropic API | `ANTHROPIC_API_KEY` env var |
| `bedrock` | AWS Bedrock | `model.config.bedrock.{region, accessKeyId, secretAccessKey}` |
| `vertex` | Google Vertex AI | `GOOGLE_APPLICATION_CREDENTIALS` env var |
