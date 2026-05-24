# mcp-auth-token-injection Specification

## Purpose
TBD - created by archiving change mcp-auth-token-injection. Update Purpose after archive.
## Requirements
### Requirement: MCPServer spec carries an optional authorization block referencing a token Secret

The `MCPServer` CRD (v1alpha1) SHALL gain an optional `spec.authorization` object with a required `tokenSecretRef`. `tokenSecretRef` SHALL reference a Kubernetes Secret in the same namespace as the MCPServer and MAY override the key names used within the Secret via `accessTokenKey`, `refreshTokenKey`, `expiresAtKey`, `clientIDKey`, `clientSecretKey`, defaulting respectively to `access_token`, `refresh_token`, `expires_at`, `client_id`, `client_secret`. When `spec.authorization` is unset, the controller SHALL NOT attempt to inject any Authorization header.

#### Scenario: MCPServer is created with authorization configured

- **GIVEN** an `MCPServer` with `spec.authorization.tokenSecretRef.name = notion-mcp-token`
- **WHEN** the controller reconciles the resource
- **THEN** the controller SHALL resolve a Secret named `notion-mcp-token` in the same namespace as the MCPServer
- **AND** SHALL use the default key names `access_token`, `refresh_token`, `expires_at`, `client_id`, `client_secret` unless overridden on `spec.authorization.tokenSecretRef`

#### Scenario: MCPServer omits spec.authorization

- **GIVEN** an `MCPServer` with `spec.authorization` unset
- **WHEN** the controller reconciles the resource
- **THEN** the controller SHALL NOT read any Secret for token injection
- **AND** SHALL NOT add an `Authorization` header to MCP requests

### Requirement: MCPServerAuthorizationState enum gains a single Authorized value

The `MCPServerAuthorizationState` enum SHALL be extended with exactly one new value, `Authorized`. The complete enum SHALL be `Required | DiscoveryFailed | Authorized`. Existing detection behaviour for `Required` and `DiscoveryFailed` SHALL be preserved unchanged. An HTTP 401 observed on an in-flight MCP call after reaching `Authorized` SHALL collapse the state back to `Required` rather than introducing a dedicated failure state.

#### Scenario: Controller successfully lists tools using an injected Bearer

- **GIVEN** an `MCPServer` whose referenced Secret contains a non-empty `access_token`
- **WHEN** the controller reconciles, injects the Bearer, and successfully lists tools on the MCP server
- **THEN** `status.authorization.state` SHALL be `Authorized`
- **AND** the `Available` condition SHALL be `True` with reason `Authorized`

### Requirement: Controller injects Bearer access token into MCP requests when authorization is configured

When `spec.authorization` is set and the referenced Secret contains a non-empty `access_token`, the controller SHALL inject `Authorization: Bearer <access_token>` into the MCP client's header map on every reconcile. Other entries in `spec.headers` SHALL be preserved unchanged.

#### Scenario: spec.headers defines non-auth headers alongside authorization

- **GIVEN** an `MCPServer` with `spec.headers = [{name: "X-Org-Id", value: "acme"}]` and a non-empty `access_token` in the referenced Secret
- **WHEN** the controller builds the MCP client
- **THEN** the outgoing MCP request SHALL include both `X-Org-Id: acme` and `Authorization: Bearer <access_token>`

#### Scenario: Secret is missing when reconcile runs

- **WHEN** `spec.authorization.tokenSecretRef` points at a Secret that does not exist
- **THEN** the controller SHALL NOT inject an `Authorization` header
- **AND** behaviour SHALL fall through to the existing `mcp-auth-detection` 401 discovery path, resulting in `status.authorization.state = Required` (or `DiscoveryFailed` if RFC 9728 metadata is unavailable)

#### Scenario: Secret exists but access_token key is empty or missing

- **WHEN** the referenced Secret exists but the configured `access_token` key is absent or contains an empty value
- **THEN** the controller SHALL NOT inject an `Authorization` header
- **AND** behaviour SHALL fall through to the existing 401 discovery path as above

### Requirement: Controller publishes access token expiry on status.authorization.expiresAt

On every successful transition to `Authorized`, the controller SHALL populate `status.authorization.expiresAt` (`metav1.Time`, optional) by parsing the Secret's `expires_at` key (default `expires_at`; overridable via `expiresAtKey`). If the key is absent, empty, or unparseable, the controller SHALL leave `status.authorization.expiresAt` absent and log the skip — this SHALL NOT prevent the `Authorized` transition. The controller SHALL leave `status.authorization.expiresAt` unchanged on any rollback from `Authorized` to `Required`, so operators can still see when the last good token was minted. The controller SHALL clear `status.authorization.expiresAt` whenever `status.authorization` is reset to absent. No kubectl printcolumn SHALL be added for `expiresAt`; the existing `AUTH` (state) column from `mcp-auth-detection` remains the only printcolumn.

#### Scenario: Authorized reconcile publishes expiresAt from the Secret

- **GIVEN** an `MCPServer` whose referenced Secret contains a non-empty `access_token` and an `expires_at` of `2026-04-22T12:00:00Z`
- **WHEN** the controller reconciles, injects the Bearer, and tool-list succeeds
- **THEN** `status.authorization.state` SHALL be `Authorized`
- **AND** `status.authorization.expiresAt` SHALL be `2026-04-22T12:00:00Z`

#### Scenario: expires_at key missing does not block Authorized

- **GIVEN** an `MCPServer` whose referenced Secret contains a non-empty `access_token` but no `expires_at` key
- **WHEN** the controller reconciles and tool-list succeeds
- **THEN** `status.authorization.state` SHALL be `Authorized`
- **AND** `status.authorization.expiresAt` SHALL be absent

#### Scenario: Rollback to Required preserves expiresAt

- **GIVEN** an `MCPServer` in state `Authorized` with `status.authorization.expiresAt = T1`
- **WHEN** the controller rolls the state back to `Required` in response to a 401 on an in-flight MCP call
- **THEN** `status.authorization.expiresAt` SHALL remain `T1`, unchanged
- **AND** `status.authorization.state` SHALL be `Required`

#### Scenario: Authorization cleared removes expiresAt

- **GIVEN** an `MCPServer` previously in state `Authorized` with `status.authorization.expiresAt` populated
- **WHEN** the operator removes `spec.authorization` and a subsequent reconcile confirms the server accepts unauthenticated calls
- **THEN** `status.authorization` SHALL be cleared in its entirety
- **AND** `status.authorization.expiresAt` SHALL therefore be absent

### Requirement: Controller rolls back to Required on IdP-side revocation

When the MCPServer is in state `Authorized` and the next MCP call receives HTTP 401 with a `WWW-Authenticate` Bearer challenge, the controller SHALL re-run RFC 9728 / RFC 8414 discovery and SHALL set `status.authorization.state` to `Required`. The Secret SHALL be left unchanged — the controller has no write RBAC on Secrets in Stage 1 — so the operator retains an audit trail; the caller repopulates the Secret out-of-band. The controller SHALL emit the `TokenRejected` Warning event defined below for this transition.

#### Scenario: MCP server returns 401 despite a valid-looking Bearer token

- **GIVEN** an MCPServer in state `Authorized`
- **WHEN** the next MCP call returns HTTP 401 with a parseable `WWW-Authenticate` header
- **THEN** the controller SHALL set `status.authorization.state = Required`
- **AND** SHALL re-run RFC 9728 + RFC 8414 discovery as defined in `mcp-auth-detection`
- **AND** SHALL NOT delete, update, or patch the Secret or any of its keys
- **AND** SHALL emit a Kubernetes `Warning` event with reason `TokenRejected` whose message includes the observed `WWW-Authenticate` header

### Requirement: TokenRejected event is emitted on Authorized to Required transitions

The controller SHALL emit a Kubernetes `Warning` event with reason `TokenRejected` when, and only when, it observes an HTTP 401 from the MCP server while the prior persisted `status.authorization.state` was `Authorized`. The event message SHALL include the observed `WWW-Authenticate` header (optionally truncated) so that operators can see what the upstream said without tailing controller logs.

The event MUST NOT be emitted on any other transition — in particular, it MUST NOT fire when the prior `status.authorization.state` was empty, `Required`, or `DiscoveryFailed`. The existing `AuthorizationRequired` event defined by `mcp-auth-detection` continues to cover first-time transitions into `Required`.

#### Scenario: 401 from Authorized emits TokenRejected with WWW-Authenticate

- **GIVEN** an MCPServer in state `Authorized`
- **WHEN** the next MCP call returns HTTP 401 with a `WWW-Authenticate` header such as `Bearer error="invalid_token", error_description="token revoked"`
- **THEN** the controller SHALL emit a `Warning` event with reason `TokenRejected` whose message includes the `WWW-Authenticate` header text (optionally truncated)
- **AND** `status.authorization.state` SHALL be `Required`

#### Scenario: First-time transition into Required does not emit TokenRejected

- **GIVEN** a new MCPServer whose previous `status.authorization.state` is empty (no detection has run yet) or `DiscoveryFailed`
- **WHEN** the controller observes a 401 and transitions `status.authorization.state` to `Required` for the first time
- **THEN** the controller SHALL emit the existing `AuthorizationRequired` event per `mcp-auth-detection`
- **AND** SHALL NOT emit a `TokenRejected` event

#### Scenario: 401 when state was already Required does not emit TokenRejected

- **GIVEN** an MCPServer in state `Required` (e.g. the caller populated the Secret with a bad token, so the first attempt fails)
- **WHEN** the controller observes another 401
- **THEN** the controller SHALL keep `status.authorization.state` at `Required`
- **AND** SHALL NOT emit a `TokenRejected` event (because the prior state was not `Authorized`)

### Requirement: Controller RBAC grants read-only access to Secrets

The Ark controller ServiceAccount's Role / ClusterRole SHALL include `get`, `list`, and `watch` verbs on the `secrets` resource in namespaces that the controller watches. In Stage 1 it SHALL NOT include `create`, `update`, `patch`, or `delete` on `secrets`. The controller is strictly a reader of the token Secret; lifecycle ownership stays with whoever created the Secret (Helm, admin, out-of-band tool).

#### Scenario: Controller reads a token Secret

- **WHEN** the controller reconciles an `MCPServer` with `spec.authorization.tokenSecretRef` set
- **THEN** the controller's API calls against the Secret SHALL be limited to `get`, `list`, or `watch`
- **AND** SHALL NOT include `Create`, `Update`, `Patch`, or `Delete`

### Requirement: Coexistence with mcp-auth-detection is preserved

All behaviours defined by `mcp-auth-detection` SHALL continue to hold unchanged. In particular, detection SHALL populate `status.authorization` on the first 401 regardless of whether `spec.authorization` is set, and re-running discovery on each poll interval SHALL remain idempotent.

#### Scenario: Authorization configured but detection has not yet run

- **GIVEN** a new `MCPServer` with `spec.authorization.tokenSecretRef` set and an empty `status.authorization`
- **WHEN** the controller reconciles for the first time and the Secret has not yet been populated
- **THEN** detection SHALL run as specified in `mcp-auth-detection` and populate `status.authorization` with the RFC 9728 / RFC 8414 fields
- **AND** `status.authorization.state` SHALL be `Required` (or `DiscoveryFailed` if metadata is unavailable)

#### Scenario: MCPServer removes spec.authorization after successful auth

- **GIVEN** an MCPServer previously in state `Authorized`
- **WHEN** the user removes `spec.authorization` from the MCPServer
- **THEN** the controller SHALL stop injecting the Bearer header on subsequent reconciles
- **AND** SHALL re-run detection — if the server still returns 401, state returns to `Required`; if the server now accepts unauthenticated calls, `status.authorization` SHALL be cleared

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

#### Scenario: spec.headers carries a malformed Authorization value

- **GIVEN** an MCPServer whose `spec.headers` contains an `Authorization` entry with a non-Bearer or otherwise malformed value
- **WHEN** any in-cluster path constructs the MCP client
- **THEN** the value SHALL be passed through unchanged — the CLI / controller does not validate or rewrite explicit `spec.headers` values; this is the user's escape hatch and they accept the consequences

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

Secrets carrying label `ark.mckinsey.com/mcp-token-secret=true` SHALL trigger immediate reconciliation of every MCPServer whose `spec.authorization.tokenSecretRef.name` matches the changed Secret. The `MCPServerReconciler` SHALL register a field indexer on `spec.authorization.tokenSecretRef.name` and SHALL watch labelled Secrets via `builder.WithPredicates` so the reconcile loop fires on Secret events without depending on the resync interval. The label has no functional authorization behaviour — its absence SHALL NOT prevent authentication, only delay reconciliation until the next `pollInterval` tick. Login (`ark mcp auth login`) stamps the label on Secret create/patch as a real-time-reconcile convenience; charts and manual operators SHOULD also stamp it for the same reason.

#### Scenario: Operator patches a labelled token Secret

- **GIVEN** an MCPServer in state `Authorized` whose `tokenSecretRef` points at a Secret carrying the label `ark.mckinsey.com/mcp-token-secret=true`
- **WHEN** the operator patches the Secret to empty `access_token`
- **THEN** the controller SHALL reconcile within seconds and SHALL transition `status.authorization.state` to `Required`

#### Scenario: Multiple MCPServers reference the same labelled Secret

- **GIVEN** two MCPServers in the same namespace whose `spec.authorization.tokenSecretRef.name` points at the same labelled Secret
- **WHEN** the Secret is patched
- **THEN** the controller SHALL enqueue a reconcile for each MCPServer

### Requirement: Unlabelled token Secrets remain functional

When a Secret referenced by `spec.authorization.tokenSecretRef` lacks the `ark.mckinsey.com/mcp-token-secret` label, the controller SHALL still reconcile the MCPServer at the cadence set by `MCPServer.spec.pollInterval` (default `30s`). The label is a real-time convenience, not a correctness requirement. The cache SHALL NOT be filtered by this label — reconciler reads of any token Secret SHALL succeed regardless.

#### Scenario: Operator patches an unlabelled token Secret

- **GIVEN** an MCPServer whose `tokenSecretRef` points at a Secret with no `ark.mckinsey.com/mcp-token-secret` label
- **WHEN** the operator patches the Secret
- **THEN** the controller SHALL NOT immediately enqueue a reconcile based on the Secret event
- **AND** on the next `pollInterval`-driven reconcile (default `30s`) the reconciler SHALL read the updated Secret and transition state accordingly

