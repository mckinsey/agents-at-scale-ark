## ADDED Requirements

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
