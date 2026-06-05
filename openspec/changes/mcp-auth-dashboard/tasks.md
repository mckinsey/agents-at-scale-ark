## 1. ark-api configuration

- [ ] 1.1 Add `ARK_API_DASHBOARD_URL` env var: optional; validate at startup when set as an absolute `https` URL, with the loopback carve-out (`127.0.0.1`, `[::1]` bracketed per RFC 3986 §3.2.2, `localhost`) permitting `http`. Reuse the validation helper from `ARK_API_PUBLIC_CALLBACK_URL` where possible.
- [ ] 1.2 The redirect target is `<ARK_API_DASHBOARD_URL>/mcp` — document that the value MUST include any dashboard path prefix (for `X-Forwarded-Prefix` deployments). Document in `services/ark-api/README.md` and the Helm chart values; note it is required only for the dashboard redirect-completion path (CLI is unaffected).

## 2. ark-api read surface

- [ ] 2.1 Add an `authorization` block (`state`, `resourceName?`, `authorizedBy?`, `authorizedAt?`, `expiresAt?`) to `MCPServerResponse` and `MCPServerDetailResponse` in `services/ark-api/ark-api/src/ark_api/models/mcp_servers.py`.
- [ ] 2.2 Populate it in `mcp_server_to_response` / the detail builder in `api/v1/mcp_servers.py` from `status.authorization.state`, `status.authorization.resourceName`, `status.authorization.expiresAt`, and the `mcp-auth-authorized-by` / `-authorized-at` annotations. Emit `null` when `status.authorization` is absent. Never include token/Secret material.
- [ ] 2.3 Tests: list/detail responses expose `authorization.state` for each of `Required` / `Authorized` / `DiscoveryFailed`, `authorizedBy` and `expiresAt` when present, and `null` when `status.authorization` is absent.

## 3. ark-api auth/start — identity capture + redirect opt-in

- [ ] 3.1 Add optional `redirect_on_complete: bool = False` to the `auth/start` request model; store it on the in-flight cache entry. Confirm it composes with the existing `force` flag (Re-authenticate path).
- [ ] 3.2 Resolve the caller identity from `request.state.user_identity` (the impersonation middleware) when present, else `cli`; store it on the cache entry. Reuse the `get_impersonation_config` / identity plumbing rather than re-reading headers.
- [ ] 3.3 Ensure the captured identity and flag are never returned in the `auth/start` response body and never logged.
- [ ] 3.4 Tests: authenticated request stores the resolved username; unauthenticated request stores `cli`; `redirect_on_complete` round-trips onto the cache entry; default is `false`; `force` + `redirect_on_complete` together are accepted.

## 4. ark-api auth/callback — dashboard redirect + identity write

- [ ] 4.1 Success path: when the cache entry has `redirect_on_complete == true` AND `ARK_API_DASHBOARD_URL` is configured, respond `302` to `<ARK_API_DASHBOARD_URL>/mcp?authorized=<name>&namespace=<ns>&auth_id=<auth_id>` (name + namespace URL-encoded from the cache entry, never from request input; `auth_id` is the existing flow identifier).
- [ ] 4.2 Failure paths for a dashboard flow: on IdP `error` OR a non-2xx token exchange, mark the cache entry `failed` and respond `302` with `&auth_error=<code>&auth_error_desc=<desc>` (no `auth_id`). `<code>` = OAuth error code, or `token_exchange_failed` for token-endpoint failures; `<desc>` = IdP description, URL-encoded and length-capped, omitted when absent.
- [ ] 4.3 Cache-miss path: when `state` is unknown/expired (client unknown), respond `302` to `<ARK_API_DASHBOARD_URL>/mcp?auth_error=expired` (no name/auth_id) when `ARK_API_DASHBOARD_URL` is set; otherwise render the existing HTML 400 page.
- [ ] 4.4 Fallback: when `redirect_on_complete` is false/absent OR `ARK_API_DASHBOARD_URL` is unset, render the existing HTML completion/error page unchanged.
- [ ] 4.5 Write the cache entry's captured identity to `ark.mckinsey.com/mcp-auth-authorized-by` (replacing the hard-coded `cli`); keep the `-authorized-at` RFC 3339 timestamp. Secret write and cache transitions unchanged from the HTML path.
- [ ] 4.6 Tests: dashboard success → 302 with `auth_id`; IdP error → 302 with `auth_error` + capped `auth_error_desc`; token-exchange failure → 302 with `auth_error=token_exchange_failed`; cache miss + dashboard URL → 302 `auth_error=expired`; cache miss + no dashboard URL → HTML 400; CLI flow → HTML unchanged; redirect `Location` derived from config + cache and ignores any host/url in the callback query (open-redirect guard); path-prefix `ARK_API_DASHBOARD_URL` produces `<prefix>/mcp`; `authorized-by` carries the resolved identity for dashboard flows and `cli` otherwise.

## 5. Dashboard — service + hooks

- [ ] 5.1 `lib/services/mcp-servers.ts`: add `startAuth(name, { namespace, force? })` → `POST /auth/start` with `redirect_on_complete: true` (and `force` when set), and `logoutAuth(name, { namespace })` → `POST /auth/logout` (default clear).
- [ ] 5.2 Regenerate / extend the MCP server types to include the new `authorization` block (incl. `expiresAt`), following the existing generated-types pattern.
- [ ] 5.3 `lib/services/mcp-servers-hooks.ts`: add `useStartMcpAuth()` and `useLogoutMcpAuth()` `useMutation` wrappers; invalidate the MCP servers query key on logout success.

## 6. Dashboard — card badge + Authenticate / Re-authenticate

- [ ] 6.1 In `components/cards/mcp-server-card.tsx`, render an authorization badge from `authorization.state` (`Required` / `Authorized` / `DiscoveryFailed`); none when `authorization` is absent. Reuse existing badge styling.
- [ ] 6.2 `Authorized` cards show an `expiresAt`-derived indication and a near-expiry visual flag; surface `authorizedBy` / `authorizedAt` in the existing info/detail affordance.
- [ ] 6.3 Add an **Authenticate** action (state `Required`) that calls `startAuth` then `window.location`-navigates to `authorization_url`; error toast + no navigation on failure.
- [ ] 6.4 Add a **Re-authenticate** action (state `Authorized`) that calls `startAuth` with `force: true` then navigates; emphasise it when near expiry.

## 7. Dashboard — completion handling

- [ ] 7.1 On the `/mcp` page, read the callback redirect params (`authorized`, `auth_id`, `auth_error`, `auth_error_desc`, `namespace`) using the namespaced-navigation conventions.
- [ ] 7.2 When `auth_error` is present, show an error toast: special-case `expired` to "flow expired — try again"; otherwise use `auth_error_desc` (fallback to the code). Do not poll.
- [ ] 7.3 Otherwise (with `authorized` + `auth_id`), poll `GET /auth/status?auth_id=&namespace=` until terminal: `authorized` → success toast + invalidate MCP servers query; `failed` → error toast with the status message; `expired` → expired toast. While `pending`, poll up to a bounded timeout, then a "submitted — not yet confirmed" toast.
- [ ] 7.4 Strip all consumed auth query params from the URL so a refresh does not re-trigger the handler.

## 8. Dashboard — Sign out

- [ ] 8.1 Add a **Sign out** action (state `Authorized`) that opens the existing confirmation dialog, then calls `logoutAuth` (default clear) on confirm.
- [ ] 8.2 On success, invalidate the MCP servers query and toast; on failure, error toast. Do not call the API if the dialog is dismissed.

## 9. Dashboard — tests

- [ ] 9.1 Badge renders the correct state for each `authorization.state` and nothing when absent; near-expiry flag shows when `expiresAt` is within threshold.
- [ ] 9.2 Authenticate calls `startAuth` (`redirect_on_complete: true`) and navigates on success; Re-authenticate adds `force: true`; toast + stay on failure.
- [ ] 9.3 Completion handler: `auth_error` path toasts (incl. `expired` special case) without polling; success path polls `auth/status` to `authorized`/`failed`/`expired`/timeout and toasts accordingly; all paths strip params.
- [ ] 9.4 Sign out: confirm → `logoutAuth` + invalidate + toast; dismiss → no API call.

## 10. Documentation

- [ ] 10.1 Add a dashboard "Authenticate an MCP server" section covering Authenticate, Re-authenticate, Sign out, the IdP redirect, and completion confirmation.
- [ ] 10.2 Document `ARK_API_DASHBOARD_URL` (purpose, path-prefix requirement, validation, fallback when unset) alongside the orchestration env vars.
- [ ] 10.3 Restate the external-executor `spec.headers[]` workaround (owned by `mcp-auth-sdk-header-resolution`) in the dashboard flow docs so dashboard users hit the same caveat as CLI users.
