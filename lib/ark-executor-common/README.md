# ark-executor-common

Shared Python library for building Ark execution engines. Provides base classes, Pydantic models, FastAPI app scaffolding, and utility functions.

## Installation

Add as a local dependency in your executor's `pyproject.toml`:

```toml
[tool.uv.sources]
ark-executor-common = { path = "../../lib/ark-executor-common" }
```

## Usage

Create a custom executor by subclassing `BaseExecutor` and wrapping it with `ExecutorApp`:

```python
from ark_executor_common import BaseExecutor, ExecutorApp, ExecutionEngineRequest, Message

class MyExecutor(BaseExecutor):
    async def execute_agent(self, request: ExecutionEngineRequest) -> list[Message]:
        prompt = self._resolve_prompt(request.agent)
        # Your execution logic here
        return [Message(role="assistant", content="Response", name=request.agent.name)]

    async def execute_agent_streaming(self, request: ExecutionEngineRequest):
        # Optional: implement for streaming support
        yield {"type": "content", "content": "Streaming response"}

if __name__ == "__main__":
    app = ExecutorApp(MyExecutor(), "my-executor")
    app.run()
```

## Components

### Base Classes

| Class          | Description                                                                 |
| -------------- | --------------------------------------------------------------------------- |
| `BaseExecutor` | Abstract base class for executors with `execute_agent()` method             |
| `ExecutorApp`  | FastAPI wrapper with `/execute`, `/execute-stream`, and `/health` endpoints |

### Pydantic Models

| Model                     | Description                                                   |
| ------------------------- | ------------------------------------------------------------- |
| `ExecutionEngineRequest`  | Incoming request with agent config, user input, and history   |
| `ExecutionEngineResponse` | Response with messages, error, and token usage                |
| `AgentConfig`             | Agent configuration (name, prompt, model, labels, parameters) |
| `Message`                 | Chat message with role, content, and name                     |
| `Model`                   | Model configuration with name, type, and provider config      |
| `ToolDefinition`          | Tool schema with name, description, and parameters            |
| `TokenUsage`              | Token count for prompt, completion, and total                 |

### Model Utilities

Functions for extracting provider-specific configuration from `Model`:

```python
from ark_executor_common.models import (
    resolve_api_key,       # Extract API key for provider
    resolve_base_url,      # Extract base URL for provider
    resolve_model_properties,  # Extract model settings (temperature, etc.)
    resolve_azure_api_version,  # Extract Azure API version
)

api_key = resolve_api_key(request.agent.model)
base_url = resolve_base_url(request.agent.model)
properties = resolve_model_properties(request.agent.model)
```

### Tool Utilities

Convert Ark tool definitions to provider-specific formats:

```python
from ark_executor_common.tools import (
    tool_definitions_to_openai_functions,  # Convert to OpenAI function format
    tool_definition_to_json_schema,        # Convert to JSON schema format
)

openai_tools = tool_definitions_to_openai_functions(request.tools)
```

### History Utilities

Format conversation history for SDKs that accept a single prompt string:

```python
from ark_executor_common import format_history_as_prompt

# Formats history + current input as a single prompt
prompt = format_history_as_prompt(request.history, request.userInput.content)

# Output format:
# User: Previous message
#
# Assistant (agent-name): Previous response
#
# User: Current message
```

### Streaming Utilities

SSE formatting helpers for streaming responses:

```python
from ark_executor_common.streaming import (
    format_sse_event,   # Format arbitrary data as SSE
    format_sse_chunk,   # Format content chunk
    format_sse_result,  # Format final result
    format_sse_error,   # Format error message
    format_sse_done,    # Format [DONE] terminator
)
```

### Git Integration

Clone repositories before execution and optionally commit/push changes after:

```python
from ark_executor_common.git import (
    prepare_workspace_with_git,  # Clone repo before execution
    finalize_workspace_git,      # Commit/push after execution
)

class MyExecutor(BaseExecutor):
    async def execute_agent(self, request: ExecutionEngineRequest) -> list[Message]:
        # Clone repo into workspace (returns None if not configured)
        git_result = await prepare_workspace_with_git(
            workspace="/workspace",
            labels=request.agent.labels,
            parameters=request.agent.parameters,
        )

        # ... agent execution logic ...

        # Commit and push if configured
        await finalize_workspace_git(git_result)

        return messages
```

#### How It Works

1. **Before execution**: `prepare_workspace_with_git()` reads git config from agent labels/parameters
2. If `git-repo-url` is set, clones the repository into the workspace
3. Configures SSH key authentication if available at `/secrets/git-ssh-key`
4. **After execution**: `finalize_workspace_git()` checks for uncommitted changes
5. If `git-auto-commit` is enabled, stages and commits all changes
6. If `git-auto-push` is enabled, pushes to the configured branch

#### Configuration

Configuration is read from agent labels (kebab-case) or query parameters (snake_case). Parameters override labels.

**Clone settings:**

| Label              | Parameter          | Default | Description                               |
| ------------------ | ------------------ | ------- | ----------------------------------------- |
| `git-repo-url`     | `git_repo_url`     | -       | Repository URL (required)                 |
| `git-branch`       | `git_branch`       | `main`  | Branch to checkout                        |
| `git-path`         | `git_path`         | -       | Subdirectory to clone into                |
| `git-sparse-paths` | `git_sparse_paths` | -       | Comma-separated paths for sparse checkout |
| `git-depth`        | `git_depth`        | `1`     | Clone depth (1 = shallow, `0` for full)   |

**Commit/push settings:**

| Label                | Parameter            | Default                        | Description                    |
| -------------------- | -------------------- | ------------------------------ | ------------------------------ |
| `git-auto-commit`    | `git_auto_commit`    | `false`                        | Commit changes after execution |
| `git-auto-push`      | `git_auto_push`      | `false`                        | Push after commit              |
| `git-commit-message` | `git_commit_message` | `Changes by Ark agent`         | Commit message                 |
| `git-push-branch`    | `git_push_branch`    | same as clone                  | Target branch for push         |
| `git-user-name`      | `git_user_name`      | `Ark Agent`                    | Git author name                |
| `git-user-email`     | `git_user_email`     | `ark-agent@noreply.github.com` | Git author email               |

**Secrets (environment variables only - configured in Helm deployment):**

| Environment Variable      | Description                                                       |
| ------------------------- | ----------------------------------------------------------------- |
| `GIT_AUTH_TOKEN`          | HTTPS auth token for private repos                                |
| `GIT_SSH_KEY_PATH`        | Path to SSH private key (default: `/secrets/git-ssh-key`)         |
| `GIT_SSH_STRICT_HOST_KEY` | Enable SSH host key checking (default: `false`)                   |
| `GIT_USER_NAME`           | Git commit author name (default: `Ark Agent`)                     |
| `GIT_USER_EMAIL`          | Git commit author email (default: `ark-agent@noreply.github.com`) |

**Security notes:**

- Secrets are only read from environment variables, never from labels/parameters
- Credentials are masked in error messages and logs
- Workspace is cleaned before each clone to prevent file conflicts
- Set `GIT_SSH_STRICT_HOST_KEY=true` in production for SSH host verification

#### Example

Agent that clones a repo, makes changes, and pushes:

```yaml
metadata:
  labels:
    git-repo-url: "git@github.com:org/repo.git"
    git-branch: "main"
    git-auto-commit: "true"
    git-auto-push: "true"
    git-commit-message: "fix: automated fixes"
    git-push-branch: "agent/fixes"
```

## Request/Response Format

### ExecutionEngineRequest

```json
{
  "agent": {
    "name": "my-agent",
    "namespace": "default",
    "prompt": "You are a helpful assistant.",
    "model": {"name": "gpt-4o", "type": "openai", "config": {...}},
    "labels": {"key": "value"},
    "parameters": [{"name": "topic", "value": "AI"}]
  },
  "userInput": {"role": "user", "content": "Hello"},
  "history": [],
  "tools": []
}
```

### ExecutionEngineResponse

```json
{
  "messages": [
    { "role": "assistant", "content": "Hello!", "name": "my-agent" }
  ],
  "error": "",
  "token_usage": {
    "prompt_tokens": 10,
    "completion_tokens": 5,
    "total_tokens": 15
  }
}
```

## API Endpoints

Executors built with `ExecutorApp` expose:

| Endpoint          | Method | Description                                              |
| ----------------- | ------ | -------------------------------------------------------- |
| `/health`         | GET    | Returns `{"status": "healthy", "engine": "<name>"}`      |
| `/execute`        | POST   | Synchronous execution, returns `ExecutionEngineResponse` |
| `/execute-stream` | POST   | SSE streaming, yields chunks then final result           |
