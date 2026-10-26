# MCP Header Overrides Test

Tests which headers reach an MCP server when the server, the agent and the query all set headers.

## What it tests
- MCPServer `spec.headers` default reaches the server when nothing overrides it
- Agent override without a selector replaces a server header
- Agent override scoped with the `mcp/server` label replaces a server header
- Query override scoped with the `mcp/server` label replaces both the server and the agent header
- The controller stamps `mcp/server: <name>` on the MCPServer

## Running
```bash
chainsaw test
```

Successful completion validates that the MCP server receives exactly one value per header, with query overrides winning over agent overrides and agent overrides winning over server defaults.
