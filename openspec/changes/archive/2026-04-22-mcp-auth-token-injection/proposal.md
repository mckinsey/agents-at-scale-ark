## Why

`mcp-auth-detection` gets Ark as far as detecting that a remote MCP server needs OAuth and surfacing `status.authorization.state = Required`. Nothing then closes the loop on the controller side: once an external actor has produced OAuth tokens out-of-band, the CRD offers no place to point the controller at them, and the controller has no injection path. Agents cannot call `mcp.notion.com/mcp` or any other OAuth-protected MCP server end to end.

This change delivers **Stage 1** of that loop: a `spec.authorization.tokenSecretRef` field, a controller-side Secret resolver that injects `Authorization: Bearer <access_token>` on each MCP call, a successful `Required → Authorized` transition once tool listing succeeds with the injected token, and a `TokenRejected` Warning event when the upstream subsequently rejects a previously-working token.

The mechanism used to *obtain* the initial tokens, token refresh, and webhook-level header conflict rejection are deliberately deferred — see Non-Goals. This change only specifies the minimum contract needed to take a caller-populated token from a Secret to a working `Authorized` state.

## What Changes

- `MCPServer` CRD gains `spec.authorization.tokenSecretRef` — a reference to a namespaced Secret with defaulted key names (`access_token`, `refresh_token`, `expires_at`, `client_id`, `client_secret`).
- `MCPServerAuthorizationState` enum extended with a single new value: `Authorized`. The complete enum is `Required | DiscoveryFailed | Authorized`. No dedicated failure states — any IdP-side rejection of a previously-Authorized token collapses back to `Required`.
- `status.authorization.expiresAt` published from the Secret's `expires_at` key on every successful connect so dashboards and `kubectl describe` can see token lifetime without access to the Secret.
- Controller reads the referenced Secret on each reconcile, merges `Authorization: Bearer <access_token>` with the existing `spec.headers`, and constructs the MCP client.
- On a successful tool-list with the injected token, controller transitions `Required → Authorized`, publishes `expiresAt`, and sets `Available=True` with reason `Authorized`.
- On HTTP 401 from the MCP server when the prior state was `Authorized` (token expiry, revocation, any IdP rejection), controller transitions back to `Required` AND emits a Kubernetes `Warning` event with reason `TokenRejected` whose message quotes the observed `WWW-Authenticate` header. First-time 401s (prior state not `Authorized`) continue to emit the existing `AuthorizationRequired` event from `mcp-auth-detection`.
- An empty or missing Secret falls through to the existing 401 discovery path — no regression against `mcp-auth-detection`.
- Secret lifecycle remains caller-provisioned (Helm, admin, out-of-band tool). The controller never creates, updates, or deletes Secrets in Stage 1; it only reads them.
- Controller RBAC gains `get`, `list`, `watch` on `secrets`. No `create`, `update`, `patch`, or `delete`.

## Capabilities

### New Capabilities
- `mcp-auth-token-injection`: the CRD field, controller resolver, Bearer injection, `Authorized` state transition, `TokenRejected` event, and read-only Secret RBAC that together turn a populated token Secret into a working `Authorized` MCPServer.

### Modified Capabilities
- `mcp-auth-detection`: enum widened with one additional value, `Authorized`. Detection behaviour is unchanged.

## Impact

- `ark/api/v1alpha1/mcpserver_types.go` — `MCPServerSpec.Authorization`, `TokenSecretReference`, enum `Authorized`, `status.authorization.expiresAt`.
- `ark/internal/controller/mcpserver_controller.go` — Secret resolution, Bearer header injection, `Authorized` transition, `TokenRejected` event on `Authorized → Required`, `expiresAt` publication.
- `ark/internal/mcp/` — accept Bearer header alongside existing headers.
- `ark/chart/templates/` — RBAC additions (read-only on Secrets).
- No changes to `ark-cli`, `ark-api`, dashboard, samples, or the webhook package.

## Non-Goals

Explicitly out of scope for this change. Each is tracked as a follow-up:

- **Automatic token refresh.** No controller-side refresh loop, no `grant_type=refresh_token` call, no rotation of the Secret's keys before expiry. Follow-up PR.
- **Webhook rejection of `spec.authorization` + `spec.headers[Authorization]` conflict.** No validating webhook rule for this clash in Stage 1. Follow-up PR.
- **Controller defence-in-depth detection of the same header conflict.** No `AuthorizationHeaderConflict` condition reason, no controller-side guard against a manifest that sets both. Follow-up PR.
- **Write RBAC on Secrets.** The controller never writes tokens in Stage 1, so `update`, `patch`, `create`, and `delete` on `secrets` are explicitly not granted.
- **Ark CLI OAuth driver, `ark-api` brokered OAuth, dashboard UI for OAuth, device flow, RFC 7009 token revocation, RFC 7591 Dynamic Client Registration** — all remain out of scope as they were originally.
- **Per-agent / per-user tokens.** Fork 1B+.
- **Cross-namespace `tokenSecretRef`.** Not supported and not explicitly validated in Stage 1; the Secret is looked up in the MCPServer's own namespace.
