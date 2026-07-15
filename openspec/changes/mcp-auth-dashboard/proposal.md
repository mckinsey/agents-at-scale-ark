## Why

The `mcp-auth-ark-api-orchestration` capability landed the full OAuth flow inside ark-api — `auth/start`, `auth/callback`, `auth/status`, `auth/logout` — and a thin CLI (`ark mcp auth login` / `logout`) over those endpoints. The endpoint contract was designed from the start to be consumed by a second client: the dashboard. That capability's own spec names this follow-up (`mcp-auth-dashboard`) and reserves two pieces of behaviour for it — the resolved-identity `authorized-by` annotation (see the orchestration spec's "Successful exchange annotates the MCPServer with caller identity" forward-compatibility scenario) and the inbound-auth-backed user identity those annotations carry.

Today a dashboard user who sees an MCP server in the `Required` state has no way to act on it from the UI — they must drop to a terminal and run the CLI. This change closes that gap: the MCP servers page surfaces the authorization state on each server card and exposes an **Authenticate** action that drives the same ark-api flow, a **Re-authenticate** action for refreshing or replacing an expiring authorization, and a **Sign out** action that revokes it. The browser is redirected to the IdP, the IdP redirects back to ark-api's install-stable callback, and ark-api redirects the user back to the dashboard carrying the flow's `auth_id` so the page can confirm completion against the same `auth/status` endpoint the CLI uses. No token material ever touches the browser.

Because `auth/start` is an authenticated dashboard request (it carries the SSO identity already plumbed through ark-api's impersonation middleware), this change also realises the deferred `authorized-by` work: ark-api captures the caller's resolved identity at `start` time and stamps it on the MCPServer at exchange time, replacing the hard-coded `cli` string for dashboard-initiated flows.

## What Changes

### Architecture — redirect-based completion with auth/status confirmation

```
[card] Authenticate (Required)  /  Re-authenticate (Authorized, force:true)
  → POST /api/v1/mcp-servers/{name}/auth/start   (authenticated XHR; carries SSO identity)
      body { redirect_on_complete: true, force? }
      ← { auth_id, authorization_url, flow_expires_at }
  → full-page navigate to authorization_url
  → IdP login/consent
  → GET /api/v1/mcp/auth/callback?code=&state=    (unauthenticated browser GET from the IdP)
      ark-api: token exchange → Secret write → annotate authorized-by=<sso-identity>
  → 302 <ARK_API_DASHBOARD_URL>/mcp?authorized=<name>&namespace=<ns>&auth_id=<auth_id>   (success)
        IdP error OR token-exchange failure → …&auth_error=<code>&auth_error_desc=<text>
        cache miss (expired/replayed state) → /mcp?auth_error=expired  (no name/auth_id)
  → dashboard reads the query params:
        auth_error present → error toast (uses auth_error_desc; 'expired' special-cased)
        else poll GET /auth/status?auth_id=&namespace=  until pending→authorized|failed|expired
        strip the auth query params from the URL
```

The OAuth callback is a plain browser GET initiated by the IdP redirect — it does **not** carry the dashboard's SSO bearer/impersonation headers. The caller identity must therefore be captured on the authenticated `auth/start` request and held in the in-flight cache entry until the callback writes it. ark-api already stores a cache entry per flow; this change records the resolved identity, the `redirect_on_complete` flag, and reuses the existing `auth_id` to let the dashboard poll completion exactly as the CLI does — `auth/status` returns `authorized` only after both the token exchange and the controller's reconcile to `status.authorization.state == Authorized`, so the dashboard gets a crisp terminal signal (`authorized` / `failed` / `expired`) rather than guessing from a timeout.

### ark-api extensions

These extend the existing orchestration endpoints. The `mcp-auth-ark-api-orchestration` capability is now archived into the baseline specs, but the contract additions here are net-new behaviour the orchestration spec explicitly reserved for `mcp-auth-dashboard`, so they are captured as ADDED requirements under the new capability rather than as MODIFY deltas against the orchestration endpoints.

- **`POST /api/v1/mcp-servers/{name}/auth/start`** — body gains optional `redirect_on_complete?: bool` (default `false`, preserving the CLI's HTML-completion behaviour). The existing `force?: bool` (already defined by the orchestration capability) is used by the dashboard's **Re-authenticate** action to start a flow against an `Authorized` server. When the request carries an authenticated identity (`request.state.user_identity` populated by the impersonation middleware), ark-api records that identity in the flow's cache entry; otherwise it falls back to `cli`. The flag and identity are stored on the cache entry alongside the existing PKCE/state material.

- **`GET /api/v1/mcp/auth/callback`** — completion behaviour for dashboard-initiated flows (`redirect_on_complete: true`) when `ARK_API_DASHBOARD_URL` is configured:
  - **Success** → `302` to `<ARK_API_DASHBOARD_URL>/mcp?authorized=<name>&namespace=<ns>&auth_id=<auth_id>`.
  - **IdP error or token-exchange failure** → `302` to the same path with `&auth_error=<code>&auth_error_desc=<text>` instead of `auth_id`. `auth_error` is the OAuth error code (or a stable `token_exchange_failed` token); `auth_error_desc` is the IdP-supplied description, **truncated to 200 characters then URL-encoded**.
  - **Cache miss** (unknown/expired/replayed `state`, so ark-api cannot tell whether the flow was CLI or dashboard) → if `ARK_API_DASHBOARD_URL` is configured, `302` to `<ARK_API_DASHBOARD_URL>/mcp?auth_error=expired` (no server name or `auth_id` — neither is known on a miss); otherwise the existing HTML 400 page. A CLI-opened browser tab that ages out will also bounce to the dashboard in this case — harmless, and documented.
  - When `redirect_on_complete` is false/absent, or `ARK_API_DASHBOARD_URL` is unset, the existing HTML completion/error page is rendered unchanged (graceful fallback).
  - The redirect target's host and path are constructed entirely from `ARK_API_DASHBOARD_URL` plus the MCPServer name/namespace held in the trusted cache entry — **no** client-supplied URL is echoed, so the redirect is not an open-redirect vector. The name, namespace, `auth_id`, and `auth_error*` values are URL-encoded.

- **`authorized-by` annotation** — on a successful exchange, ark-api writes the identity captured at `start` time to `ark.mckinsey.com/mcp-auth-authorized-by` (verbatim), replacing the hard-coded `cli`. CLI-initiated flows with no inbound identity continue to record `cli`.

- **MCPServer read surface** — `MCPServerResponse` and `MCPServerDetailResponse` gain an `authorization` object — `{ state, resourceName?, authorizedBy?, authorizedAt?, expiresAt? }` — sourced from `status.authorization.state`, `status.authorization.resourceName`, `status.authorization.expiresAt`, and the two `mcp-auth-authorized-*` annotations. The list endpoint already returns `annotations`; adding the typed block lets the dashboard render a state badge and an expiry indication without parsing raw status or annotation strings. The field is omitted/null when `status.authorization` is absent.

### Configuration

- `ARK_API_DASHBOARD_URL` — base URL of the dashboard used to build the post-callback redirect. The redirect target is `<ARK_API_DASHBOARD_URL>/mcp?…`, so the value MUST include any path prefix under which the dashboard is served (e.g. `https://ark.example.com/dashboard`) — relevant to deployments behind an `X-Forwarded-Prefix`. Validated at startup when set: a well-formed absolute `https://` URL, or an `http://` loopback host (`127.0.0.1`, `[::1]` bracketed per RFC 3986 §3.2.2, `localhost`) matching the `ARK_API_PUBLIC_CALLBACK_URL` carve-out. When unset, dashboard-initiated flows fall back to the HTML completion page.

### Dashboard

`services/ark-dashboard/ark-dashboard/` MCP servers page (`app/(dashboard)/mcp/`, `components/cards/mcp-server-card.tsx`):

- **State badge** — rendered from `authorization.state`: `Required` (action needed), `Authorized` (with `authorizedBy` on hover/detail and an `expiresAt`-derived indication, flagged when near expiry), `DiscoveryFailed` (error styling, no action). Servers with no `authorization` block render no auth badge.
- **Authenticate action** — shown when `state == Required`. Calls `POST /auth/start` with `redirect_on_complete: true` and the card's namespace, then full-page navigates to `authorization_url`. Error toast + no navigation on a non-2xx.
- **Re-authenticate action** — shown when `state == Authorized` (and surfaced more prominently when near expiry). Identical to Authenticate but adds `force: true` so `auth/start` accepts the already-`Authorized` server. Refreshes the shared token (last login wins).
- **Completion handling** — on loading `/mcp` with auth query params: if `auth_error` is present, show an error toast (using `auth_error_desc`, with `expired` special-cased to a "flow expired, try again" message); otherwise poll `GET /auth/status?auth_id=<auth_id>&namespace=<ns>` until a terminal `authorized` (success toast), `failed` (error toast with the message), or `expired` (expired toast), with a bounded wait while `pending`. In all cases strip the consumed auth query params (`authorized`, `auth_id`, `auth_error`, `auth_error_desc`, `namespace` if added by the redirect) so a refresh does not re-trigger the handler.
- **Sign out action** — shown when `state == Authorized`. Opens a confirmation dialog, then calls `POST /auth/logout` (default clear) and the card's namespace; toasts and invalidates the MCP servers query so the card returns to `Required`.
- **Service + hooks** — `lib/services/mcp-servers.ts` gains `startAuth(name, { namespace, force? })` and `logoutAuth(name, { namespace })`; `mcp-servers-hooks.ts` gains the corresponding `useMutation` wrappers with query invalidation, following the existing service/hook pattern.

### Trust boundary

This change does not alter the auth endpoints' trust model from `mcp-auth-ark-api-orchestration`: they sit behind ark-api's existing boundary (cluster-internal Service, optional authenticating gateway). It newly **consumes** the SSO identity the impersonation middleware already resolves for authenticated requests, but introduces no new inbound-auth requirement of its own — when no identity is present the flow degrades to the `cli` annotation exactly as today. Operators exposing ark-api beyond the cluster MUST front it with the same authenticating gateway as the rest of the API surface; `auth/logout` remains destructive to any reachable caller.

## Capabilities

### New Capabilities

- `mcp-auth-dashboard`: the dashboard MCP servers page surfaces per-server authorization state and exposes Authenticate / Re-authenticate / Sign out actions driving the ark-api OAuth flow via redirect-based completion confirmed against `auth/status`. Includes the ark-api extensions that enable it — `redirect_on_complete` on `auth/start`, dashboard redirect (with `auth_id` / `auth_error` / expired-on-cache-miss) on `auth/callback`, identity-aware `authorized-by`, and the `authorization` block (incl. `expiresAt`) on the MCPServer read surface.

### Modified Capabilities

None as a baseline delta. The `mcp-auth-ark-api-orchestration` capability is now archived into `openspec/specs/`, but the additive behaviour was explicitly reserved for `mcp-auth-dashboard` by the orchestration spec, so it is owned by the new capability rather than extending the orchestration endpoints via MODIFY deltas. The orchestration contract is consumed unchanged otherwise (including the existing `force` flag and the `auth/status` terminal-state semantics).

## Impact

- **Scope:**
  - `services/ark-api/ark-api/src/ark_api/api/v1/mcp_auth.py` — `redirect_on_complete` + identity capture on `start`; dashboard redirect (success/error/cache-miss) on `callback`.
  - `services/ark-api/ark-api/src/ark_api/api/v1/mcp_servers.py` + `models/mcp_servers.py` — `authorization` block (incl. `expiresAt`) on the response models.
  - `services/ark-api/ark-api/src/ark_api/core/` — `ARK_API_DASHBOARD_URL` config + validation.
  - `services/ark-dashboard/` — card badge, Authenticate/Re-authenticate/Sign out actions, completion handling, service + hooks.
  - `docs/content/` — dashboard authenticate flow + the new env var.
- **CRD:** none. Consumes `spec.authorization.tokenSecretRef`, `status.authorization.*`, and the `mcp-auth-authorized-*` annotations unchanged.
- **RBAC:** none beyond `mcp-auth-ark-api-orchestration`.
- **Security:**
  - No token material reaches the browser; the redirect carries the MCPServer name, namespace, an opaque `auth_id`, and (on failure) an OAuth error code + a 200-char-capped description.
  - `auth_id` rides in the redirect URL (browser history / referrer). It is opaque and grants no privileges by itself (per the orchestration capability); polling `auth/status` with it only reveals the flow's terminal state.
  - The post-callback redirect is built from server config + trusted cache values, never from a client-supplied return URL — not an open-redirect vector.
  - `auth_error_desc` is IdP-supplied free text; it is truncated to 200 characters then URL-encoded before being placed in the redirect, and treated as untrusted by the dashboard toast.
  - The resolved identity written to `authorized-by` is the same identity ark-api already uses for impersonation; opaque to consumers and displayed verbatim.

## Non-Goals

- **Per-user tokens / multi-tenant MCP credentials** — out of scope, inherited from `mcp-auth-ark-api-orchestration`. `authorized-by` now carries the real user for dashboard flows but the model is still one shared Secret per MCPServer (last login wins; Re-authenticate overwrites it). Per-user isolation remains owned by the future `mcp-auth-per-user-tokens` capability.
- **New inbound-auth contract on the auth endpoints** — out of scope. This change consumes the identity the existing impersonation middleware resolves; it does not add authentication where there was none.
- **Automatic token refresh** — Stage 2 (`mcp-auth-token-refresh`). The dashboard exposes Re-authenticate for manual refresh until then; it does not background-refresh on expiry.
- **SDK-side Bearer injection for external executors** — out of scope and pre-existing in `main`; owned by `mcp-auth-sdk-header-resolution`. A server authenticated from the dashboard still requires the documented `spec.headers[]` workaround for external executors until that lands.
- **Multi-replica ark-api with a shared in-flight cache** — unchanged operational consideration from the orchestration change; redirect-based completion adds no new replica-affinity requirement beyond the existing `auth/callback` ↔ cache locality (the dashboard's `auth/status` poll already shares that locality with the CLI).
- **Surfacing every authorization sub-state** — the card renders `Required` / `Authorized` / `DiscoveryFailed`; transient pre-discovery states render no auth badge, and `DiscoveryFailed` shows an error badge without a remediation action.
