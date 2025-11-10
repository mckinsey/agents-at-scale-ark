# Agent Overrides Test

Tests HTTP header overrides defined in Agent spec for models and MCP servers using label selectors.

## What it tests
- Agent-level header overrides for models via labelSelector
- Agent-level header overrides for MCP servers via labelSelector
- Static values, Secrets, and ConfigMaps as header value sources
- Header propagation to model HTTP requests
- Header propagation to MCP server tool calls

## Running
```bash
chainsaw test tests/agent-overrides/
```

Successful completion validates that headers defined in Agent overrides are correctly propagated to matching models and MCP servers based on label selectors.
