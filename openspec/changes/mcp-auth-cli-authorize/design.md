## Context

`mcp-auth-detection` populates `status.authorization` when an MCP server returns 401 with RFC 9728 metadata. That is discovery only — there is no spec-side input, no token storage, no refresh, and no mechanism to move `state` off `Required`. This change adds the minimum surface needed to obtain, store, inject, and refresh a single shared token per `MCPServer`.

The design is scoped to Fork 1A: **one token per MCPServer, shared by all agents that reference it.** Per-agent and per-user tokens are deliberately deferred.

The driver is the CLI (`ark mcp auth`). Running the OAuth flow in the CLI on the operator's workstation keeps the first cut simple — no in-cluster browser redirect plumbing, no CSRF story across a service gateway, no new authenticated endpoint on `ark-api`. The brokered `ark-api` path is a v2 change once the CLI flow is proven end to end.

Relevant RFCs / specs:

- RFC 6749 §6 — OAuth 2.0 Refresh Tokens.
- RFC 7591 — OAuth 2.0 Dynamic Client Registration.
- RFC 7636 — PKCE.
- RFC 8252 — OAuth for Native Apps (loopback redirect).
- RFC 8414 — OAuth Authorization Server Metadata.
- RFC 9728 — OAuth Protected Resource Metadata.
- MCP specification, 2025-06-18 revision — Authorization.

## Goals / Non-Goals

**Goals:**
- Operator can move an `MCPServer` from `state: Required` to `state: Authorized` with one command.
- Controller refreshes the access token before expiry without operator intervention.
- Token state is legible on the CRD (`state`, `lastRefreshed`, conditions).
- Works against `mcp.notion.com/mcp` end to end — the Notion MCP server is the trust anchor.
- Coexists with existing `spec.headers` (static per-request headers like `X-Org-Id`).
- GitOps-safe: ArgoCD/Flux do not prune controller-written Secret keys.

**Non-Goals:**
- Per-agent / per-user tokens.
- Dashboard UI, `ark-api` brokered OAuth endpoint, device flow, RFC 7009 token revocation.
- Customising DCR client metadata beyond registering with loopback redirect URIs.
- Caching resource metadata across reconciles (existing detection behaviour is reused).

## Decisions

### Decision: Token lives in a Kubernetes Secret, referenced by `spec.authorization.tokenSecretRef`

Secrets are the K8s-native home for credentials. A single namespaced Secret per MCPServer keeps blast radius narrow and lets standard RBAC and encryption-at-rest (KMS, sealed-secrets, etc.) apply without Ark-specific machinery.

`tokenSecretRef` is `{ name: string, keys?: {accessToken, refreshToken, expiresAt, clientId, clientSecret} }` with defaults for each key. The resolver uses the existing `resolution` package patterns already used for `spec.headers`.

**Alternative considered — inline token on spec/status**: Rejected. Secrets must not live on CRDs; kubectl users would leak them in logs, and status writes from the controller would race with spec writes from the CLI.

**Alternative considered — controller manages its own opaque store (etcd annotations, ConfigMap blob)**: Rejected. Not K8s-idiomatic, not GitOps-legible, breaks existing RBAC story for credential access.

### Decision: Helm creates the Secret shell, controller writes the data, nothing has OwnerReferences

The Helm chart ships a template that creates the Secret with `metadata.name` matching `tokenSecretRef.name`, no `data:` block, no `stringData:` block, labels identifying the MCPServer it belongs to. The CLI populates the Secret on first auth. The controller writes refreshed tokens back.

No OwnerReference from controller to Secret — Helm owns the Secret's lifecycle. This is a deliberate departure from typical operator patterns.

Rationale:

1. **GitOps prune safety.** If the chart declares `data:` block (even empty), ArgoCD/Flux will reconcile it back to empty and wipe the controller-written tokens on every sync. The chart MUST omit `data:` and `stringData:` so the declarative diff ignores those fields. This is well-understood idiomatic GitOps for controller-managed keys.
2. **`helm uninstall` cleans up.** If the controller owned the Secret, `helm uninstall` would orphan it. Helm ownership means tokens disappear with the release.
3. **No controller delete storms.** Controller never deletes the Secret; it only writes keys. Deletion is always operator-driven (`helm uninstall` or `kubectl delete secret`).

**Alternative considered — controller creates the Secret with OwnerReference to MCPServer**: Rejected. If operator deletes and recreates MCPServer (e.g. `kubectl apply -f` with a `helm template` pipeline that force-recreates), the old Secret is GC'd and the operator loses their token. Helm-owned Secret survives MCPServer recreation.

**Alternative considered — Helm declares `data: {}`**: Rejected. Even empty, GitOps will diff and wipe keys.

### Decision: Controller refreshes 60s before `expires_at`

Fixed 60s window. Simple, avoids a spec knob nobody will tune.

If the refresh succeeds, the controller writes the new `access_token`, `refresh_token` (if rotated per RFC 6749 §6), and `expires_at` back to the Secret and sets `state: Authorized`.

If the refresh fails (network, 4xx from token endpoint, missing refresh token), the controller sets `state: RefreshFailed`, emits a `Warning` event, and keeps the stale access token in the Secret so the operator can re-run `ark mcp auth`. If the access token has already expired at the time of refresh failure, state is `Expired` instead.

If a subsequent MCP call returns 401 with valid-looking tokens (token revoked at IdP, client deleted, scope change), the controller transitions back to `state: Required`, clearing the Bearer header path, and re-running discovery. The operator re-runs the CLI.

### Decision: CLI uses OAuth 2.1 Authorization Code + PKCE with loopback redirect

Per RFC 8252 §7.3, native apps MUST use a loopback redirect (`http://127.0.0.1:<port>/callback`) with a dynamically-allocated port, PKCE (RFC 7636), and no client secret for public clients. When the authorization server advertises `registrationEndpoint` (RFC 7591), the CLI performs DCR to obtain a `client_id` (and `client_secret` if confidential) with only the loopback redirect URI registered.

If DCR is not advertised, the CLI aborts with a hint pointing at the `registrationEndpoint` field. Manual pre-registered clients are deferred.

### Decision: Bearer header is injected dynamically by the controller, not materialised into `spec.headers`

Every reconcile resolves the Secret and constructs the per-request headers as `spec.headers ++ {Authorization: Bearer <access_token>}`. The CLI never writes to `spec.headers`. This keeps rotated tokens invisible to the user and avoids a CLI-to-spec write loop that would fight webhook mutations.

### Decision: Conflict between `spec.authorization` and `spec.headers[Authorization]` is rejected, not merged

Allowing both a `tokenSecretRef` and a static `Authorization` header to coexist creates an ambiguous request: which token reaches the MCP server depends on header-map iteration order or a "last writer wins" rule that users cannot reason about from the manifest. A silent override also risks leaking a stale static token if a future refactor changes precedence.

The conflict is rejected at two layers, defence-in-depth:

1. **Validating webhook (primary).** `spec.authorization != nil` AND any `spec.headers[i].name` equals `Authorization` case-insensitively (`strings.EqualFold`) denies admission. The error names the offending header index and both conflicting fields. This is textbook Kubernetes cross-field validation and matches existing Ark webhook prior art in `ark/internal/webhook/v1/`.

2. **Controller defence-in-depth.** If the clash reaches reconcile (webhook disabled, direct etcd write, upgrade race), the controller refuses to construct an MCP client, sets `Available=False` and `Discovering=False` with reason `AuthorizationHeaderConflict` (controller constant `MCPServerReasonAuthorizationHeaderConflict`, matching the existing style in `ark/internal/controller/mcpserver_controller.go`), emits a `Warning` event naming the offending header, leaves `status.authorization` untouched, and requeues on `pollInterval`. The resource self-heals once the user removes the header.

Users who want a static `Authorization` header can still do so by omitting `spec.authorization` entirely.

### Decision: CLI fails loudly when the Secret is missing

The CLI does not create the Secret. It looks up `tokenSecretRef`, fails with an actionable error if the Secret does not exist. Keeping creation in Helm means there's exactly one creator, which keeps GitOps happy and keeps RBAC simple (CLI only needs `update`, not `create`).

### Decision: Publish `status.authorization.expiresAt` on the CRD; no extra printcolumn

The controller SHALL publish `status.authorization.expiresAt` (optional `metav1.Time`) on every successful initial auth and every successful refresh, computed as `time.Now().UTC().Add(time.Duration(expires_in) * time.Second)` against the OAuth token response. On refresh failure `expiresAt` is left untouched (paired with the `Expired` / `RefreshFailed` state transition). When `status.authorization` is reset to absent (successful unauthenticated connection, or `spec.authorization` removed), `expiresAt` is cleared along with the rest of the subresource.

Rationale:

1. **Cert-manager precedent.** `Certificate.status.notAfter` publishes the absolute expiry timestamp on the CR for exactly this dashboard / `kubectl describe` use case. Ark follows that precedent rather than inventing a new convention.
2. **RBAC asymmetry.** Dashboard and observability consumers frequently have `get` on `mcpservers` but not on `secrets`. Publishing `expiresAt` on the CR lets them show token lifetime without widening credential access.
3. **Self-contained debugging.** `expiresAt` alongside `lastRefreshed` on the CR lets an operator reason about refresh cadence from `kubectl describe mcpserver` alone.
4. **Negligible cost.** Single timestamp field; already computed during refresh; info-leak risk of exposing token cadence is negligible.

**Non-goal — no dedicated printcolumn.** The existing `AUTH` printcolumn (state) from `mcp-auth-detection` remains the only kubectl column. Adding `EXPIRES` columns would be fleet-ops gilding outside v1 scope and risks breaking downstream `kubectl get mcpserver -o wide` layouts. `expiresAt` is reachable via `kubectl get mcpserver -o jsonpath` or `describe`.

## Architecture

### CRD delta

```go
type MCPServerSpec struct {
    // ... existing fields ...

    // Authorization configures how the controller obtains and injects
    // credentials for OAuth-protected MCP servers. When unset, the
    // controller does not attempt to inject Authorization headers.
    // +kubebuilder:validation:Optional
    Authorization *MCPServerAuthorizationSpec `json:"authorization,omitempty"`
}

type MCPServerAuthorizationSpec struct {
    // TokenSecretRef references the Kubernetes Secret holding OAuth
    // tokens and client credentials. The Secret MUST exist in the same
    // namespace as the MCPServer.
    // +kubebuilder:validation:Required
    TokenSecretRef TokenSecretRef `json:"tokenSecretRef"`
}

type TokenSecretRef struct {
    // +kubebuilder:validation:Required
    Name string `json:"name"`
    // +kubebuilder:validation:Optional
    Keys *TokenSecretKeys `json:"keys,omitempty"`
}

type TokenSecretKeys struct {
    // +kubebuilder:default="access_token"
    AccessToken string `json:"accessToken,omitempty"`
    // +kubebuilder:default="refresh_token"
    RefreshToken string `json:"refreshToken,omitempty"`
    // +kubebuilder:default="expires_at"
    ExpiresAt string `json:"expiresAt,omitempty"`
    // +kubebuilder:default="client_id"
    ClientID string `json:"clientId,omitempty"`
    // +kubebuilder:default="client_secret"
    ClientSecret string `json:"clientSecret,omitempty"`
}
```

Enum extension:

```go
// +kubebuilder:validation:Enum=Required;DiscoveryFailed;Authorized;Expired;RefreshFailed
type MCPServerAuthorizationState string

const (
    MCPServerAuthorizationStateRequired        MCPServerAuthorizationState = "Required"
    MCPServerAuthorizationStateDiscoveryFailed MCPServerAuthorizationState = "DiscoveryFailed"
    MCPServerAuthorizationStateAuthorized      MCPServerAuthorizationState = "Authorized"
    MCPServerAuthorizationStateExpired         MCPServerAuthorizationState = "Expired"
    MCPServerAuthorizationStateRefreshFailed   MCPServerAuthorizationState = "RefreshFailed"
)
```

`MCPServerAuthorizationStatus` gains two optional fields:

```go
// LastRefreshed is the timestamp of the most recent successful token
// refresh (or initial CLI authorization).
// +kubebuilder:validation:Optional
LastRefreshed *metav1.Time `json:"lastRefreshed,omitempty"`

// ExpiresAt is the absolute time at which the current access_token
// expires, derived from the token endpoint's expires_in plus receipt
// time. Published for dashboard / observability consumers that may
// have get on mcpservers but not on secrets.
// +kubebuilder:validation:Optional
ExpiresAt *metav1.Time `json:"expiresAt,omitempty"`
```

### Secret schema

```
apiVersion: v1
kind: Secret
metadata:
  name: notion-mcp-token
  namespace: default
  labels:
    ark.mckinsey.com/mcpserver: notion-mcp
type: Opaque
# No data: or stringData: block — controller writes keys directly.
```

After `ark mcp auth notion-mcp`:

```
data:
  access_token:   <base64>
  refresh_token:  <base64>   # may be absent if IdP does not issue one
  expires_at:     <base64 RFC3339>
  client_id:      <base64>
  client_secret:  <base64>   # absent for public clients
```

### State machine

```
                +----------------------+
                | (no .authorization)  |
                |    not required      |
                +----------+-----------+
                           | 401 observed (detection)
                           v
                +----------------------+     401 with no RFC9728
                |      Required        |-------------> DiscoveryFailed
                +----------+-----------+
                           | ark mcp auth <name>
                           | (CLI writes Secret)
                           v
                +----------------------+
     +--------->|     Authorized       |
     |          +----------+-----------+
     |                     |
     |        t < expiry-60s: ok, no-op
     |                     |
     |        t >= expiry-60s:
     |          +----------v-----------+
     |          |   refresh attempt    |
     |          +---+----------+-------+
     |              |          |
     |      success |          | failure && access token valid
     +--------------+          |
                               v
                    +----------+-----------+       access token also expired
                    |    RefreshFailed     +-------> Expired
                    +----------+-----------+
                               |
                               | ark mcp auth <name>
                               v
                           Authorized

  Any state except Required:
     401 from MCP on next call ==> Required (tokens preserved in Secret; operator re-runs CLI)
```

### CLI sequence (`ark mcp auth notion-mcp`)

```
operator                  ark CLI                 K8s API           AS (authorization server)        MCP server

  $ ark mcp auth notion-mcp
    |-------------------->|
                           | GET mcpservers/notion-mcp
                           |----------------------------->|
                           |<-----------------------------|
                           | read status.authorization:
                           |   registrationEndpoint,
                           |   authorizationEndpoint,
                           |   tokenEndpoint,
                           |   scopesSupported
                           |
                           | GET secrets/<tokenSecretRef.name>
                           |----------------------------->|
                           |<---- 404? fail loudly -------|
                           |<---- found + empty ----------|
                           |
                           | bind 127.0.0.1:<random port>
                           |
                           | POST registrationEndpoint            (RFC 7591 DCR)
                           | {redirect_uris: ["http://127.0.0.1:PORT/callback"]}
                           |--------------------------------------------->|
                           |<------- {client_id, client_secret?} ---------|
                           |
                           | generate code_verifier, code_challenge       (RFC 7636)
                           | open browser:
                           |   authorizationEndpoint?response_type=code
                           |     &client_id=...&redirect_uri=...
                           |     &code_challenge=...&code_challenge_method=S256
                           |     &scope=<scopesSupported joined>
                           |     &state=<random>
                           |<===== user authenticates + consents =========|
                           |<---- GET /callback?code=...&state=... -------| (via browser)
                           |
                           | POST tokenEndpoint
                           |   grant_type=authorization_code
                           |   code=...&code_verifier=...&client_id=...
                           |--------------------------------------------->|
                           |<-- {access_token, refresh_token, expires_in, ...} --|
                           |
                           | PATCH secrets/<name> with all five keys
                           |----------------------------->|
                           |<---- updated ----------------|
                           |
                           | print "Authorized. Controller will refresh automatically."
  <----------------------<|
```

### Controller refresh loop (per reconcile of an MCPServer with `spec.authorization` set)

```
    reconcile(mcpserver)
           |
           v
   +------------------+       no          +-----------------+
   | Secret exists?   +------------------>| state = Required|
   +--------+---------+                   | (if not already)|
            | yes                         +-----------------+
            v
   +------------------+      yes (no access_token key)
   | Secret populated?+--------------> state = Required
   +--------+---------+
            | yes
            v
   +-----------------------+
   | now >= expires_at-60s?|
   +--+-----------------+--+
      | no              | yes
      v                 v
 inject Bearer   try refresh_token grant
 state=Authorized     |
      |               +---- success ----> write new tokens + expires_at
      |                                    state=Authorized
      |               |
      |               +---- failure, token still valid ---> state=RefreshFailed
      |               |                                      keep old tokens
      |               +---- failure, token expired ---------> state=Expired
      v
 build MCP client with
 spec.headers ++ {Authorization: Bearer <access_token>}
           |
           v
   +--------------------+
   | MCP call 401?      |
   +--+----------------++
      | no             | yes (token revoked at IdP)
      v                v
   continue        state = Required
   tool sync       clear LastRefreshed
                   emit Warning event
                   re-run RFC 9728 discovery
```

### RBAC

Controller ServiceAccount needs, scoped to namespaces it already watches:

- `get`, `list`, `watch` on `secrets` — to read token Secrets referenced by `tokenSecretRef`.
- `update`, `patch` on `secrets` — to write refreshed tokens.

No `create` or `delete` on Secrets. The chart ships the Role/ClusterRole delta alongside the Secret template.

### CLI RBAC

The `ark mcp auth` command runs as the operator's kubeconfig identity. It needs:

- `get` on `mcpservers` (to read `status.authorization` and `spec.authorization.tokenSecretRef`).
- `get`, `update`, `patch` on `secrets` in the target namespace.

Not Ark's problem to grant these — documented in the operator guide.

### Coexistence with `spec.headers`

`spec.headers` remains supported unchanged. The controller builds the final header map as:

```
final := resolveSpecHeaders(mcpserver.Spec.Headers)
if spec.authorization is set:
    # webhook has already rejected any spec.headers[Authorization] entry;
    # controller double-checks and bails on AuthorizationHeaderConflict if present.
    inject Bearer from Secret
```

This lets users still set `X-Org-Id`, trace headers, etc. without interfering with the Bearer path. See the "Conflict between `spec.authorization` and `spec.headers[Authorization]`" decision above for how clashes are rejected.

## Edge cases

- **Secret deleted mid-life.** Next reconcile sees the Secret missing → state → `Required`, MCP client dropped. Operator re-runs CLI. The MCPServer does NOT silently fall back to unauthenticated calls.
- **`refresh_token` rotation.** RFC 6749 §6 allows the token endpoint to return a new `refresh_token` alongside the new `access_token`. The controller overwrites both keys atomically in the Secret (single PATCH). If the new `refresh_token` key is absent in the response, the existing one is preserved.
- **DCR client secret rotation.** If the IdP rotates or invalidates the DCR-registered client (out-of-band), token refresh returns `invalid_client`. State → `RefreshFailed`. The operator re-runs `ark mcp auth`, which performs DCR again, writes new `client_id`/`client_secret` into the Secret, and starts a fresh authorization.
- **`helm uninstall`.** Removes the Secret (Helm owns it) along with MCPServer and associated resources. Tokens are gone. Clean.
- **User re-runs `ark mcp auth`.** CLI overwrites the five keys in the Secret, reusing the existing `client_id`/`client_secret` if present (skipping DCR) unless the CLI is invoked with `--force-register`. Controller picks up the new `access_token` on next reconcile.
- **Token revoked at IdP.** MCP call returns 401. Controller transitions `Authorized → Required`, re-runs detection (the 401 + WWW-Authenticate path). Tokens remain in the Secret so the operator has a trail; CLI re-run replaces them.
- **IdP without `registration_endpoint` but server requires auth.** CLI aborts with an actionable message. Out of scope to support manually pre-registered clients in v1.
- **Secret in a different namespace than the MCPServer.** Not supported. Validation webhook rejects (cross-namespace Secret references are a blast-radius risk).
- **Controller restart with expired token.** First reconcile after restart does a normal refresh attempt. If the refresh succeeds, no user-visible effect. If it fails (already past `expires_at`), state → `Expired`.
- **Clock skew.** 60s refresh window gives enough headroom for reasonable clock drift between controller node and IdP. Not addressed further; extreme skew is an operational problem.

## Open Questions

- Final shape of `TokenSecretRef` (single `name` + optional `keys` override vs. per-key `SecretKeySelector`). Current design uses the former for brevity; revisit if downstream consumers need per-key namespacing.
