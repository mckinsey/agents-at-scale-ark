# Agent Engine Tool Warning

Validates that attaching a non-MCP tool to an agent that runs on a named ExecutionEngine
generates a warning naming the agent, the engine and the dropped tools.

An engine is handed MCP connection details only, so every other tool type is dropped when
the engine request is built. The agent then runs without the tool and answers that it does
not exist.

## What it tests
- Engine-backed agent with an `http` tool is accepted but warns
- Engine-backed agent with only `mcp` tools does not warn
- Agent with no `executionEngine` does not warn, since the default completions executor
  does invoke http tools

## Running
```bash
chainsaw test tests/agent-engine-tool-warning
```
