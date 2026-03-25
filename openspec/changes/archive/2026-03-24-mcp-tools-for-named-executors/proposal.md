# Load MCP tools from named execution engines

## Problem

Named execution engines receive a flat list of `ToolDefinition` objects (name, description, JSON schema) — the MCP server connection info is discarded during resolution. Most custom executors are MCP-aware (LangChain, CrewAI, etc.) and can natively manage MCP connections, but they have no way to discover the MCP servers backing the tools assigned to their agents.

The current `_build_tool_definitions()` in the ark-sdk query extension reads each Tool CRD but only extracts `description` and `input_schema`. The `mcp.mcpServerRef` pointer and the MCPServer CRD's address, transport, headers, and timeout are all available but never forwarded to the executor.

## Solution

Replace the flat `tools` field on `ExecutionEngineRequest` with an `mcpServers` field that groups resolved MCP server connection info by server, filtered to only the tools the agent references. Non-MCP tool types (http, agent, team, builtin) are excluded — only `type=mcp` tools are passed through.

Executors connect to MCP servers directly using their own MCP client implementations. The tool list per server acts as an allowlist — executors only use tools in that list, even if the server exposes more.

### Resolution flow

1. For each agent tool where `type == "mcp"` → read Tool CRD → get `mcpServerRef` + `toolName`
2. Group tools by MCPServer name
3. Read each MCPServer CRD → resolve address and headers (including secrets from k8s) using existing `_resolve_value_source()`
4. Build server entries with transport, timeout, resolved headers, and filtered tool name lists

### Data shape

```python
class MCPServerConfig(BaseModel):
    name: str
    url: str
    transport: str          # "http" or "sse"
    timeout: str            # e.g. "30s"
    headers: Dict[str, str] # resolved (secrets dereferenced)
    tools: List[str]        # allowlist of original MCP tool names

class ExecutionEngineRequest(BaseModel):
    agent: AgentConfig
    userInput: Message
    mcpServers: List[MCPServerConfig] = []
    conversationId: str = ""
```

### Architecture note

Only a `QueryRef` (name + namespace) crosses the A2A wire. The executor self-resolves all resources — including MCP servers and their secrets — from the cluster via its service account. Secrets never traverse the A2A boundary. This is the same pattern used for Model API key resolution.

## Changes

### ark-sdk (`lib/ark-sdk/`)
- `gen_sdk/overlay/python/ark_sdk/executor.py` — Add `MCPServerConfig` type. Replace `tools: List[ToolDefinition]` with `mcpServers: List[MCPServerConfig]` on `ExecutionEngineRequest`. Remove `ToolDefinition`.
- `gen_sdk/overlay/python/ark_sdk/extensions/query.py` — Replace `_build_tool_definitions()` with `_build_mcp_servers()`. Read Tool CRDs for `type=mcp`, group by MCPServer, resolve MCPServer CRDs (address, headers, transport, timeout).
- `gen_sdk/overlay/python/ark_sdk/client.py` — Update re-exports if needed.
- `gen_sdk/overlay/python/test_overlay/test_query_extension.py` — Update tests for new resolution logic.

### Documentation (standalone — not gated on this feature)
- `ark/api/extensions/query/v1/README.md` — Clarify self-resolution pattern: only QueryRef crosses A2A, executor resolves all resources from cluster, secrets never traverse A2A boundary. Fix misleading "engine authors receive a fully populated ExecutionEngineRequest" language.
- `docs/content/developer-guide/building-execution-engines.mdx` — Same clarification in "How It Works" section (lines 62-64).

### Documentation (ships with feature)
- `docs/content/developer-guide/building-execution-engines.mdx` — Update quickstart example (`request.tools` → `request.mcpServers`), update "How It Works" step 3, update Key Types table (remove `ToolDefinition`, add `MCPServerConfig`, update `ExecutionEngineRequest` description). Add section on MCP-aware executors.
- `ark/api/extensions/query/v1/README.md` — Add MCP server resolution to the resolution section.

## Non-goals

- Go controller changes (all work is in the ark-sdk Python layer)
- CRD changes (MCPServer and Tool CRDs are unchanged)
- A2A wire format changes (QueryRef-only pattern is preserved)
- Non-MCP tool types (http, agent, team, builtin are not passed to named executors)
- Built-in completions engine changes (it continues using its own MCPExecutor + MCPClientPool)
