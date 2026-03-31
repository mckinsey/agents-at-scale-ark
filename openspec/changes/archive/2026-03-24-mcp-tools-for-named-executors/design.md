# Design: Load MCP tools from named execution engines

## Context

Named execution engines receive agent context via the ark-sdk query extension. The extension resolves Query → Agent → Model → Tools from the cluster and builds an `ExecutionEngineRequest`. Today, tools are flattened into `ToolDefinition` objects (name, description, JSON schema) — MCP server connection info is discarded.

The resolution happens entirely within the executor pod. Only a `QueryRef` (name + namespace) crosses the A2A wire. The executor self-resolves all resources — including secrets — from the cluster via its service account. This is the same pattern used for Model API key resolution.

Most custom executors (LangChain, CrewAI, etc.) are MCP-aware and can natively manage MCP client connections. They need server connection info, not pre-resolved tool schemas.

## Goals / Non-Goals

**Goals:**
- Named executors receive resolved MCP server connection info grouped by server
- Executors can establish their own MCP connections using provided addresses, transport, headers
- Tool lists per server act as an allowlist — executors only use listed tools
- Secrets (headers, auth tokens) are resolved before reaching the executor, following the established Model resolution pattern

**Non-Goals:**
- Go controller changes (all work is in the ark-sdk Python layer)
- CRD changes (MCPServer and Tool CRDs are unchanged)
- A2A wire format changes (QueryRef-only pattern is preserved)
- Non-MCP tool support (http, agent, team, builtin tools are not passed to named executors)
- Changes to the built-in completions engine (it keeps its own MCPExecutor + MCPClientPool)

## Decisions

### Decision: Group by MCPServer, not per-tool

Pass MCP server entries with filtered tool name lists, rather than enriching each ToolDefinition with server info.

Alternative considered: Add MCP connection fields to each ToolDefinition. Rejected because it repeats server info for every tool from the same server and doesn't match how MCP clients work (connect to server → use tools).

```
mcpServers: [
  {name: "github-mcp", url: "...", transport: "http", tools: ["search_repos", "create_issue"]},
  {name: "slack-mcp",  url: "...", transport: "sse",  tools: ["send_message"]}
]
```

### Decision: Remove `tools` field entirely

Replace `tools: List[ToolDefinition]` with `mcpServers: List[MCPServerConfig]` on `ExecutionEngineRequest`. Remove the `ToolDefinition` type.

Alternative considered: Keep `tools` alongside `mcpServers` for backward compatibility. Rejected because the `tools` field only carried MCP tool schemas (non-MCP types are excluded from this feature), so keeping an empty list adds confusion without value. Executors using the previous SDK version will need to update regardless.

### Decision: Resolve secrets in the query extension (not executor code)

The query extension already resolves Model API keys via `_resolve_value_source()`. MCPServer headers follow the same pattern — resolve secretKeyRef/configMapKeyRef before building the request.

Alternative considered: Pass MCPServer CRD names and let executors resolve them. Rejected because it pushes k8s secret resolution into every executor implementation, duplicating logic that already exists in the query extension.

### Decision: Filter tools to agent's allowlist

Each MCPServer entry carries only the tool names the agent references, not all tools the server exposes. The executor calls `ListTools` on the server but only registers/uses tools in the allowlist.

Alternative considered: Pass the full server and let executors discover all tools. Rejected because it breaks the agent-level tool scoping that Ark enforces — an agent should only access tools explicitly assigned to it.

### Decision: Use original MCP tool names in allowlist

The allowlist contains the `toolName` from `MCPToolRef` (the name on the MCP server), not the Kubernetes Tool CRD name (which is `{mcpServerName}-{sanitized-toolName}`).

This is the name the executor will see when it calls `ListTools` on the server, so it's the natural key for filtering.

## Risks / Trade-offs

**Breaking change for existing custom executors** → Executors using `request.tools` will break when upgrading the SDK. Mitigated by documenting the migration path and bumping the SDK version. The executor surface area is small (pre-alpha) and the number of custom executors in production is limited.

**Executor must be MCP-aware** → If an executor doesn't speak MCP, it can't use the tools at all. Previously it at least got schemas. Mitigated by the fact that this is the stated design intent — executors that aren't MCP-aware don't benefit from flat schemas either, since they can't execute the tools.

**Secret exposure within pod** → Resolved header values (including auth tokens) are held in memory within the executor pod. This is the same trust model as Model API keys today — the executor pod's service account already has access to these secrets via k8s RBAC.
