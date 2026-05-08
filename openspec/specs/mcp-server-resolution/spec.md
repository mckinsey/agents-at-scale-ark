# MCP Server Resolution for Named Executors

## Purpose
Resolution of MCPServer references for named execution engines so the engine receives fully-resolved connection info (URLs, headers, transport) without requiring direct cluster access.

## Requirements

### Requirement: MCPServerConfig type on ExecutionEngineRequest
The `ExecutionEngineRequest` SHALL include an `mcpServers` field containing a list of `MCPServerConfig` objects. The `tools` field and `ToolDefinition` type SHALL be removed.

#### Scenario: Agent with MCP tools dispatched to named executor
- **WHEN** a query targets an agent with `executionEngine` set to a named engine and the agent has MCP-type tools
- **THEN** the `ExecutionEngineRequest` SHALL contain an `mcpServers` list with one entry per unique MCPServer referenced by the agent's tools

#### Scenario: Agent with no MCP tools
- **WHEN** a query targets an agent with `executionEngine` set to a named engine and the agent has no MCP-type tools
- **THEN** the `ExecutionEngineRequest` SHALL contain an empty `mcpServers` list

#### Scenario: Agent with mixed tool types
- **WHEN** a query targets an agent with MCP-type and non-MCP-type tools (http, agent, team, builtin)
- **THEN** the `ExecutionEngineRequest` SHALL contain `mcpServers` entries only for MCP-type tools; non-MCP tools SHALL be excluded

### Requirement: MCPServerConfig contains resolved connection info
Each `MCPServerConfig` SHALL contain `name`, `url`, `transport`, `timeout`, `headers`, and `tools` fields. All values SHALL be fully resolved — no secret references, configmap references, or service references remain.

#### Scenario: MCPServer with secret-based headers
- **WHEN** an MCPServer CRD has headers referencing Kubernetes secrets
- **THEN** the `MCPServerConfig.headers` SHALL contain the resolved plaintext values

#### Scenario: MCPServer with service reference address
- **WHEN** an MCPServer CRD has an address using `valueFrom.serviceRef`
- **THEN** the `MCPServerConfig.url` SHALL contain the resolved HTTP URL

#### Scenario: MCPServer with direct address
- **WHEN** an MCPServer CRD has a direct `value` address
- **THEN** the `MCPServerConfig.url` SHALL contain that value

### Requirement: Tools grouped by MCPServer
Tools SHALL be grouped by the MCPServer they belong to. Each `MCPServerConfig` SHALL contain a `tools` list of original MCP tool names (from `MCPToolRef.toolName`).

#### Scenario: Multiple tools from same MCPServer
- **WHEN** an agent references three Tool CRDs that all point to the same MCPServer via `mcpServerRef`
- **THEN** the `mcpServers` list SHALL contain one `MCPServerConfig` entry for that server with all three tool names in its `tools` list

#### Scenario: Tools from different MCPServers
- **WHEN** an agent references tools from two different MCPServers
- **THEN** the `mcpServers` list SHALL contain two `MCPServerConfig` entries, each with their respective tool names

### Requirement: Tool list acts as allowlist
The `tools` list on each `MCPServerConfig` SHALL act as an allowlist. Only tools listed SHALL be used by the executor, even if the MCP server exposes additional tools.

#### Scenario: Server exposes more tools than agent references
- **WHEN** an MCP server exposes 10 tools but the agent only references 2
- **THEN** the `MCPServerConfig.tools` list SHALL contain only those 2 tool names

### Requirement: Use original MCP tool names
The `tools` list SHALL use the `toolName` from the `MCPToolRef` on the Tool CRD, not the Kubernetes Tool CRD resource name.

#### Scenario: Tool CRD name differs from MCP tool name
- **WHEN** a Tool CRD is named `github-mcp-search-repos` with `mcp.toolName: "search_repos"`
- **THEN** the `MCPServerConfig.tools` list SHALL contain `"search_repos"`

### Requirement: MCPServer resolution failures are logged and skipped
If an MCPServer CRD cannot be found or its address/headers cannot be resolved, the server SHALL be skipped with a warning log. Other servers SHALL still be included.

#### Scenario: MCPServer CRD not found
- **WHEN** a Tool CRD references an MCPServer that does not exist
- **THEN** that server SHALL be skipped, a warning SHALL be logged, and the remaining servers SHALL be resolved normally

#### Scenario: MCPServer secret resolution fails
- **WHEN** an MCPServer header references a secret that cannot be read
- **THEN** that server SHALL be skipped with a warning log

### Requirement: Resolved MCPServerConfig.headers carries Authorization for OAuth-protected servers

When an MCPServer has `spec.authorization.tokenSecretRef` set and the referenced Secret carries a non-empty access token, the resolver SHALL set `MCPServerConfig.headers["Authorization"] = "Bearer <access_token>"`. The Bearer header SHALL be derived inside the resolver from the cluster Secret — executors SHALL NOT receive `tokenSecretRef` or any other Secret-related field over the A2A wire.

#### Scenario: Authorized MCPServer is resolved into MCPServerConfig

- **GIVEN** an MCPServer with `spec.authorization.tokenSecretRef.name = notion-oauth` and a Secret containing `access_token`
- **WHEN** the controller resolves the agent's MCP servers
- **THEN** the corresponding `MCPServerConfig.headers` SHALL contain `Authorization: Bearer <access_token>`

#### Scenario: spec.headers Authorization wins over tokenSecretRef

- **GIVEN** an MCPServer with both `spec.authorization.tokenSecretRef` set and a `spec.headers` entry named `Authorization`
- **WHEN** the resolver builds `MCPServerConfig.headers`
- **THEN** the explicit `spec.headers` value SHALL be used and the helper-derived Bearer SHALL NOT replace it

#### Scenario: MCPServer without authorization

- **GIVEN** an MCPServer with `spec.authorization` unset
- **WHEN** the resolver builds `MCPServerConfig.headers`
- **THEN** no `Authorization` header SHALL be added beyond `spec.headers`

### Requirement: Executor authors do not handle MCPServer authorization

`MCPServerConfig.headers` SHALL be the single contract executors consume for MCP authentication. Executor authors SHALL NOT need to read MCPServer CRDs, Secrets, or `spec.authorization` to call OAuth-protected MCP servers. Documentation describing how to build a new execution engine SHALL state this explicitly.

#### Scenario: New execution engine consumes Authorization opaquely

- **GIVEN** a custom execution engine receiving `ExecutionEngineRequest.mcpServers[i]`
- **WHEN** it constructs an MCP client
- **THEN** passing `MCPServerConfig.headers` to the client SHALL be sufficient for OAuth-protected servers — no extra resolution step SHALL be required
