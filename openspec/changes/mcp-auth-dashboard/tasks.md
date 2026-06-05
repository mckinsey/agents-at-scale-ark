## 1. ark-api configuration

- [ ] 1.1 Add `ARK_API_DASHBOARD_URL` env var: optional; validate at startup when set as an absolute `https` URL, with the loopback carve-out (`127.0.0.1`, `[::1]` bracketed per RFC 3986 §3.2.2, `localhost`) permitting `http`. Reuse the validation helper from `ARK_API_PUBLIC_CALLBACK_URL` where possible.
- [ ] 1.2 Document `ARK_API_DASHBOARD_URL` in `services/ark-api/README.md` and the Helm chart values; note it is required only for the dashboard redirect-completion path (CLI is unaffected).

## 2. ark-api read surface

- [ ] 2.1 Add an `authorization` block (`state`, `resourceName?`, `authorizedBy?`, `authorizedAt?`) to `MCPServerResponse` and `MCPServerDetailResponse` in `services/ark-api/ark-api/src/ark_api/models/mcp_servers.py`.
- [ ] 2.2 Populate it in `mcp_server_to_response` / the detail builder in `api/v1/mcp_servers.py` from `status.authorization.state`, `status.authorization.resourceName`, and the `ark.mckinsey.com/mcp-auth-authorized-by` / `-authorized-at` annotations. Emit `null` when `status.authorization` is absent. Never include token/Secret material.
- [ ] 2.3 Tests: list/detail responses expose `authorization.state` for each of `Required` / `Authorized` / `DiscoveryFailed`, `authorizedBy` when annotated, and `null` when `status.authorization` is absent.

## 3. ark-api auth/start — identity capture + redirect opt-in

- [ ] 3.1 Add optional `redirect_on_complete: bool = False` to the `auth/start` request model; store it on the in-flight cache entry.
- [ ] 3.2 Resolve the caller identity from `request.state.user_identity` (the impersonation middleware) when present, else `cli`; store it on the cache entry. Reuse the `get_impersonation_config` / identity plumbing rather than re-reading headers.
- [ ] 3.3 Ensure the captured identity and flag are never returned in the `auth/start` response body and never logged.
- [ ] 3.4 Tests: authenticated request stores the resolved username; unauthenticated request stores `cli`; `redirect_on_complete` round-trips onto the cache entry; default is `false`.

## 4. ark-api auth/callback — dashboard redirect + identity write

- [ ] 4.1 On success, when the cache entry has `redirect_on_complete == true` AND `ARK_API_DASHBOARD_URL` is configured, respond `302` to `<ARK_API_DASHBOARD_URL>/mcp?authorized=<name>&namespace=<ns>` (name + namespace URL-encoded from the cache entry, never from request input).
- [ ] 4.2 On IdP `error` for a dashboard flow, respond `302` to the same target with `&auth_error=<oauth_error_code>` (URL-encoded). Keep the existing cache `failed` transition.
- [ ] 4.3 Fallback: when `redirect_on_complete` is false/absent OR `ARK_API_DASHBOARD_URL` is unset, render the existing HTML completion/error page unchanged.
- [ ] 4.4 Write the cache entry's captured identity to `ark.mckinsey.com/mcp-auth-authorized-by` (replacing the hard-coded `cli`); keep the `-authorized-at` RFC 3339 timestamp. Secret write and cache transitions unchanged from the HTML path.
- [ ] 4.5 Tests: dashboard success → 302 to `/mcp?authorized=…&namespace=…`; dashboard IdP error → 302 with `&auth_error=…`; no dashboard URL → HTML fallback; CLI flow → HTML unchanged; redirect `Location` is derived from config + cache and ignores any host/url supplied in the callback query (open-redirect guard); `authorized-by` carries the resolved identity for dashboard flows and `cli` otherwise.

## 5. Dashboard — service + hooks

- [ ] 5.1 `lib/services/mcp-servers.ts`: add `startAuth(name, { namespace, force?, forceRegistration?, scopes? })` → `POST /auth/start` with `redirect_on_complete: true`, and `logoutAuth(name, { namespace, keepClient?, deleteSecret? })` → `POST /auth/logout`.
- [ ] 5.2 Regenerate / extend the MCP server types to include the new `authorization` block (follow the existing generated-types pattern).
- [ ] 5.3 `lib/services/mcp-servers-hooks.ts`: add `useStartMcpAuth()` and `useLogoutMcpAuth()` `useMutation` wrappers; invalidate the MCP servers query key on logout success.

## 6. Dashboard — card badge + Authenticate

- [ ] 6.1 In `components/cards/mcp-server-card.tsx`, render an authorization badge from `authorization.state` (`Required` / `Authorized` / `DiscoveryFailed`); none when `authorization` is absent. Reuse the existing badge component/styling conventions.
- [ ] 6.2 Add an **Authenticate** action (state `Required`) that calls `startAuth` then `window.location`-navigates to `authorization_url`; error toast + no navigation on failure.
- [ ] 6.3 Surface `authorizedBy` / `authorizedAt` in the existing info/detail affordance when `Authorized`.

## 7. Dashboard — return handling

- [ ] 7.1 On the `/mcp` page, read `?authorized=<name>` / `?auth_error=<code>` (and namespace) using the namespaced-navigation conventions.
- [ ] 7.2 On `auth_error`, show an error toast naming the OAuth error.
- [ ] 7.3 On success, refetch the named server and poll `authorization.state` until `Authorized` (bounded; transient "finishing up" indication for reconcile lag), then a success toast.
- [ ] 7.4 Strip the consumed auth query params from the URL so a refresh does not re-trigger the handler.

## 8. Dashboard — Sign out

- [ ] 8.1 Add a **Sign out** action (state `Authorized`) that opens the existing confirmation dialog, then calls `logoutAuth` (default clear) on confirm.
- [ ] 8.2 On success, invalidate the MCP servers query and toast; on failure, error toast. Do not call the API if the dialog is dismissed.

## 9. Dashboard — tests

- [ ] 9.1 Badge renders correct state for each `authorization.state` and nothing when absent.
- [ ] 9.2 Authenticate calls `startAuth` with `redirect_on_complete: true` and navigates on success; toasts and stays on failure.
- [ ] 9.3 Return handler: success path polls to `Authorized` + toasts + strips params; `auth_error` path toasts the error; no params → no-op.
- [ ] 9.4 Sign out: confirm → `logoutAuth` + invalidate + toast; dismiss → no API call.

## 10. Documentation

- [ ] 10.1 Add a dashboard "Authenticate an MCP server" section to the MCP auth docs covering the button, the IdP redirect, and the Sign out action.
- [ ] 10.2 Document `ARK_API_DASHBOARD_URL` (purpose, validation, fallback behaviour when unset) alongside the orchestration env vars.
- [ ] 10.3 Restate the external-executor `spec.headers[]` workaround (owned by `mcp-auth-sdk-header-resolution`) in the dashboard flow docs so dashboard users hit the same caveat as CLI users.
