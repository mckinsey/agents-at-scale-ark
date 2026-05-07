## ADDED Requirements

### Requirement: Bearer injection applies to all in-cluster MCP client construction paths

When `spec.authorization.tokenSecretRef` is set on an MCPServer, every Ark code path that constructs an MCP client for that MCPServer SHALL inject `Authorization: Bearer <access_token>` derived from the referenced Secret. This applies at minimum to:

- The `MCPServerReconciler` (already covered by the original Stage 1 requirement).
- The built-in completions executor's tool dispatch path (`ark/executors/completions/agent_tools.go::createMCPExecutor`).
- The ark-sdk Python resolver that builds `MCPServerConfig.headers` for named execution engines (`lib/ark-sdk/.../extensions/query.py::_resolve_mcp_server`).

When `spec.authorization` is unset, no path SHALL attempt to read any Secret for token injection.

#### Scenario: Built-in completions executor dispatches a tool against an Authorized MCPServer

- **GIVEN** an MCPServer with `spec.authorization.tokenSecretRef.name = notion-oauth` and a Secret carrying `access_token`
- **WHEN** an agent without `executionEngine` invokes a tool backed by that MCPServer
- **THEN** the built `MCPClientConfig.Headers` SHALL contain `Authorization: Bearer <access_token>` and the tool call SHALL NOT produce a 401 caused by missing credentials

#### Scenario: Named execution engine receives MCPServerConfig for an Authorized MCPServer

- **GIVEN** the same Authorized MCPServer
- **WHEN** the controller dispatches a query to a named execution engine via A2A
- **THEN** the resulting `ExecutionEngineRequest.mcpServers[*].headers` SHALL contain `Authorization: Bearer <access_token>` for that server

#### Scenario: User has supplied Authorization in spec.headers

- **GIVEN** an MCPServer with `spec.authorization.tokenSecretRef` set AND a `spec.headers` entry whose name is `Authorization`
- **WHEN** any in-cluster path constructs the MCP client
- **THEN** the explicit `spec.headers` value SHALL win and the helper-derived Bearer SHALL NOT overwrite it

#### Scenario: spec.authorization is unset

- **GIVEN** an MCPServer with `spec.authorization == nil`
- **WHEN** any in-cluster path constructs the MCP client
- **THEN** no Secret read SHALL occur for token injection and no `Authorization` header SHALL be added beyond what `spec.headers` already supplies

#### Scenario: Secret exists but the access-token key is empty

- **GIVEN** the referenced Secret exists but the configured access-token key is missing or empty
- **WHEN** any in-cluster path constructs the MCP client
- **THEN** no `Authorization` header SHALL be injected and the call SHALL fall through to whatever `spec.headers` supplies

### Requirement: Token resolution shares default key names across paths

The reconciler and the executor dispatch paths SHALL share the same default access-token key name (`access_token`) and the same `accessTokenKey` override semantics, so an MCPServer that produces an `Authorized` state in reconcile is guaranteed to also yield a Bearer header at dispatch time. Implementations MAY share a helper or a constant; the binding requirement is that the two paths can never diverge on key resolution. Any shared helper SHALL be event-free — eventing for missing keys / Secrets stays in the reconciler.

#### Scenario: Helper honours custom accessTokenKey override

- **GIVEN** `spec.authorization.tokenSecretRef.accessTokenKey = MY_TOKEN`
- **WHEN** the helper is invoked against a Secret whose `MY_TOKEN` key carries a value
- **THEN** the helper SHALL return that value

#### Scenario: Helper short-circuits when authorization is unset

- **GIVEN** `spec.authorization == nil`
- **WHEN** the helper is invoked
- **THEN** it SHALL return an empty string and SHALL NOT issue any API server reads

### Requirement: Labelled token Secrets reconcile in real time

Secrets carrying label `ark.mckinsey.com/mcp-token-secret=true` SHALL trigger immediate reconciliation of every MCPServer whose `spec.authorization.tokenSecretRef.name` matches the changed Secret. The `MCPServerReconciler` SHALL register a field indexer on `spec.authorization.tokenSecretRef.name` and SHALL watch labelled Secrets via `builder.WithPredicates` so the reconcile loop fires on Secret events without depending on the resync interval.

#### Scenario: Operator patches a labelled token Secret

- **GIVEN** an MCPServer in state `Authorized` whose `tokenSecretRef` points at a Secret carrying the label `ark.mckinsey.com/mcp-token-secret=true`
- **WHEN** the operator patches the Secret to empty `access_token`
- **THEN** the controller SHALL reconcile within seconds and SHALL transition `status.authorization.state` to `Required`

#### Scenario: Multiple MCPServers reference the same labelled Secret

- **GIVEN** two MCPServers in the same namespace whose `spec.authorization.tokenSecretRef.name` points at the same labelled Secret
- **WHEN** the Secret is patched
- **THEN** the controller SHALL enqueue a reconcile for each MCPServer

### Requirement: Unlabelled token Secrets remain functional

When a Secret referenced by `spec.authorization.tokenSecretRef` lacks the `ark.mckinsey.com/mcp-token-secret` label, the controller SHALL still reconcile the MCPServer on its periodic resync interval. The label is a real-time convenience, not a correctness requirement. The cache SHALL NOT be filtered by this label — reconciler reads of any token Secret SHALL succeed regardless.

#### Scenario: Operator patches an unlabelled token Secret

- **GIVEN** an MCPServer whose `tokenSecretRef` points at a Secret with no `ark.mckinsey.com/mcp-token-secret` label
- **WHEN** the operator patches the Secret
- **THEN** the controller SHALL NOT immediately enqueue a reconcile based on the Secret event
- **AND** on the next periodic resync the reconciler SHALL read the updated Secret and transition state accordingly
