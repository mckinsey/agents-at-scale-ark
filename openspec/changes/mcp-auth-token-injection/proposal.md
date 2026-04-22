## Why

`mcp-auth-detection` gets Ark as far as detecting that a remote MCP server needs OAuth and surfacing `status.authorization.state = Required`. Nothing then closes the loop on the controller side: once an external actor has produced OAuth tokens out-of-band, the CRD offers no place to point the controller at them, and the controller has no injection or refresh path. Agents cannot call `mcp.notion.com/mcp` or any other OAuth-protected MCP server end to end.

This change closes the controller-side loop from `Required` to `Authorized`. It adds a `spec.authorization.tokenSecretRef` field, a controller-side Secret resolver that injects `Authorization: Bearer <access_token>` on every MCP call, a refresh loop that rotates tokens before expiry, and the webhook/RBAC scaffolding needed to make the contract safe.

The mechanism used to *obtain* the initial tokens (a future Ark CLI OAuth dance, a brokered ark-api endpoint, a Helm pre-install hook, a human pasting values into `kubectl edit secret`) is deliberately out of scope — separate follow-up changes own those drivers. This change only specifies the contract between whoever populates the Secret and the controller that consumes it.

## What Changes

- `MCPServer` CRD gains `spec.authorization.tokenSecretRef` — a reference to a namespaced Secret with defaulted keys (`access_token`, `refresh_token`, `expires_at`, `client_id`, `client_secret`).
- `MCPServerAuthorizationState` enum extended with `Authorized`, `Expired`, `RefreshFailed`.
- `status.authorization.expiresAt` published alongside the existing `lastRefreshed` field.
- Controller reads the referenced Secret on each reconcile, injects a Bearer header alongside existing `spec.headers`, refreshes the access token when within 60s of expiry, writes rotated tokens back to the Secret, and transitions state on success/failure/revocation.
- Validating webhook rejects manifests where `spec.authorization` is set AND `spec.headers[Authorization]` is present (case-insensitive). Controller re-checks as defence-in-depth.
- Helm chart ships a Secret shell template (empty — no `data:` or `stringData:` block) so GitOps controllers do not prune controller-written keys. No OwnerReference from controller to Secret.
- Controller RBAC gains `get`/`list`/`watch`/`update`/`patch` on Secrets in watched namespaces; no `create` or `delete`.

## Capabilities

### New Capabilities
- `mcp-auth-token-injection`: CRD, controller, webhook, RBAC, and Helm changes that let the controller consume an externally-populated token Secret and drive refresh + injection going forward.

### Modified Capabilities
- `mcp-auth-detection`: enum widened to include `Authorized | Expired | RefreshFailed`. Detection behaviour is unchanged.

## Impact

- `ark/api/v1alpha1/mcpserver_types.go` — `MCPServerSpec.Authorization` subresource, `TokenSecretRef`; enum additions; `status.authorization.expiresAt`.
- `ark/internal/controller/mcpserver_controller.go` — Secret resolution, token refresh loop, header injection, state transitions, conflict guard.
- `ark/internal/mcp/` — helper for injecting Bearer header into `createMCPClient` flow.
- `ark/internal/webhook/v1/` — `spec.authorization` + `spec.headers[Authorization]` conflict rejection; cross-namespace Secret reference rejection.
- `ark/chart/templates/` — Helm-managed Secret shell template, RBAC additions (`get`, `list`, `watch`, `update`, `patch` on Secrets).
- `docs/` — operator reference describing the Secret contract (keys, lifecycle, who writes what).
- No changes to `ark-cli`, `ark-api`, dashboard, or existing sample agents.

## Non-Goals

- `ark mcp auth` CLI or any other in-tree OAuth 2.1 + PKCE driver that populates the Secret (follow-up change).
- `ark-api` brokered OAuth endpoint (follow-up change).
- Per-agent or per-user tokens (Fork 1B+ / deferred).
- Dashboard UI for OAuth (deferred — the CRD contract is the stable surface).
- OAuth 2.0 Device Authorization Grant (RFC 8628).
- Token revocation on CRD delete (RFC 7009) — deferred; user revokes at the IdP.
- RFC 7591 Dynamic Client Registration — a concern of the token-populating driver, not the controller.
