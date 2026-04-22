## ADDED Requirements

### Requirement: MCPServer spec carries an optional authorization block referencing a token Secret

The `MCPServer` CRD (v1alpha1) SHALL gain an optional `spec.authorization` object with a required `tokenSecretRef`. `tokenSecretRef` SHALL reference a Kubernetes Secret in the same namespace as the MCPServer and MAY override the key names used within the Secret, defaulting to `access_token`, `refresh_token`, `expires_at`, `client_id`, `client_secret`. When `spec.authorization` is unset, the controller SHALL NOT attempt to inject any Authorization header.

#### Scenario: MCPServer is created with authorization configured

- **GIVEN** an `MCPServer` with `spec.authorization.tokenSecretRef.name = notion-mcp-token`
- **WHEN** the controller reconciles the resource
- **THEN** the controller SHALL resolve a Secret named `notion-mcp-token` in the same namespace
- **AND** SHALL use the default keys `access_token`, `refresh_token`, `expires_at`, `client_id`, `client_secret` unless overridden under `spec.authorization.tokenSecretRef.keys`

#### Scenario: MCPServer omits spec.authorization

- **GIVEN** an `MCPServer` with `spec.authorization` unset
- **WHEN** the controller reconciles the resource
- **THEN** the controller SHALL NOT read any Secret for token injection
- **AND** SHALL NOT add an `Authorization` header to MCP requests

#### Scenario: tokenSecretRef references a Secret in a different namespace

- **WHEN** a user submits an `MCPServer` whose `spec.authorization.tokenSecretRef.name` contains a namespace qualifier or otherwise refers to a cross-namespace Secret
- **THEN** the validating webhook SHALL reject the admission with a message identifying the offending field

### Requirement: MCPServerAuthorizationState enum is extended with token lifecycle values

The `MCPServerAuthorizationState` enum SHALL be extended to `Required | DiscoveryFailed | Authorized | Expired | RefreshFailed`. Existing detection behaviour for `Required` and `DiscoveryFailed` SHALL be preserved unchanged.

#### Scenario: Controller successfully injects a Bearer token

- **GIVEN** an `MCPServer` whose referenced Secret contains a non-empty `access_token` and an `expires_at` in the future
- **WHEN** the controller reconciles and constructs the MCP client
- **THEN** `status.authorization.state` SHALL be `Authorized`
- **AND** `status.authorization.lastRefreshed` SHALL reflect either the initial CLI write time or the most recent successful refresh

### Requirement: Controller injects Bearer access token into MCP requests when authorization is configured

When `spec.authorization` is set and the referenced Secret contains a non-empty `access_token`, the controller SHALL inject `Authorization: Bearer <access_token>` into the MCP client's header map on every reconcile. Any other headers in `spec.headers` SHALL be preserved unchanged.

#### Scenario: spec.headers defines non-auth headers alongside authorization

- **GIVEN** an `MCPServer` with `spec.headers = [{name: "X-Org-Id", value: "acme"}]` and a valid token in the referenced Secret
- **WHEN** the controller builds the MCP client
- **THEN** the outgoing MCP request SHALL include both `X-Org-Id: acme` and `Authorization: Bearer <access_token>`

#### Scenario: Secret is missing when reconcile runs

- **WHEN** `spec.authorization.tokenSecretRef` points at a Secret that does not exist
- **THEN** the controller SHALL set `status.authorization.state` to `Required`
- **AND** SHALL NOT make MCP requests with an `Authorization` header
- **AND** SHALL preserve the existing RFC 9728 metadata fields on `status.authorization`

#### Scenario: Secret exists but access_token key is empty or missing

- **WHEN** the referenced Secret exists but the configured `access_token` key is absent or contains an empty value
- **THEN** the controller SHALL treat the MCPServer as state `Required`
- **AND** SHALL NOT make MCP requests with an `Authorization` header

### Requirement: Conflict between spec.authorization and spec.headers[Authorization] is rejected

An MCPServer with `spec.authorization` set MUST NOT also declare an entry in `spec.headers` whose `name` equals `Authorization` (case-insensitive, using `strings.EqualFold`). This conflict SHALL be rejected at two layers as defence-in-depth.

The validating webhook SHALL deny admission when `spec.authorization` is non-nil and any `spec.headers[i].name` equals `Authorization` case-insensitively. The error message SHALL name the offending header index and both conflicting fields so the operator can correct either side.

If such a conflict reaches reconcile (webhook disabled, direct etcd write, or upgrade race), the controller SHALL NOT issue any request to the MCP server, SHALL NOT mark the MCPServer `Authorized`, and SHALL set both `Available=False` and `Discovering=False` conditions with reason `AuthorizationHeaderConflict`. It SHALL emit a Kubernetes `Warning` event with reason `AuthorizationHeaderConflict` naming the offending header, SHALL NOT mutate `status.authorization`, and SHALL requeue on the standard `pollInterval` so the resource self-heals once the conflict is removed.

#### Scenario: Webhook rejects apply when spec.authorization and Authorization header both set

- **GIVEN** an `MCPServer` manifest with `spec.authorization.tokenSecretRef.name = notion-mcp-token` AND `spec.headers = [{name: "X-Org-Id", value: "acme"}, {name: "Trace-Id", value: "..."}, {name: "Authorization", value: "Bearer legacy"}]`
- **WHEN** the operator runs `kubectl apply -f` against the cluster
- **THEN** the validating webhook SHALL deny admission
- **AND** the error message SHALL name the offending header index (`spec.headers[2]`) and indicate that it conflicts with `spec.authorization.tokenSecretRef`

#### Scenario: Webhook allows apply when spec.headers contains only non-Authorization entries

- **GIVEN** an `MCPServer` manifest with `spec.authorization` set and `spec.headers = [{name: "X-Org-Id", value: "acme"}, {name: "Trace-Id", value: "..."}]`
- **WHEN** the operator runs `kubectl apply -f` against the cluster
- **THEN** the validating webhook SHALL admit the resource
- **AND** the controller SHALL proceed with Bearer injection as specified

#### Scenario: Webhook allows Authorization in spec.headers when spec.authorization is absent

- **GIVEN** an `MCPServer` manifest with `spec.authorization` unset and `spec.headers = [{name: "Authorization", value: "Bearer static-token"}]`
- **WHEN** the operator runs `kubectl apply -f` against the cluster
- **THEN** the validating webhook SHALL admit the resource
- **AND** the controller SHALL send the static `Authorization` header unchanged on MCP requests

#### Scenario: Controller detects conflict that bypassed the webhook

- **GIVEN** an `MCPServer` where `spec.authorization` is set AND `spec.headers` contains an entry named `authorization` (any case), e.g. the webhook was disabled or the resource was written directly to etcd during upgrade
- **WHEN** the controller reconciles the resource
- **THEN** the controller SHALL NOT issue any request to the MCP server
- **AND** SHALL set condition `Available=False` with reason `AuthorizationHeaderConflict`
- **AND** SHALL set condition `Discovering=False` with reason `AuthorizationHeaderConflict`
- **AND** SHALL emit a Kubernetes `Warning` event with reason `AuthorizationHeaderConflict` naming the offending header
- **AND** SHALL NOT mutate `status.authorization`
- **AND** SHALL requeue on `pollInterval`

#### Scenario: Controller clears conflict once the offending header is removed

- **GIVEN** an `MCPServer` previously in conflict with conditions `Available=False` / `Discovering=False` reason `AuthorizationHeaderConflict`
- **WHEN** the user removes the `Authorization` entry from `spec.headers`
- **THEN** on the next reconcile the controller SHALL clear the `AuthorizationHeaderConflict` reason from both conditions
- **AND** SHALL resume the normal authorization flow (detection, Bearer injection, refresh) as specified elsewhere in this capability

### Requirement: Controller refreshes access tokens before expiry

When `status.authorization.state` is `Authorized` and `now >= expires_at - 60s`, the controller SHALL attempt an OAuth 2.0 refresh (RFC 6749 §6) against the `tokenEndpoint` using the stored `refresh_token`, `client_id`, and (if present) `client_secret`. On success, the controller SHALL atomically update the Secret's `access_token`, `expires_at`, and (if returned by the authorization server) `refresh_token` keys in a single PATCH and SHALL set `status.authorization.lastRefreshed` to the current time. The controller SHALL NOT materialise tokens into the CRD spec or status beyond `state`, `lastRefreshed`, and `expiresAt`.

#### Scenario: Token is within 60s of expiry and refresh succeeds

- **GIVEN** a Secret with `expires_at` that is 30s in the future and a valid `refresh_token`
- **WHEN** the controller reconciles
- **THEN** the controller SHALL POST `grant_type=refresh_token` with `refresh_token`, `client_id`, and `client_secret` (if present) to the `tokenEndpoint`
- **AND** on receiving a 2xx response, SHALL write the new `access_token`, `expires_at`, and (if present) rotated `refresh_token` to the Secret in a single PATCH
- **AND** SHALL keep `status.authorization.state = Authorized`

#### Scenario: Refresh response rotates the refresh_token

- **WHEN** the token endpoint returns a new `refresh_token` in addition to a new `access_token`
- **THEN** the controller SHALL overwrite the Secret's `refresh_token` key with the new value
- **AND** the previous `refresh_token` value SHALL NOT be retained

#### Scenario: Refresh response omits refresh_token

- **WHEN** the token endpoint returns only a new `access_token` and `expires_in`
- **THEN** the existing `refresh_token` key in the Secret SHALL be preserved unchanged
- **AND** `access_token` and `expires_at` SHALL be updated

#### Scenario: Refresh fails but access token is still valid

- **WHEN** the refresh attempt returns a network error or a non-2xx response, and `now < expires_at`
- **THEN** `status.authorization.state` SHALL be set to `RefreshFailed`
- **AND** the Secret SHALL be left unchanged
- **AND** the controller SHALL emit a `Warning` event with reason `RefreshFailed`

#### Scenario: Refresh fails and access token has expired

- **WHEN** the refresh attempt fails AND `now >= expires_at`
- **THEN** `status.authorization.state` SHALL be set to `Expired`
- **AND** the controller SHALL NOT inject an `Authorization` header until the Secret is repopulated

### Requirement: Controller publishes access token expiry on status.authorization.expiresAt

The controller SHALL populate `status.authorization.expiresAt` (`metav1.Time`, optional) on every successful initial authorization and every successful refresh, computed as `time.Now().UTC().Add(time.Duration(expires_in) * time.Second)` against the OAuth 2.0 token response. The controller SHALL leave `status.authorization.expiresAt` unchanged when a refresh fails (paired with the `RefreshFailed` or `Expired` state transition). The controller SHALL clear `status.authorization.expiresAt` whenever `status.authorization` is reset to absent — that is, a successful unauthenticated reconcile or removal of `spec.authorization`. No kubectl printcolumn SHALL be added for `expiresAt`; the existing `AUTH` (state) column from `mcp-auth-detection` remains the only printcolumn.

#### Scenario: Initial authorization populates expiresAt

- **GIVEN** an `MCPServer` in state `Required` with a Helm-managed Secret shell
- **WHEN** the operator runs `ark mcp auth <name>` and the token endpoint returns `{ access_token, expires_in: 3600, ... }` at wall-clock `T`
- **AND** the controller next reconciles and observes the populated Secret
- **THEN** `status.authorization.expiresAt` SHALL be set to `T + 3600s` in UTC
- **AND** `status.authorization.state` SHALL be `Authorized`

#### Scenario: Successful refresh updates expiresAt

- **GIVEN** an `MCPServer` in state `Authorized` with `status.authorization.expiresAt = T1`
- **WHEN** the controller performs a successful refresh at wall-clock `T2` and the token endpoint returns `expires_in: 3600`
- **THEN** `status.authorization.expiresAt` SHALL be updated to `T2 + 3600s` in UTC
- **AND** `status.authorization.lastRefreshed` SHALL be updated to `T2`

#### Scenario: Refresh failure preserves expiresAt

- **GIVEN** an `MCPServer` in state `Authorized` with `status.authorization.expiresAt = T1`
- **WHEN** the controller attempts a refresh and receives a network error or non-2xx response
- **THEN** `status.authorization.expiresAt` SHALL remain `T1`, unchanged
- **AND** `status.authorization.state` SHALL be `RefreshFailed` or `Expired` as defined in the refresh requirement

#### Scenario: Authorization cleared removes expiresAt

- **GIVEN** an `MCPServer` previously in state `Authorized` with `status.authorization.expiresAt` populated
- **WHEN** the operator removes `spec.authorization` and a subsequent reconcile confirms the server accepts unauthenticated calls
- **THEN** `status.authorization` SHALL be cleared in its entirety
- **AND** `status.authorization.expiresAt` SHALL therefore be absent

### Requirement: Controller transitions back to Required on IdP-side revocation

When the MCPServer is in state `Authorized`, `RefreshFailed`, or `Expired` and the next MCP call receives HTTP 401 with a `WWW-Authenticate` Bearer challenge, the controller SHALL re-run RFC 9728 / RFC 8414 discovery and SHALL set `status.authorization.state` to `Required`. The Secret's `access_token` and `refresh_token` keys SHALL be preserved so that the operator has an audit trail; they are overwritten on the next successful CLI authorization.

#### Scenario: MCP server returns 401 despite a valid-looking Bearer token

- **GIVEN** an MCPServer in state `Authorized` with an unexpired `access_token`
- **WHEN** the next MCP `initialize` call returns HTTP 401 with a parseable `WWW-Authenticate` header
- **THEN** the controller SHALL set `status.authorization.state = Required`
- **AND** SHALL re-run RFC 9728 + RFC 8414 discovery as defined in `mcp-auth-detection`
- **AND** SHALL NOT delete the Secret or any of its keys
- **AND** SHALL emit a `Warning` event with reason `AuthorizationRevoked`

### Requirement: ark CLI performs OAuth 2.1 Authorization Code + PKCE to populate the token Secret

The `ark mcp auth <name>` command SHALL obtain tokens via OAuth 2.1 Authorization Code with PKCE (RFC 7636), using an RFC 8252 loopback redirect URI (`http://127.0.0.1:<port>/callback` on a dynamically-allocated port). When the authorization server advertises a `registration_endpoint` (RFC 7591), the CLI SHALL perform Dynamic Client Registration unless a `client_id` is already present in the target Secret and `--force-register` was not passed. The CLI SHALL write `access_token`, `refresh_token`, `expires_at`, `client_id`, and (when applicable) `client_secret` to the referenced Secret in a single PATCH. The CLI SHALL NOT create the Secret; if the Secret does not exist the CLI SHALL fail with an actionable error.

#### Scenario: Happy path against mcp.notion.com/mcp

- **GIVEN** an `MCPServer` with `status.authorization.state = Required`, `registrationEndpoint`, `authorizationEndpoint`, `tokenEndpoint`, and `scopesSupported` populated, and a Helm-managed Secret existing in the MCPServer's namespace
- **WHEN** the operator runs `ark mcp auth notion-mcp`
- **THEN** the CLI SHALL bind 127.0.0.1 on an ephemeral port
- **AND** SHALL perform RFC 7591 DCR and receive a `client_id` (and possibly `client_secret`)
- **AND** SHALL generate a PKCE `code_verifier` and `code_challenge` using the `S256` method
- **AND** SHALL open the user's browser to the `authorizationEndpoint` with `response_type=code`, `code_challenge`, `code_challenge_method=S256`, a `redirect_uri` matching the loopback port, the advertised scopes, and a fresh `state`
- **AND** on receiving a `code` on the loopback callback, SHALL exchange it at the `tokenEndpoint` using the stored `code_verifier`
- **AND** SHALL PATCH the referenced Secret with `access_token`, `refresh_token`, `expires_at`, `client_id`, `client_secret` in a single update
- **AND** on the next controller reconcile, `status.authorization.state` SHALL transition to `Authorized`

#### Scenario: Target Secret does not exist

- **WHEN** the operator runs `ark mcp auth <name>` and the Secret named by `spec.authorization.tokenSecretRef.name` is missing
- **THEN** the CLI SHALL exit with a non-zero status
- **AND** SHALL print an error instructing the operator to install/sync the Ark Helm chart (or create the Secret shell manually) before retrying

#### Scenario: Authorization server does not advertise RFC 7591 registration

- **WHEN** the operator runs `ark mcp auth <name>` and `status.authorization.registrationEndpoint` is empty
- **THEN** the CLI SHALL exit with a non-zero status
- **AND** SHALL print an error indicating that manual client registration is not yet supported

#### Scenario: Re-running the CLI with an existing registered client

- **GIVEN** the referenced Secret already contains `client_id` (and optionally `client_secret`)
- **WHEN** the operator runs `ark mcp auth <name>` without `--force-register`
- **THEN** the CLI SHALL skip DCR and reuse the stored client credentials
- **AND** SHALL run the authorization code + PKCE flow, overwriting `access_token`, `refresh_token`, `expires_at`

#### Scenario: Operator passes --force-register

- **WHEN** the operator runs `ark mcp auth <name> --force-register`
- **THEN** the CLI SHALL perform DCR regardless of stored `client_id`
- **AND** SHALL overwrite `client_id` and `client_secret` in the Secret with the newly-registered values

### Requirement: Helm chart provisions the token Secret shell without writing data

The Ark Helm chart SHALL ship a template that creates one Kubernetes Secret per MCPServer whose `spec.authorization.tokenSecretRef.name` is referenced in chart values. The rendered Secret SHALL have `type: Opaque`, MUST carry a `ark.mckinsey.com/mcpserver: <name>` label, and MUST omit both `data:` and `stringData:` blocks so that GitOps controllers (ArgoCD, Flux) do not prune controller-written keys. The controller SHALL NOT set an `OwnerReference` from the Secret to the MCPServer; lifecycle ownership SHALL remain with the Helm release.

#### Scenario: Rendered Helm template has no data block

- **WHEN** `helm template` is run over the chart with an MCPServer using `spec.authorization.tokenSecretRef.name = notion-mcp-token`
- **THEN** the rendered Secret manifest SHALL contain `type: Opaque` and `metadata.labels["ark.mckinsey.com/mcpserver"] = notion-mcp`
- **AND** SHALL NOT contain any `data:` or `stringData:` field

#### Scenario: GitOps sync does not prune controller-written keys

- **GIVEN** an ArgoCD Application managing the chart where a previous `ark mcp auth` run populated the Secret
- **WHEN** ArgoCD performs a sync
- **THEN** the Secret's `data` keys SHALL remain intact because the chart declares no `data` field (the declarative diff ignores fields that are not declared)

#### Scenario: helm uninstall removes the Secret

- **WHEN** the operator runs `helm uninstall <release>` against a release that included the MCPServer
- **THEN** the Secret SHALL be deleted as part of the Helm release cleanup
- **AND** any stored tokens SHALL be gone from the cluster

### Requirement: Controller RBAC grants Secret read/write but not create/delete

The Ark controller ServiceAccount's Role / ClusterRole SHALL include `get`, `list`, `watch`, `update`, and `patch` verbs on the `secrets` resource in namespaces that the controller watches. It SHALL NOT include `create` or `delete` on `secrets`. This keeps Secret lifecycle ownership with Helm (or whatever created the Secret shell).

#### Scenario: Controller attempts to create a Secret

- **WHEN** an implementation bug causes the controller to call `Create` on a Secret
- **THEN** the Kubernetes API SHALL reject the request with `Forbidden`
- **AND** the controller SHALL log the error and surface it via a `Warning` event — it SHALL NOT silently succeed or create the Secret by any other means

#### Scenario: Controller refreshes a token

- **WHEN** the controller performs a successful refresh and writes new keys to the Secret
- **THEN** the API call SHALL be a `PATCH` (or `Update`) — not a `Create` or `Delete` — and the Secret's `metadata.labels` and `metadata.ownerReferences` SHALL be preserved unchanged

### Requirement: Coexistence with mcp-auth-detection is preserved

All behaviours defined by `mcp-auth-detection` SHALL continue to hold unchanged. In particular, detection SHALL populate `status.authorization` on the first 401 regardless of whether `spec.authorization` is set, and re-running discovery on each poll interval SHALL remain idempotent.

#### Scenario: Authorization configured but detection has not yet run

- **GIVEN** a new `MCPServer` with `spec.authorization.tokenSecretRef` set and an empty `status.authorization`
- **WHEN** the controller reconciles for the first time
- **THEN** detection SHALL run as specified in `mcp-auth-detection` and populate `status.authorization` with the RFC 9728 / RFC 8414 fields
- **AND** only after discovery succeeds SHALL the CLI have the endpoint metadata it needs to run

#### Scenario: MCPServer removes spec.authorization after successful auth

- **GIVEN** an MCPServer previously in state `Authorized`
- **WHEN** the user removes `spec.authorization` from the MCPServer
- **THEN** the controller SHALL stop injecting the Bearer header on subsequent reconciles
- **AND** SHALL re-run detection — if the server still returns 401, state returns to `Required`; if the server now accepts unauthenticated calls, `status.authorization` SHALL be cleared
