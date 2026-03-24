# Query Extension Documentation Clarification

## ADDED Requirements

### Requirement: Query extension README documents self-resolution pattern
The query extension README SHALL explicitly state that only a QueryRef crosses the A2A boundary and that executors resolve all resources from the cluster.

#### Scenario: Developer reads query extension README
- **WHEN** a developer reads `ark/api/extensions/query/v1/README.md`
- **THEN** the Resolution section SHALL state that only a QueryRef (name + namespace) is transmitted over A2A, the executor resolves all resources locally from the cluster via its service account, and secrets never traverse the A2A boundary

### Requirement: Building execution engines guide documents resolution location
The execution engines developer guide SHALL clarify that resolution happens within the executor pod, not over the wire.

#### Scenario: Developer reads building execution engines guide
- **WHEN** a developer reads `docs/content/developer-guide/building-execution-engines.mdx`
- **THEN** the "How It Works" section SHALL state that the SDK resolves resources from the cluster within the executor pod, not that the executor "receives" a pre-populated request over A2A

### Requirement: Building execution engines guide documents MCP server usage
The execution engines developer guide SHALL document how executors consume `mcpServers` from the `ExecutionEngineRequest`.

#### Scenario: Developer reads building execution engines guide
- **WHEN** a developer reads the quickstart and Key Types sections
- **THEN** the guide SHALL show `request.mcpServers` usage, document the `MCPServerConfig` type, and explain the allowlist pattern

### Requirement: Query extension README documents MCP server resolution step
The query extension README SHALL mention MCP server resolution as part of the resolution chain.

#### Scenario: Developer reads query extension resolution section
- **WHEN** a developer reads the Resolution section of the query extension README
- **THEN** it SHALL mention that MCP servers referenced by the agent's tools are resolved alongside agent config and model
