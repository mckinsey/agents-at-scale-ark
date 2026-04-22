## Context

`mcp-auth-detection` populates `status.authorization` when an MCP server returns 401 with RFC 9728 metadata. That is discovery only — there is no spec-side input, no token storage, no refresh, and no mechanism to move `state` off `Required`. This change adds the minimum controller-side surface needed to consume, inject, and refresh a single shared token per `MCPServer` once an external actor has populated it.

The design is scoped to Fork 1A: **one token per MCPServer, shared by all agents that reference it.** Per-agent and per-user tokens are deliberately deferred.

The mechanism used to *populate* the Secret initially is out of scope. Callers — a future Ark CLI OAuth driver, a brokered `ark-api` endpoint, a Helm pre-install job, or a human running `kubectl edit secret` — MUST write an initial `access_token`, `refresh_token`, and `expires_at` (plus `client_id` / `client_secret` if refresh requires them). The controller owns everything that happens after that: rotation, injection, state reporting. This separation keeps the CRD contract stable while the upstream driver design is still moving.

Relevant RFCs / specs used directly by the controller:

- RFC 6749 §6 — OAuth 2.0 Refresh Tokens.
- RFC 8414 — OAuth Authorization Server Metadata (for `tokenEndpoint` discovery, via `mcp-auth-detection`).
- RFC 9728 — OAuth Protected Resource Metadata (for 401 re-discovery after revocation).
- MCP specification, 2025-06-18 revision — Authorization.

RFC 7591 (DCR) and RFC 7636 (PKCE) are concerns of the driver that populates the Secret; the controller does not use them.

## Goals / Non-Goals

**Goals:**
- Controller can move an `MCPServer` from `state: Required` to `state: Authorized` once an external actor populates the Secret.
- Controller refreshes the access token before expiry without operator intervention.
- Token state is legible on the CRD (`state`, `lastRefreshed`, `expiresAt`, conditions).
- Works against `mcp.notion.com/mcp` end to end — the Notion MCP server is the trust anchor.
- Coexists with existing `spec.headers` (static per-request headers like `X-Org-Id`).
- GitOps-safe: ArgoCD/Flux do not prune controller-written Secret keys.
- Agnostic about who populates the Secret.

**Non-Goals:**
- Per-agent / per-user tokens.
- Any in-tree OAuth 2.1 + PKCE flow, DCR, loopback redirect, or browser dance — the driver side is a follow-up change.
- `ark-api` brokered OAuth endpoint, dashboard UI, device flow, RFC 7009 token revocation.
- Caching resource metadata across reconciles (existing detection behaviour is reused).

## Decisions

### Decision: Token lives in a Kubernetes Secret, referenced by `spec.authorization.tokenSecretRef`

Secrets are the K8s-native home for credentials. A single namespaced Secret per MCPServer keeps blast radius narrow and lets standard RBAC and encryption-at-rest (KMS, sealed-secrets, etc.) apply without Ark-specific machinery.

`tokenSecretRef` is `{ name: string, keys?: {accessToken, refreshToken, expiresAt, clientId, clientSecret} }` with defaults for each key. The resolver uses the existing `resolution` package patterns already used for `spec.headers`.

**Alternative considered — inline token on spec/status**: Rejected. Secrets must not live on CRDs; kubectl users would leak them in logs, and status writes from the controller would race with spec writes from the caller.

**Alternative considered — controller manages its own opaque store (etcd annotations, ConfigMap blob)**: Rejected. Not K8s-idiomatic, not GitOps-legible, breaks existing RBAC story for credential access.

### Decision: Helm creates the Secret shell, caller populates the data, nothing has OwnerReferences

The Helm chart ships a template that creates the Secret with `metadata.name` matching `tokenSecretRef.name`, no `data:` block, no `stringData:` block, labels identifying the MCPServer it belongs to. An external caller populates the Secret with the initial `access_token`, `refresh_token`, and `expires_at`. The controller writes refreshed tokens back.

No OwnerReference from controller to Secret — Helm owns the Secret's lifecycle. This is a deliberate departure from typical operator patterns.

Rationale:

1. **GitOps prune safety.** If the chart declares `data:` block (even empty), ArgoCD/Flux will reconcile it back to empty and wipe the controller-written tokens on every sync. The chart MUST omit `data:` and `stringData:` so the declarative diff ignores those fields. This is well-understood idiomatic GitOps for controller-managed keys.
2. **`helm uninstall` cleans up.** If the controller owned the Secret, `helm uninstall` would orphan it. Helm ownership means tokens disappear with the release.
3. **No controller delete storms.** Controller never deletes the Secret; it only writes keys. Deletion is always operator-driven (`helm uninstall` or `kubectl delete secret`).

**Alternative considered — controller creates the Secret with OwnerReference to MCPServer**: Rejected. If operator deletes and recreates MCPServer, the old Secret is GC'd and the operator loses their token. Helm-owned Secret survives MCPServer recreation.

**Alternative considered — Helm declares `data: {}`**: Rejected. Even empty, GitOps will diff and wipe keys.

### Decision: Controller refreshes 60s before `expires_at`

Fixed 60s window. Simple, avoids a spec knob nobody will tune.

If the refresh succeeds, the controller writes the new `access_token`, `refresh_token` (if rotated per RFC 6749 §6), and `expires_at` back to the Secret and sets `state: Authorized`.

If the refresh fails (network, 4xx from token endpoint, missing refresh token), the controller transitions `state: Authorized → Required`, emits the new `TokenRejected` `Warning` event, and keeps the stale tokens in the Secret so the caller has an audit trail. Natural token expiry without a usable `refresh_token` is handled the same way: no dedicated `Expired` state — the controller simply rolls back to `Required` and lets the caller repopulate.

If a subsequent MCP call returns 401 with valid-looking tokens (token revoked at IdP, client deleted, scope change), the controller likewise transitions back to `state: Required` and clears the Bearer header path. The same `TokenRejected` event is emitted — from the controller's point of view, refresh failure and 401-on-use are indistinguishable signals that the current credentials no longer work.

### Decision: Single `TokenRejected` Warning event covers all Authorized → Required transitions

Rather than introduce dedicated `Expired` and `RefreshFailed` enum values (which the controller cannot reliably distinguish — an IdP may revoke a token at any moment, and a 401 on an in-flight MCP call looks the same as a refresh-endpoint 401), the state machine has exactly three values: `Required | DiscoveryFailed | Authorized`. Every path out of `Authorized` collapses to `Required`.

To preserve observability — operators still need to know that something previously working has been rejected, not that discovery has only just finished — the controller emits a new Kubernetes `Warning` event with reason `TokenRejected` on the `Authorized → Required` transition. First-time transitions into `Required` (from empty or `DiscoveryFailed`) continue to emit the existing `AuthorizationRequired` event defined by `mcp-auth-detection`; `TokenRejected` is strictly the "something that used to work has stopped working" signal.

Event payload carries the observed `WWW-Authenticate` header (or a short summary of the refresh failure reason when the rollback is triggered by a refresh rather than an in-flight 401) so operators can see what the upstream said without tailing controller logs. The event MUST fire exactly once per transition — while the state remains `Required`, no duplicates are emitted.

**Alternative considered — keep `Expired` and `RefreshFailed` enum values**: Rejected. In practice the controller cannot cleanly separate "refresh endpoint said no" from "MCP server said no" from "IdP expired the token silently" — all three manifest as a 401 or a refresh 4xx and all three require the same remediation (caller repopulates the Secret). Carrying two extra enum values for states that collapse to the same operator action is premature granularity.

### Decision: Bearer header is injected dynamically by the controller, not materialised into `spec.headers`

Every reconcile resolves the Secret and constructs the per-request headers as `spec.headers ++ {Authorization: Bearer <access_token>}`. Nothing in the populate path writes to `spec.headers`. This keeps rotated tokens invisible to the user and avoids a write loop that would fight webhook mutations.

### Decision: Conflict between `spec.authorization` and `spec.headers[Authorization]` is rejected, not merged

Allowing both a `tokenSecretRef` and a static `Authorization` header to coexist creates an ambiguous request: which token reaches the MCP server depends on header-map iteration order or a "last writer wins" rule that users cannot reason about from the manifest. A silent override also risks leaking a stale static token if a future refactor changes precedence.

The conflict is rejected at two layers, defence-in-depth:

1. **Validating webhook (primary).** `spec.authorization != nil` AND any `spec.headers[i].name` equals `Authorization` case-insensitively (`strings.EqualFold`) denies admission. The error names the offending header index and both conflicting fields. This is textbook Kubernetes cross-field validation and matches existing Ark webhook prior art in `ark/internal/webhook/v1/`.

2. **Controller defence-in-depth.** If the clash reaches reconcile (webhook disabled, direct etcd write, upgrade race), the controller refuses to construct an MCP client, sets `Available=False` and `Discovering=False` with reason `AuthorizationHeaderConflict` (controller constant `MCPServerReasonAuthorizationHeaderConflict`, matching the existing style in `ark/internal/controller/mcpserver_controller.go`), emits a `Warning` event naming the offending header, leaves `status.authorization` untouched, and requeues on `pollInterval`. The resource self-heals once the user removes the header.

Users who want a static `Authorization` header can still do so by omitting `spec.authorization` entirely.

### Decision: Controller never creates the Secret

If the Secret referenced by `tokenSecretRef` does not exist, the controller sets `state: Required` and does not attempt a create. Keeping creation in Helm (or the caller) means there is exactly one creator, which keeps GitOps happy and keeps controller RBAC narrow (`update`/`patch` only, no `create`).

### Decision: Publish `status.authorization.expiresAt` on the CRD; no extra printcolumn

The controller SHALL publish `status.authorization.expiresAt` (optional `metav1.Time`) on every successful initial auth observation and every successful refresh, computed as `time.Now().UTC().Add(time.Duration(expires_in) * time.Second)` against the OAuth token response. On a rollback to `Required` (refresh failure, natural expiry, or 401-on-use), `expiresAt` is left untouched so operators can still see when the last good token was minted. When `status.authorization` is reset to absent (successful unauthenticated connection, or `spec.authorization` removed), `expiresAt` is cleared along with the rest of the subresource.

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
// +kubebuilder:validation:Enum=Required;DiscoveryFailed;Authorized
type MCPServerAuthorizationState string

const (
    MCPServerAuthorizationStateRequired        MCPServerAuthorizationState = "Required"
    MCPServerAuthorizationStateDiscoveryFailed MCPServerAuthorizationState = "DiscoveryFailed"
    MCPServerAuthorizationStateAuthorized      MCPServerAuthorizationState = "Authorized"
)
```

`MCPServerAuthorizationStatus` gains two optional fields:

```go
// LastRefreshed is the timestamp of the most recent successful token
// refresh (or initial token observation).
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

Shell (Helm-provisioned):

```
apiVersion: v1
kind: Secret
metadata:
  name: notion-mcp-token
  namespace: default
  labels:
    ark.mckinsey.com/mcpserver: notion-mcp
type: Opaque
# No data: or stringData: block — caller populates; controller rotates.
```

After an external actor populates it:

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
                           | emits AuthorizationRequired event
                           v
                +----------------------+     401 with no RFC9728
                |      Required        |-------------> DiscoveryFailed
                +----------+-----------+
                           ^  |
                           |  | caller populates Secret
                           |  | (out-of-band — out of scope here)
                           |  v
                           | +----------------------+
                           | |     Authorized       |
                           | +----------+-----------+
                           |            |
                           |   t < expiry-60s: ok, no-op
                           |            |
                           |   t >= expiry-60s:
                           |  +---------v----------+
                           |  |  refresh attempt   |
                           |  +--+--------------+--+
                           |     |              |
                           |     | success      | failure
                           |     v              |
                           |  stay Authorized   |
                           |                    |
                           |  ------------------+
                           |  rollback to Required
                           |  emits TokenRejected event (Warning)
                           |  tokens preserved in Secret
                           |
           Any time in Authorized:
             401 from MCP on next call ==> Required
             (emits TokenRejected event; tokens preserved;
              caller repopulates out-of-band)
```

The single `Authorized → Required` arrow above covers every failure mode: refresh 4xx, refresh network error, natural token expiry with no usable refresh token, and 401 on an in-flight MCP call (token revoked at IdP, client deleted, scope change). All of them emit the `TokenRejected` Warning event exactly once per transition.

### Controller refresh loop (per reconcile of an MCPServer with `spec.authorization` set)

```
    reconcile(mcpserver)
           |
           v
   +------------------+       no          +----------------------------+
   | Secret exists?   +------------------>| rollback to Required       |
   +--------+---------+                   | (if previously Authorized, |
            | yes                         |  emit TokenRejected event) |
            v                             +----------------------------+
   +------------------+      yes (no access_token key)
   | Secret populated?+-------------------> same rollback path
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
      |               +---- failure -----> rollback to Required
      |                                    (if prior state == Authorized,
      |                                     emit TokenRejected Warning)
      |                                    preserve tokens in Secret
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
   continue        rollback to Required
   tool sync       preserve tokens in Secret
                   emit TokenRejected Warning event
                     (WWW-Authenticate in message)
                   re-run RFC 9728 discovery
```

The "rollback to Required" step is a single routine responsible for: (a) setting `status.authorization.state = Required`, (b) clearing the injected Bearer header, (c) emitting `TokenRejected` exactly once if and only if the *previous* `status.authorization.state` was `Authorized`, and (d) re-running detection. It is called from every failure branch above, which is why the state machine collapses to three values cleanly.

### RBAC

Controller ServiceAccount needs, scoped to namespaces it already watches:

- `get`, `list`, `watch` on `secrets` — to read token Secrets referenced by `tokenSecretRef`.
- `update`, `patch` on `secrets` — to write refreshed tokens.

No `create` or `delete` on Secrets. The chart ships the Role/ClusterRole delta alongside the Secret template.

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

- **Secret deleted mid-life.** Next reconcile sees the Secret missing → state → `Required`, MCP client dropped. Caller repopulates. The MCPServer does NOT silently fall back to unauthenticated calls.
- **`refresh_token` rotation.** RFC 6749 §6 allows the token endpoint to return a new `refresh_token` alongside the new `access_token`. The controller overwrites both keys atomically in the Secret (single PATCH). If the new `refresh_token` key is absent in the response, the existing one is preserved.
- **IdP rotates or invalidates the client.** Token refresh returns `invalid_client`. State rolls back to `Required`; `TokenRejected` Warning event is emitted with the refresh-endpoint error as the message. The caller repopulates the Secret (fresh `client_id`/`client_secret` plus fresh `access_token` / `refresh_token`).
- **`helm uninstall`.** Removes the Secret (Helm owns it) along with MCPServer and associated resources. Tokens are gone. Clean.
- **Caller re-populates the Secret.** Next reconcile picks up the new `access_token` and moves to `Authorized`. No controller-side write loop because the controller only writes on refresh.
- **Token revoked at IdP.** MCP call returns 401. Controller transitions `Authorized → Required`, re-runs detection (the 401 + WWW-Authenticate path). Tokens remain in the Secret so there's an audit trail; caller repopulates.
- **Secret in a different namespace than the MCPServer.** Not supported. Validation webhook rejects (cross-namespace Secret references are a blast-radius risk).
- **Controller restart with expired token.** First reconcile after restart does a normal refresh attempt. If the refresh succeeds, no user-visible effect. If it fails, state rolls back to `Required`. Note that the `TokenRejected` event is only emitted if the in-memory previous state was `Authorized`; after a cold restart the controller reads the CRD and treats the persisted `status.authorization.state` as the "previous state" for this purpose, so a restart followed by a refresh failure still correctly emits `TokenRejected`.
- **Clock skew.** 60s refresh window gives enough headroom for reasonable clock drift between controller node and IdP. Not addressed further; extreme skew is an operational problem.

## Open Questions

- **Q1 (resolved):** Is an unauthenticated `AS` metadata probe acceptable inside the controller reconcile loop? Resolved in `mcp-auth-detection` — detection uses the existing per-reconcile poll, no new egress pattern.
- **Q2 (open):** Final shape of `TokenSecretRef` — single `name` + optional `keys` override vs. per-key `SecretKeySelector`. Current design uses the former for brevity; revisit if downstream consumers need per-key namespacing (e.g., access token and refresh token in different Secrets for blast-radius reasons).
