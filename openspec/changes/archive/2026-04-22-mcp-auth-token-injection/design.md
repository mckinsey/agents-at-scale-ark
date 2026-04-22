## Context

`mcp-auth-detection` populates `status.authorization` when an MCP server returns 401 with RFC 9728 metadata. That is discovery only — there is no spec-side input, no token storage, and no mechanism to move `state` off `Required`. This change adds the minimum controller-side surface needed to consume and inject a caller-populated token, reach `Authorized`, and surface the signal when that token later stops working.

The design is scoped to **Stage 1**: one token per MCPServer, shared by all agents that reference it, populated by an external actor, consumed read-only by the controller. Refresh, webhook-level header-conflict rejection, and any write-back to the Secret are deferred to follow-up changes and are called out in Non-Goals.

The mechanism used to *populate* the Secret initially is out of scope. Callers — a future Ark CLI OAuth driver, a brokered `ark-api` endpoint, a Helm pre-install job, or a human running `kubectl edit secret` — write an `access_token` (and optionally `expires_at`, `refresh_token`, `client_id`, `client_secret`). The controller owns only Bearer injection, the `Required → Authorized` transition, `expiresAt` publication, and the `TokenRejected` event on rollback.

Relevant RFCs / specs used directly by the controller in Stage 1:

- RFC 9728 — OAuth Protected Resource Metadata (for 401 re-discovery after revocation, via `mcp-auth-detection`).
- MCP specification, 2025-06-18 revision — Authorization.

RFC 6749 §6 (refresh tokens) is relevant to Stage 2 and is not exercised by the controller in Stage 1.

## Goals / Non-Goals

**Goals (Stage 1):**
- Controller moves an `MCPServer` from `state: Required` to `state: Authorized` once an external actor populates the referenced Secret with a non-empty `access_token` and the controller can list tools with it.
- Token expiry timestamp is legible on the CRD (`status.authorization.expiresAt`) for dashboards that lack Secret read access.
- Coexists with existing `spec.headers` (static per-request headers like `X-Org-Id`).
- Works against `mcp.notion.com/mcp` end to end — the Notion MCP server is the trust anchor.
- Agnostic about who populates the Secret.
- When a previously-Authorized server starts returning 401, the controller rolls back to `Required` and emits a distinct `TokenRejected` Warning event so operators can tell "was broken" from "just stopped working".

**Non-Goals (deferred to follow-up changes):**
- Automatic token refresh (no RFC 6749 §6 refresh grant, no Secret write-back).
- Validating webhook rule rejecting `spec.authorization` + `spec.headers[Authorization]` clashes.
- Controller defence-in-depth detection of the same clash (no `AuthorizationHeaderConflict` condition reason in Stage 1).
- Write-level RBAC on Secrets (Stage 1 is read-only).
- Per-agent / per-user tokens.
- Any in-tree OAuth 2.1 + PKCE flow, DCR, loopback redirect, or browser dance.
- `ark-api` brokered OAuth endpoint, dashboard UI, device flow, RFC 7009 token revocation.
- Cross-namespace Secret references (not supported, not validated in Stage 1).
- Caching resource metadata across reconciles (existing detection behaviour is reused).

## Decisions

### Decision: Token lives in a Kubernetes Secret, referenced by `spec.authorization.tokenSecretRef`

Secrets are the K8s-native home for credentials. A single namespaced Secret per MCPServer keeps blast radius narrow and lets standard RBAC and encryption-at-rest (KMS, sealed-secrets, etc.) apply without Ark-specific machinery.

`tokenSecretRef` is `{ name: string, accessTokenKey?, refreshTokenKey?, expiresAtKey?, clientIDKey?, clientSecretKey? }` with per-key defaults matching the names an OAuth driver would naturally write (`access_token`, `refresh_token`, `expires_at`, `client_id`, `client_secret`). Only `accessTokenKey` and `expiresAtKey` are read by the controller in Stage 1; the refresh / client keys are part of the CRD contract so Stage 2 can consume them without a CRD break.

**Alternative considered — inline token on spec/status**: Rejected. Secrets must not live on CRDs; kubectl users would leak them in logs.

**Alternative considered — controller manages its own opaque store (etcd annotations, ConfigMap blob)**: Rejected. Not K8s-idiomatic, not GitOps-legible, breaks existing RBAC story for credential access.

### Decision: Controller never creates, updates, or deletes the Secret in Stage 1

Stage 1 consumes the Secret read-only. There is no refresh loop and therefore no write path. The caller (Helm chart, admin, Stage 2 CLI driver) is the sole writer.

This keeps the Stage 1 controller RBAC minimal — `get`, `list`, `watch` on `secrets` only — and forecloses any chance of the controller racing with GitOps tooling over Secret contents. Stage 2 will extend RBAC with `update`/`patch` when it adds the refresh loop.

**Alternative considered — ship `update`/`patch` RBAC in Stage 1 so Stage 2 does not require a follow-up RBAC bump**: Rejected. Granting unused permissions fails least-privilege review and muddies the Stage 1 security story.

### Decision: Bearer header is injected dynamically by the controller, not materialised into `spec.headers`

Every reconcile resolves the Secret and constructs the per-request headers as `spec.headers ++ {Authorization: Bearer <access_token>}`. Nothing writes to `spec.headers`. This keeps the token invisible to the user manifest and avoids a write loop.

### Decision: Single `TokenRejected` Warning event covers every `Authorized → Required` transition

The state machine has exactly three values: `Required | DiscoveryFailed | Authorized`. A 401 from the MCP server after reaching `Authorized` rolls the state back to `Required`; the controller cannot cleanly distinguish "token expired", "token revoked at IdP", and "scope changed" — all three surface as a 401 on an in-flight MCP call and all three require the same remediation (caller repopulates the Secret).

To preserve observability, the controller emits a new Kubernetes `Warning` event with reason `TokenRejected` on the `Authorized → Required` transition. First-time transitions into `Required` (from empty or `DiscoveryFailed`) continue to emit the existing `AuthorizationRequired` event defined by `mcp-auth-detection`; `TokenRejected` is strictly the "something that used to work has stopped working" signal.

Event payload includes the observed `WWW-Authenticate` header so operators can see what the upstream said without tailing controller logs. The event fires on the transition — if the state stays `Required` across subsequent reconciles, duplicates are not required by this spec (see the Requirement for the precise contract).

**Alternative considered — dedicated `Expired` and `RefreshFailed` enum values**: Rejected. In practice the controller cannot separate those signals; carrying enum values for states that collapse to the same operator action is premature granularity.

### Decision: Publish `status.authorization.expiresAt` on the CRD

The controller SHALL populate `status.authorization.expiresAt` (optional `metav1.Time`) whenever a reconcile reaches `Authorized`, parsed from the Secret's `expires_at` key (default; overridable via `expiresAtKey`). Missing or unparseable `expires_at` leaves `expiresAt` absent and logs a controller warning — it does NOT prevent the `Authorized` transition, because the access token itself is still usable.

On rollback from `Authorized` to `Required`, `expiresAt` is left untouched so operators can still see when the last good token was minted. When `status.authorization` is reset to absent, `expiresAt` is cleared along with the rest of the subresource.

Rationale:

1. **Cert-manager precedent.** `Certificate.status.notAfter` publishes the absolute expiry timestamp on the CR for exactly this `kubectl describe` use case.
2. **RBAC asymmetry.** Dashboard and observability consumers frequently have `get` on `mcpservers` but not on `secrets`. Publishing `expiresAt` on the CR lets them show token lifetime without widening credential access.
3. **Self-contained debugging.** `expiresAt` on the CR lets an operator reason about token lifetime from `kubectl describe mcpserver` alone.

**Non-goal — no dedicated printcolumn.** The existing `AUTH` printcolumn (state) from `mcp-auth-detection` remains the only kubectl column. `expiresAt` is reachable via `kubectl get mcpserver -o jsonpath` or `describe`.

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
    TokenSecretRef TokenSecretReference `json:"tokenSecretRef"`
}

type TokenSecretReference struct {
    // +kubebuilder:validation:Required
    Name string `json:"name"`

    // +kubebuilder:default="access_token"
    AccessTokenKey string `json:"accessTokenKey,omitempty"`
    // +kubebuilder:default="refresh_token"
    RefreshTokenKey string `json:"refreshTokenKey,omitempty"`
    // +kubebuilder:default="expires_at"
    ExpiresAtKey string `json:"expiresAtKey,omitempty"`
    // +kubebuilder:default="client_id"
    ClientIDKey string `json:"clientIDKey,omitempty"`
    // +kubebuilder:default="client_secret"
    ClientSecretKey string `json:"clientSecretKey,omitempty"`
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

`MCPServerAuthorizationStatus` gains one optional field:

```go
// ExpiresAt is the absolute time at which the current access_token
// expires, parsed from the token Secret's expires_at key. Published
// for dashboard / observability consumers that may have get on
// mcpservers but not on secrets.
// +kubebuilder:validation:Optional
ExpiresAt *metav1.Time `json:"expiresAt,omitempty"`
```

### State machine (Stage 1)

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
                           |  later MCP call returns 401
                           |  (token expired / revoked /
                           |   IdP rejected for any reason)
                           |            |
                           +------------+
                           rollback to Required
                           emits TokenRejected Warning event
                           (WWW-Authenticate quoted in message)
                           tokens left in Secret; caller repopulates
```

Stage 1 has exactly one arrow out of `Authorized`: back to `Required` via a 401 from the MCP server. There is no refresh loop, no pre-expiry action, and no clock-driven transition.

### Controller flow (per reconcile of an MCPServer with `spec.authorization` set)

```
    reconcile(mcpserver)
           |
           v
   +------------------+       no / empty        +-------------------------+
   | Secret resolves  +------------------------>|  fall through to normal |
   | with access_token?                         |  detection path (401 -> |
   +--------+---------+                         |  Required / DiscoveryFailed)
            | yes                               +-------------------------+
            v
   build MCP client with
   spec.headers ++ {Authorization: Bearer <access_token>}
           |
           v
   +--------------------+
   | tool-list returns? |
   +--+----------------++
      | success        | 401 with WWW-Authenticate
      v                v
   state=Authorized    handleAuthorizationRequired:
   publish expiresAt       if prior state == Authorized:
   (parsed from Secret)        emit TokenRejected Warning
                           set state=Required
                           re-run RFC 9728 detection
```

### RBAC (Stage 1)

Controller ServiceAccount, scoped to namespaces it already watches:

- `get`, `list`, `watch` on `secrets`.

No `create`, `update`, `patch`, or `delete` on Secrets in Stage 1. Stage 2 (refresh) will propose the RBAC bump.

### Coexistence with `spec.headers`

`spec.headers` remains supported unchanged. The controller builds the final header map as:

```
final := resolveSpecHeaders(mcpserver.Spec.Headers)
if spec.authorization is set AND Secret has access_token:
    final["Authorization"] = "Bearer " + accessToken
```

If a user sets both `spec.authorization` and a literal `Authorization` entry in `spec.headers`, the Bearer from the Secret wins via last-write in the header map. Stage 1 does not explicitly validate or reject this case; the follow-up webhook change will.

## Edge cases (Stage 1)

- **Secret deleted mid-life.** Next reconcile sees the Secret missing → the Bearer header is not injected → the MCP server returns 401 → detection path runs. If the prior state was `Authorized`, a `TokenRejected` event is emitted.
- **Secret exists but `access_token` key is empty or missing.** Same as above: no Bearer injected, 401 from upstream, detection path runs.
- **`expires_at` key missing or unparseable.** `status.authorization.expiresAt` is left absent; a controller log line notes the skip. `Authorized` transition still happens because the `access_token` is still usable.
- **Controller restart with a valid token in the Secret.** First reconcile after restart resolves the Secret, injects Bearer, tool-list succeeds, transitions to `Authorized`. No `TokenRejected` is emitted because the in-CRD prior state is read from status.
- **Token revoked at IdP.** MCP call returns 401. Controller rolls state back to `Required`, re-runs detection, emits `TokenRejected` with the `WWW-Authenticate` header in the event message. The Secret is left untouched (controller has no write RBAC anyway).
- **Secret in a different namespace than the MCPServer.** Not supported; the controller looks up the Secret by `tokenSecretRef.name` in the MCPServer's own namespace. Stage 1 does not add a webhook validation for this; it is a Stage 2+ concern.

## Open Questions

- **Q1 (resolved):** Is an unauthenticated `AS` metadata probe acceptable inside the controller reconcile loop? Resolved in `mcp-auth-detection`.
- **Q2 (deferred to Stage 2):** Final shape of refresh-loop behaviour — RBAC bump, `client_secret` confidentiality, handling of `refresh_token` rotation. Addressed by the follow-up change.
