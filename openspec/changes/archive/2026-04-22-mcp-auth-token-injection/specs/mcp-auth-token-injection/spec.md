## ADDED Requirements

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
