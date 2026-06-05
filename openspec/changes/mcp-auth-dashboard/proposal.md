## Why

The `mcp-auth-ark-api-orchestration` capability landed the full OAuth flow inside ark-api — `auth/start`, `auth/callback`, `auth/status`, `auth/logout` — and a thin CLI (`ark mcp auth login` / `logout`) over those endpoints. The endpoint contract was designed from the start to be consumed by a second client: the dashboard. That capability's own spec names this follow-up (`mcp-auth-dashboard`) and reserves two pieces of behaviour for it — the resolved-identity `authorized-by` annotation (see the orchestration spec's "Successful exchange annotates the MCPServer with caller identity" forward-compatibility scenario) and the inbound-auth-backed user identity those annotations carry.

Today a dashboard user who sees an MCP server in the `Required` state has no way to act on it from the UI — they must drop to a terminal and run the CLI. This change closes that gap: the MCP servers page surfaces the authorization state on each server card and exposes an **Authenticate** action that drives the same ark-api flow, plus a **Sign out** action that revokes it. The browser is redirected to the IdP, the IdP redirects back to ark-api's install-stable callback, and ark-api redirects the user back to the dashboard so the page can confirm completion. No token material ever touches the browser — the flow is identical to the CLI's from ark-api's perspective; only the client and the completion hand-off differ.

Because `auth/start` is an authenticated dashboard request (it carries the SSO identity already plumbed through ark-api's impersonation middleware), this change also realises the deferred `authorized-by` work: ark-api captures the caller's resolved identity at `start` time and stamps it on the MCPServer at exchange time, replacing the hard-coded `cli` string for dashboard-initiated flows.

## What Changes

### Architecture — redirect-based completion

```
[card] Authenticate (state=Required)
  → POST /api/v1/mcp-servers/{name}/auth/start   (authenticated XHR; carries SSO identity)
      body { redirect_on_complete: true }
      ← { auth_id, authorization_url, flow_expires_at }
  → full-page navigate to authorization_url
  → IdP login/consent
  → GET /api/v1/mcp/auth/callback?code=&state=    (unauthenticated browser GET from the IdP)
      ark-api: token exchange → Secret write → annotate authorized-by=<sso-identity>
  → 302 <ARK_API_DASHBOARD_URL>/mcp?authorized=<name>&namespace=<ns>   (success)
        or   …&auth_error=<oauth_error_code>                          (failure)
  → dashboard reads the query param, refetches the MCP server, polls
    status.authorization.state until Authorized, toasts, strips the query param
```

The OAuth callback is a plain browser GET initiated by the IdP redirect — it does **not** carry the dashboard's SSO bearer/impersonation headers. The caller identity must therefore be captured on the authenticated `auth/start` request and held in the in-flight cache entry until the callback writes it. ark-api already stores a cache entry per flow; this change records the resolved identity and a per-flow completion mode in it.

### ark-api extensions

These extend the existing orchestration endpoints; the contract additions are captured as ADDED requirements under the new `mcp-auth-dashboard` capability (the orchestration capability is not yet in the baseline specs, so there is nothing to MODIFY).

- **`POST /api/v1/mcp-servers/{name}/auth/start`** — body gains optional `redirect_on_complete?: bool` (default `false`, preserving the CLI's HTML-completion behaviour). When the request carries an authenticated identity (`request.state.user_identity` populated by the impersonation middleware), ark-api records that identity in the flow's cache entry. When no identity is present (CLI over the in-cluster Service, or impersonation disabled), it falls back to `cli`. The flag and the identity are stored on the cache entry alongside the existing PKCE/state material.

- **`GET /api/v1/mcp/auth/callback`** — on a flow whose cache entry has `redirect_on_complete: true` **and** when `ARK_API_DASHBOARD_URL` is configured, the endpoint SHALL respond `302` to `<ARK_API_DASHBOARD_URL>/mcp?authorized=<name>&namespace=<ns>` on success, or `…&auth_error=<oauth_error_code>` on IdP error, instead of rendering the HTML completion page. When `redirect_on_complete` is unset (CLI) or `ARK_API_DASHBOARD_URL` is not configured, the existing HTML page is rendered unchanged. The redirect target is constructed entirely from server-side configuration (`ARK_API_DASHBOARD_URL`) plus the MCPServer name/namespace held in the trusted cache entry — **no** client-supplied URL is echoed, so the redirect is not an open-redirect vector. The MCPServer name and namespace are URL-encoded; the `auth_error` value is taken from the OAuth `error` code (a constrained token) and URL-encoded.

- **`authorized-by` annotation** — on a successful exchange, ark-api writes the identity captured at `start` time to `ark.mckinsey.com/mcp-auth-authorized-by` (verbatim), replacing the hard-coded `cli`. CLI-initiated flows with no inbound identity continue to record `cli`. This realises the orchestration spec's forward-compatibility scenario.

- **MCPServer read surface** — `MCPServerResponse` and `MCPServerDetailResponse` gain an `authorization` object — `{ state, resourceName?, authorizedBy?, authorizedAt? }` — sourced from `status.authorization.state`, `status.authorization.resourceName`, and the two `mcp-auth-authorized-*` annotations. The list endpoint already returns `annotations`; adding the typed `authorization` block lets the dashboard render a state badge without parsing raw status or annotation strings. The field is omitted/null when `status.authorization` is absent.

### Configuration

- `ARK_API_DASHBOARD_URL` — base URL of the dashboard, used to build the post-callback redirect target. Validated at startup when set: must be a well-formed absolute `https://` URL (or an `http://` loopback host — `127.0.0.1`, `[::1]` bracketed per RFC 3986 §3.2.2, or `localhost` — matching the `ARK_API_PUBLIC_CALLBACK_URL` carve-out). When unset, dashboard-initiated flows fall back to the HTML completion page and the dashboard user returns to the tab manually; the dashboard's return-handling still works because it polls `status.authorization.state` rather than relying on the redirect.

### Dashboard

`services/ark-dashboard/` MCP servers page (`app/(dashboard)/mcp/`, `components/cards/mcp-server-card.tsx`):

- **State badge** — the card renders the authorization state from the new `authorization.state` field: `Required` (action needed), `Authorized` (with the authorized-by identity in a tooltip), `DiscoveryFailed` (error styling, no action). Servers with no `authorization` block render no auth badge.
- **Authenticate action** — shown when `state == Required`. Calls `POST /auth/start` with `redirect_on_complete: true`, then full-page navigates to the returned `authorization_url`. On a `4xx` other than a `force`-overridable preflight, surfaces a toast and stays on the page.
- **Return handling** — on load, the MCP page reads `?authorized=<name>` / `?auth_error=<code>` (using the existing namespaced-navigation conventions). On `authorized`, it refetches the server and polls `authorization.state` until `Authorized` (bounded, with a "finishing up" toast for the reconcile lag), then a success toast; on `auth_error`, an immediate error toast. Either way it strips the auth query params from the URL.
- **Sign out action** — shown when `state == Authorized`. Opens a confirmation dialog, then calls `POST /auth/logout` (default clear — empties tokens, leaves the Secret), toasts, and invalidates the MCP servers query so the card returns to `Required`.
- **Service + hooks** — `lib/services/mcp-servers.ts` gains `startAuth(name, opts)` and `logoutAuth(name, opts)`; `mcp-servers-hooks.ts` gains the corresponding `useMutation` wrappers with query invalidation, following the existing service/hook pattern.

### Trust boundary

This change does not alter the auth endpoints' trust model from `mcp-auth-ark-api-orchestration`: they sit behind ark-api's existing boundary (cluster-internal Service, optional authenticating gateway). It does newly **consume** the SSO identity that the impersonation middleware already resolves for authenticated requests, but it introduces no new inbound-auth requirement of its own — when no identity is present the flow degrades to the `cli` annotation exactly as today. Operators exposing ark-api beyond the cluster MUST front it with the same authenticating gateway as the rest of the API surface; `auth/logout` remains destructive to any reachable caller.

## Capabilities

### New Capabilities

- `mcp-auth-dashboard`: the dashboard MCP servers page surfaces per-server authorization state and exposes Authenticate / Sign out actions driving the ark-api OAuth flow via redirect-based completion. Includes the ark-api extensions that enable it — `redirect_on_complete` on `auth/start`, dashboard redirect on `auth/callback`, identity-aware `authorized-by`, and the `authorization` block on the MCPServer read surface.

### Modified Capabilities

None as a baseline delta. The `mcp-auth-ark-api-orchestration` capability is not yet archived into `openspec/specs/`, so its endpoints are extended in place; the additive behaviour (`redirect_on_complete`, dashboard redirect, resolved `authorized-by`) is owned by the new `mcp-auth-dashboard` capability and was explicitly reserved for it by the orchestration spec. The orchestration contract consumed unchanged otherwise.

## Impact

- **Scope:**
  - `services/ark-api/ark-api/src/ark_api/api/v1/mcp_auth.py` — `redirect_on_complete` handling on `start`, dashboard redirect on `callback`, identity capture.
  - `services/ark-api/ark-api/src/ark_api/api/v1/mcp_servers.py` + `models/mcp_servers.py` — `authorization` block on the response models.
  - `services/ark-api/ark-api/src/ark_api/core/` — `ARK_API_DASHBOARD_URL` config + validation.
  - `services/ark-dashboard/` — card badge, Authenticate/Sign out actions, return handling, service + hooks.
  - `docs/content/` — dashboard authenticate flow + the new env var.
- **CRD:** none. Consumes `spec.authorization.tokenSecretRef`, `status.authorization.*`, and the `mcp-auth-authorized-*` annotations unchanged.
- **RBAC:** none beyond `mcp-auth-ark-api-orchestration` (ark-api SA already gains Secret write there; identity capture reads request state, not the cluster).
- **Security:**
  - No token material reaches the browser; the redirect carries only the MCPServer name, namespace, and (on failure) an OAuth error code.
  - The post-callback redirect is built from server config + trusted cache values, never from a client-supplied return URL — not an open-redirect vector.
  - The resolved identity written to `authorized-by` is the same identity ark-api already uses for impersonation; it is opaque to consumers and displayed verbatim. Identity strings are still kept out of logs except where the orchestration spec already permits the annotation value.

## Non-Goals

- **Per-user tokens / multi-tenant MCP credentials** — out of scope, inherited from `mcp-auth-ark-api-orchestration`. `authorized-by` now carries the real user for dashboard flows but the model is still one shared Secret per MCPServer (last login wins). Per-user credential isolation remains owned by the future `mcp-auth-per-user-tokens` capability.
- **New inbound-auth contract on the auth endpoints** — out of scope. This change consumes the identity the existing impersonation middleware already resolves; it does not add authentication where there was none. Hardening ark-api's exposure remains an operator concern.
- **Token refresh** — Stage 2 (`mcp-auth-token-refresh`). The dashboard re-runs Authenticate until then, exactly as the CLI re-runs `login`.
- **SDK-side Bearer injection for external executors** — out of scope and pre-existing in `main`; owned by `mcp-auth-sdk-header-resolution`. A server authenticated from the dashboard still requires the documented `spec.headers[]` workaround for external executors (claude-agent-sdk, langchain) until that lands.
- **Multi-replica ark-api with a shared in-flight cache** — unchanged operational consideration from the orchestration change; the redirect-based completion adds no new replica affinity requirement beyond the existing `auth/callback` ↔ cache locality.
- **Surfacing every authorization sub-state** — the card renders `Required` / `Authorized` / `DiscoveryFailed`; transient pre-discovery states render no auth badge rather than inventing UI for them.
