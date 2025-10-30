# MCP Discovery Test

Tests that mock-llm MCPServer and tool resources are created and discovered by Ark.

## What it tests

- MCPServer and Echo MCP Tool CRDs are created when `ark.mcp.enabled=true`
- Both mcpserver and echo tool are discovered
- MCPServer reaches Ready state

## Resources created

- `mock-llm-mcp` MCPServer
- `mock-llm-echo-tool` MCP Tool
