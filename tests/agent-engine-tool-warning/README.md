# Agent Engine Tool Warning

Validates that attaching a non-MCP tool to an agent that runs on a named ExecutionEngine
generates a warning naming the agent, the engine and the dropped tools.

An engine is handed MCP connection details only, so every other tool type is dropped when
the engine request is built. The agent then runs without the tool and answers that it does
not exist.

Partial tools are dropped for a different reason and get their own warning. A partial
preconfigures parameters and hides them from the agent, which Ark can only enforce where
it sits between the agent and the tool. An engine dials the MCP server itself, so the
partial is withheld even when the underlying Tool is `mcp`.

## What it tests
- Engine-backed agent with an `http` tool is accepted but warns
- Engine-backed agent with only `mcp` tools does not warn
- Engine-backed agent with a partial tool warns, including when the partial resolves to
  an `mcp` Tool CRD - the case the type check alone cannot catch
- A partial tool is reported with the partial reason, not "receives only mcp tools"
- An agent with both a plain non-mcp tool and a partial gets both warnings
- Agent with no `executionEngine` does not warn, since the default completions executor
  does invoke http tools and does apply partials

## Running
```bash
chainsaw test tests/agent-engine-tool-warning
```
