## MODIFIED Requirements

### Requirement: MCPServerConfig type on ExecutionEngineRequest

The `ExecutionEngineRequest` SHALL include an `mcpServers` field containing a list of `MCPServerConfig` objects for MCP and inline Tools. The `tools` field and `ToolDefinition` type SHALL remain removed. Inline adaptation SHALL occur in SDK resolution, not in each downstream named executor.

#### Scenario: Agent with MCP tools dispatched to named executor

- **WHEN** a query targets an agent with `executionEngine` set to a named engine and the agent has MCP-type tools
- **THEN** the `ExecutionEngineRequest` SHALL contain an `mcpServers` entry per unique referenced MCPServer

#### Scenario: Agent with inline tools

- **WHEN** an agent references a Ready inline Tool whose resolved address matches its current generation
- **THEN** the SDK SHALL emit an `MCPServerConfig` with that activator URL, transport `http`, and a namespace/UID-qualified connection identity
- **AND** its `tools` allowlist SHALL contain the authored Tool name
- **AND** resolution SHALL require no synthetic MCPServer resource and SHALL NOT start a runner

#### Scenario: Agent with no MCP or inline tools

- **WHEN** an agent has neither MCP nor inline Tools
- **THEN** the `ExecutionEngineRequest` SHALL contain an empty `mcpServers` list

#### Scenario: Agent with mixed tool types

- **WHEN** an agent has MCP, inline, and other Tool types (`http`, `agent`, `team`, `builtin`)
- **THEN** the `mcpServers` list SHALL include resolved MCP and inline entries only
- **AND** the existing exclusion of the other types from this field SHALL remain unchanged

### Requirement: Tools grouped by MCPServer

MCP-type Tools SHALL be grouped by the MCPServer they belong to. Each `MCPServerConfig` SHALL contain a `tools` list of original MCP tool names from `MCPToolRef.toolName`. Inline Tools SHALL instead resolve to distinct connections identified by namespace and Tool UID, each with a one-tool allowlist; they SHALL NOT be grouped with unrelated MCPServer connections.

#### Scenario: Multiple tools from same MCPServer

- **WHEN** an agent references three Tool CRDs pointing to the same MCPServer
- **THEN** one `MCPServerConfig` SHALL contain all three original tool names

#### Scenario: Tools from different MCPServers

- **WHEN** an agent references tools from two different MCPServers
- **THEN** two `MCPServerConfig` entries SHALL contain their respective tool names

#### Scenario: Inline connections are distinct

- **WHEN** an agent references multiple inline Tools alongside MCP Tools
- **THEN** each unique inline Tool SHALL have a separate namespace/UID-qualified connection identity
- **AND** no inline connection SHALL overwrite an ordinary MCPServer connection

### Requirement: Use original MCP tool names

For MCP-type Tools, the `tools` list SHALL use `MCPToolRef.toolName`, not the Kubernetes Tool resource name. For inline Tools, the authored Tool resource name SHALL be the original MCP tool name. This change SHALL NOT introduce new attachment alias or partial-argument support in named executors.

#### Scenario: Tool CRD name differs from MCP tool name

- **WHEN** a Tool CRD is named `github-mcp-search-repos` with `mcp.toolName: "search_repos"`
- **THEN** its server allowlist SHALL contain `"search_repos"`

#### Scenario: Inline original tool name

- **WHEN** an inline Tool is named `csv-summarise`
- **THEN** its MCP discovery response and connection allowlist SHALL use `csv-summarise`

### Requirement: MCPServer resolution failures are logged and skipped

If an MCPServer cannot be found or its address/headers cannot be resolved, the server SHALL be skipped with a warning. Inline Tools with missing/stale resolved status or denied resource access SHALL likewise be skipped with a warning rather than resolved under a more privileged identity. Other resolvable connections SHALL still be included.

#### Scenario: MCPServer CRD not found

- **WHEN** a Tool references an MCPServer that does not exist
- **THEN** that server SHALL be skipped with a warning and other servers SHALL resolve normally

#### Scenario: MCPServer secret resolution fails

- **WHEN** an MCPServer header references an unreadable secret
- **THEN** the server SHALL be skipped with a warning

#### Scenario: Inline runtime unavailable

- **WHEN** an inline Tool is Pending or its `status.observedGeneration` differs from `metadata.generation`
- **THEN** its connection SHALL be omitted with a warning
- **AND** no fallback runner URL or privileged lookup SHALL be used
