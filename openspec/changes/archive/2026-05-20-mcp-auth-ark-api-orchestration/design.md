## Context

Ark's MCP integration already handles discovery (`mcp-auth-detection`) and token injection (`mcp-auth-token-injection`). The missing piece is the orchestration step: obtaining tokens in the first place via Dynamic Client Registration, PKCE, and token exchange. Previously operators scripted this out-of-band or copy-pasted tokens from other tools.

This change closes the loop by placing the full OAuth 2.1 flow inside **ark-api**. ark-api is the natural host because it already holds cluster credentials (ServiceAccount), serves as the stable HTTP facade for CLI and dashboard clients, and is the only component reachable from both inside the cluster (for token writing) and from the operator's browser (for the callback redirect).

Current state at the start of this change:
- `MCPServer.status.authorization.state` can be `Required`, `Authorized`, `DiscoveryFailed`
- `MCPServer.spec.authorization.tokenSecretRef` identifies the Secret the controller reads for injection
- ark-api has no OAuth flow machinery; no existing PKCE, DCR, or token-exchange code

63 of 68 tasks are complete. The remaining work is task 11.4 (external-executor workaround doc) and tasks 12.1–12.4 (auto-provisioning of `tokenSecretRef` on `auth/start`).

## Goals / Non-Goals

**Goals:**
- ark-api hosts the entire OAuth 2.1 flow (DCR + PKCE S256 + token exchange + Secret write) so no token material ever crosses to CLI or dashboard
- CLI gains `ark mcp auth login` / `ark mcp auth logout` as a thin client over four new ark-api endpoints
- `auth/status` reports `authorized` only when the MCPServer has also reconciled to `Authorized` — the CLI exits when the system is actually ready
- `auth/start` auto-provisions `spec.authorization.tokenSecretRef` when the operator has not set it, removing a friction point that was previously a hard 422

**Non-Goals:**
- Dashboard MCP authorize flow (`mcp-auth-dashboard` follow-up)
- Per-user tokens / multi-tenant MCP credentials
- SDK-side Bearer injection for external executors (`mcp-auth-sdk-header-resolution` follow-up)
- Token refresh (`mcp-auth-token-refresh` Stage 2)
- Multi-replica ark-api with shared in-flight cache

## Decisions

### ark-api as the OAuth host (not the controller)

The controller is a reconcile loop that drives cluster state toward a desired spec. Injecting a browser-redirect flow into a reconcile loop would violate the controller contract and make flow state unobservable. ark-api is already the correct entry point for interactive operations: it is reachable from CLIs, proxied through `ArkApiProxy`, and holds the ServiceAccount needed to write Secrets.

Alternative considered: a dedicated OAuth service. Rejected because ark-api already handles every other MCPServer operation and adding a service just for auth would fragment the client surface.

### In-memory TTL cache (not persistent)

The in-flight state (`verifier`, `state`, `client_id`, `client_secret`, `auth_id` → MCPServer ref) is transient: it only lives during the browser redirect round-trip (default 10 minutes). A persistent store would add an operational dependency with no benefit for the single-replica case, and the multi-replica case is explicitly out of scope. If a pod restarts during a flow, the user re-runs `auth login`; this is acceptable for a 10-minute window.

The cache addresses entries by two keys: `state` (for the IdP callback) and `auth_id` (for `auth/status` polls). On callback, the `state` index is deleted immediately to prevent code replay; the `auth_id` index persists until TTL so repeat `auth/status` polls see a consistent terminal state.

### Single callback endpoint, not per-server

`GET /api/v1/mcp/auth/callback` has no `{name}` path segment. The MCPServer identity is recovered from the cache entry keyed on `state`. This is required because the redirect URI registered at DCR time must be stable across MCPServers — registering a per-server URI would require registering a different client for each server, but the endpoint registered must be the one the IdP actually redirects to. A single stable URI simplifies DCR and is the standard MCP authorization server pattern.

### Confidential clients only (no `none` auth method)

Every MCP authorization server targeted (Notion, GitHub, Atlassian) issues confidential clients. Public-client support adds complexity and widens the attack surface with no current use case. Responses with `token_endpoint_auth_method=none` or anything other than `client_secret_basic` are rejected at DCR time with HTTP 502.

### `auth/status` dual-condition for `authorized`

`auth/status` returns `authorized` only when both the cache entry has the `authorized` state AND the MCPServer's `status.authorization.state` has reconciled to `Authorized`. This prevents a race where ark-api has written the Secret but the controller has not yet picked it up — the CLI exits only when the tool-injection path is also live.

### Auto-provision `tokenSecretRef` on `auth/start`

Earlier drafts refused `auth/start` with HTTP 422 when `spec.authorization.tokenSecretRef.name` was unset. The unset field is an internal plumbing detail the user has no reason to know about: invoking `auth login` on an MCPServer is unambiguous OAuth intent. ark-api bootstraps the Secret (`<server>-oauth`) and patches the spec before continuing, matching the pattern where the platform provisions what it can infer. Operators using GitOps with a pre-authored `tokenSecretRef.name` never enter this branch; conflict detection (an existing Secret without the binding label) returns 422 with actionable guidance.

### `authorized-by` annotation stamps `cli` not user identity

ark-api's in-cluster Service path carries no inbound authentication in this change. End-user identity from an authenticated bearer token is owned by the `mcp-auth-dashboard` capability, which will add the inbound auth middleware. Stamping `cli` as an opaque marker now makes the annotation present and readable without claiming richer semantics the platform cannot yet provide.

### Loopback carve-out for `ARK_API_PUBLIC_CALLBACK_URL`

RFC 8252 §7.3 explicitly permits loopback redirect URIs for native apps. An air-gapped operator using `kubectl port-forward` to reach ark-api from their laptop browser falls into this category. IPv4 (`127.0.0.1`) and IPv6 (`[::1]`) are both accepted; unbracketed IPv6 literals are rejected per RFC 3986 §3.2.2 to prevent URL parsing ambiguity. All other non-HTTPS URLs are rejected.

## Risks / Trade-offs

**In-memory cache is lost on pod restart** → Impact: any in-flight `auth/start` flow is dropped. Mitigation: short TTL (10 minutes) means re-running `auth login` is the only recovery step; this is documented and acceptable for the single-operator use case.

**Shared-token model: last login wins** → Impact: in multi-user clusters, a second `auth login` overwrites the first user's tokens. Mitigation: `authorized-by` / `authorized-at` annotations surface the most recent login without fixing the race. The `mcp-auth-per-user-tokens` follow-up owns the structural fix.

**Single callback URL registered at DCR time** → Impact: if `ARK_API_PUBLIC_CALLBACK_URL` changes after DCR, existing `client_id` / `client_secret` are invalid because the registered `redirect_uri` no longer matches. Mitigation: `force_registration: true` triggers a fresh DCR; the old client registration is abandoned at the IdP (most IdPs expire unused clients eventually).

**External executor header gap (pre-existing)** → Impact: agents using claude-agent-sdk or LangChain will 401 on tool invocation after `auth login` because `_resolve_mcp_server()` reads only `spec.headers[]`, not `spec.authorization`. Mitigation: operator workaround (redundant `spec.headers[]` entry) documented in task 11.4; structural fix owned by `mcp-auth-sdk-header-resolution`.

**HTML injection via IdP-supplied error strings** → The callback renders IdP `error` / `error_description` in HTML. Mitigation: every IdP-supplied string is HTML-escaped before interpolation; the escaping requirement is enforced by a dedicated test (task 7.10).

## Migration Plan

No CRD changes. No controller changes. The change adds endpoints and RBAC.

Deploy order:
1. Apply the updated RBAC chart (ark-api SA gains Secret `get/create/patch/update/delete`).
2. Deploy the updated ark-api image with the four new endpoints and the `ARK_API_PUBLIC_CALLBACK_URL` env var set.
3. Optionally update the CLI binary; the new `ark mcp auth` commands are unavailable until the CLI is updated, but the endpoints are harmlessly present before.

Rollback: roll back the ark-api image. The RBAC additions are additive and harmless to leave in place. Any in-flight flows are dropped (cache is in-memory). Secrets already written by ark-api remain; the controller continues to inject tokens from them unchanged — the token-injection path is independent of the orchestration layer.

## Open Questions

None blocking the remaining tasks (11.4, 12.1–12.4). The auto-provisioning design is fully specified in the requirements added to the spec by the `ff4e1f16` commit.
