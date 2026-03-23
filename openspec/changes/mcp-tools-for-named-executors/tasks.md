## 1. SDK Types

- [ ] 1.1 Add `MCPServerConfig` model to `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/executor.py` with fields: name, url, transport, timeout, headers (Dict[str, str]), tools (List[str])
- [ ] 1.2 Replace `tools: List[ToolDefinition]` with `mcpServers: List[MCPServerConfig]` on `ExecutionEngineRequest`
- [ ] 1.3 Remove `ToolDefinition` class from `executor.py`
- [ ] 1.4 Update re-exports in `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/client.py` if `ToolDefinition` is exported

## 2. Query Extension Resolution

- [ ] 2.1 Add `_resolve_mcp_server()` function in `extensions/query.py` that reads an MCPServer CRD and resolves address + headers via `_resolve_value_source()`
- [ ] 2.2 Add `_build_mcp_servers()` function that iterates agent tools, filters for `type=mcp`, groups by MCPServer, resolves each server, and returns `List[MCPServerConfig]`
- [ ] 2.3 Replace `_build_tool_definitions()` call in `_resolve_from_query()` with `_build_mcp_servers()`, wiring result into `ExecutionEngineRequest.mcpServers`
- [ ] 2.4 Remove `_build_tool_definitions()` function

## 3. Tests

- [ ] 3.1 Update `test_query_extension.py` — remove tests for `_build_tool_definitions`, add tests for `_build_mcp_servers` covering: single server with multiple tools, multiple servers, mixed tool types (MCP + non-MCP), secret resolution in headers
- [ ] 3.2 Add test for MCPServer resolution failure (CRD not found) — verify warning logged and other servers still resolve
- [ ] 3.3 Add test for MCPServer secret resolution failure — verify warning logged and server skipped
- [ ] 3.4 Run `make test` in `lib/ark-sdk/` to verify all tests pass

## 4. Documentation (standalone — self-resolution clarification)

- [ ] 4.1 Update `ark/api/extensions/query/v1/README.md` Resolution section — state explicitly that only QueryRef crosses A2A, executor resolves resources from cluster, secrets never traverse A2A boundary
- [ ] 4.2 Update `docs/content/developer-guide/building-execution-engines.mdx` "How It Works" section (lines 62-64) — clarify resolution happens in-cluster within executor pod

## 5. Documentation (ships with feature)

- [ ] 5.1 Update `docs/content/developer-guide/building-execution-engines.mdx` quickstart example — replace `request.tools` with `request.mcpServers`
- [ ] 5.2 Update Key Types table — remove `ToolDefinition`, add `MCPServerConfig`, update `ExecutionEngineRequest` description
- [ ] 5.3 Add section on MCP-aware executors explaining: connect to servers, filter by allowlist, tool execution responsibility
- [ ] 5.4 Update `ark/api/extensions/query/v1/README.md` Resolution section — add MCP server resolution to the resolution chain description
