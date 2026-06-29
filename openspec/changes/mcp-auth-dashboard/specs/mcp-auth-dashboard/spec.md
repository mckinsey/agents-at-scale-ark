## ADDED Requirements

### Requirement: ark-api exposes MCPServer authorization state on the read surface

`MCPServerResponse` (list) and `MCPServerDetailResponse` (detail) SHALL carry an optional `authorization` object so clients can render authorization state and expiry without parsing raw status or annotation strings. The object SHALL be sourced from the MCPServer's `status.authorization` and the `mcp-auth-authorized-*` annotations:

- `state`: the value of `status.authorization.state` (`Required` | `DiscoveryFailed` | `Authorized`).
- `resourceName`: the value of `status.authorization.resourceName` when present.
- `authorizedBy`: the value of the `ark.mckinsey.com/mcp-auth-authorized-by` annotation when present.
- `authorizedAt`: the value of the `ark.mckinsey.com/mcp-auth-authorized-at` annotation when present.
- `expiresAt`: the value of `status.authorization.expiresAt` when present (RFC 3339 UTC), so clients can flag near-expiry authorizations.

When `status.authorization` is absent, the `authorization` field SHALL be `null`/omitted. The field SHALL NOT carry any token material or Secret contents.

#### Scenario: MCPServer in Required state is listed

- **GIVEN** an MCPServer whose `status.authorization.state` is `Required`
- **WHEN** a client calls `GET /api/v1/mcp-servers`
- **THEN** that server's entry SHALL include `authorization.state == "Required"`
- **AND** SHALL NOT include any token or Secret value

#### Scenario: MCPServer with no authorization status is listed

- **GIVEN** an MCPServer with no `status.authorization` block
- **WHEN** a client calls `GET /api/v1/mcp-servers`
- **THEN** that server's entry SHALL have `authorization` null or omitted

#### Scenario: Authorized server exposes identity and expiry

- **GIVEN** an MCPServer whose `status.authorization.state` is `Authorized`, with `status.authorization.expiresAt` set and `ark.mckinsey.com/mcp-auth-authorized-by: alice@example.com`
- **WHEN** a client reads the server
- **THEN** the response SHALL include `authorization.state == "Authorized"`, `authorization.authorizedBy == "alice@example.com"`, and `authorization.expiresAt` equal to the status value

### Requirement: auth/start captures the authenticated caller identity

`POST /api/v1/mcp-servers/{name}/auth/start` SHALL record the caller's resolved identity in the in-flight cache entry for the flow. When the request carries an authenticated identity (the impersonation middleware has populated `request.state.user_identity`), the recorded identity SHALL be that user's resolved identity string. When no authenticated identity is present — the in-cluster Service path used by the CLI, or impersonation disabled — the recorded identity SHALL be the literal string `cli`. The identity SHALL be held alongside the existing PKCE/state material and SHALL NOT be returned to the caller.

#### Scenario: Authenticated dashboard request records the user identity

- **GIVEN** ark-api with impersonation enabled and a request whose `request.state.user_identity.username` is `alice@example.com`
- **WHEN** the caller invokes `auth/start` for a `Required` MCPServer
- **THEN** the flow's cache entry SHALL record `alice@example.com` as the caller identity

#### Scenario: Unauthenticated CLI request falls back to cli

- **GIVEN** a request with no `request.state.user_identity` (impersonation disabled or in-cluster Service path)
- **WHEN** the caller invokes `auth/start`
- **THEN** the flow's cache entry SHALL record the literal string `cli` as the caller identity

### Requirement: auth/start accepts a redirect_on_complete opt-in

`POST /api/v1/mcp-servers/{name}/auth/start` SHALL accept an optional body field `redirect_on_complete: bool` (default `false`). The value SHALL be stored on the flow's cache entry and SHALL govern whether `auth/callback` redirects to the dashboard or renders the HTML completion page. A `false`/absent value SHALL preserve the existing HTML-completion behaviour exactly. The flag SHALL NOT alter any preflight, DCR, PKCE, or token-exchange behaviour, and SHALL compose with the existing `force` flag (used by the dashboard's Re-authenticate action against an `Authorized` server).

#### Scenario: CLI start omits the flag and gets HTML completion

- **WHEN** a client calls `auth/start` without `redirect_on_complete`
- **THEN** the flow's cache entry SHALL record `redirect_on_complete = false`
- **AND** the eventual callback SHALL render the HTML completion page

#### Scenario: Dashboard start sets the flag

- **WHEN** the dashboard calls `auth/start` with `{ "redirect_on_complete": true }`
- **THEN** the flow's cache entry SHALL record `redirect_on_complete = true`

### Requirement: auth/callback redirects dashboard-initiated flows to the dashboard

On a flow whose cache entry has `redirect_on_complete == true`, and when `ARK_API_DASHBOARD_URL` is configured, `GET /api/v1/mcp/auth/callback` SHALL respond `302` rather than rendering the HTML completion page. The Secret write, annotation stamping, and cache-state transitions SHALL be identical to the HTML-completion path — only the response differs. The `Location` SHALL be:

- **On a successful token exchange:** `<ARK_API_DASHBOARD_URL>/mcp?authorized=<name>&namespace=<ns>&auth_id=<auth_id>`, where `auth_id` is the flow's existing identifier so the dashboard can poll `auth/status`.
- **On an IdP `error` redirect OR a failed token exchange:** `<ARK_API_DASHBOARD_URL>/mcp?authorized=<name>&namespace=<ns>&auth_error=<code>&auth_error_desc=<desc>`. `<code>` is the OAuth error code (or the stable token `token_exchange_failed` when the token endpoint itself failed). `<desc>` is the IdP-supplied human-readable description, truncated to 200 characters then URL-encoded (truncation precedes encoding so an escape sequence is never split); it SHALL be omitted when absent. The cache entry's `failed` transition SHALL still occur.

The MCPServer `name` and `namespace` SHALL be taken from the trusted cache entry (never from a request parameter) and URL-encoded. When `redirect_on_complete` is `false`/absent, or `ARK_API_DASHBOARD_URL` is not configured, the endpoint SHALL render the HTML completion/error page from `mcp-auth-ark-api-orchestration` unchanged (graceful fallback).

#### Scenario: Successful dashboard flow redirects with auth_id

- **GIVEN** a flow started with `redirect_on_complete: true` for MCPServer `notion` in namespace `team-a`, and `ARK_API_DASHBOARD_URL=https://ark.example.com`
- **WHEN** the IdP redirects to `auth/callback` with a valid `code` and the token exchange succeeds
- **THEN** ark-api SHALL write the Secret and respond `302` to `https://ark.example.com/mcp?authorized=notion&namespace=team-a&auth_id=<auth_id>`

#### Scenario: IdP error on a dashboard flow redirects with auth_error and description

- **GIVEN** a flow started with `redirect_on_complete: true` for MCPServer `notion` in namespace `team-a`
- **WHEN** the IdP redirects to `auth/callback` with `error=access_denied&error_description=User+declined`
- **THEN** ark-api SHALL respond `302` to `https://ark.example.com/mcp?authorized=notion&namespace=team-a&auth_error=access_denied&auth_error_desc=User%20declined`
- **AND** the `auth_error_desc` value SHALL be truncated to 200 characters then URL-encoded

#### Scenario: Token-exchange failure on a dashboard flow redirects with auth_error

- **GIVEN** a flow started with `redirect_on_complete: true` whose IdP returned a valid `code`
- **WHEN** the token endpoint responds non-2xx
- **THEN** ark-api SHALL mark the cache entry `failed` and respond `302` with `auth_error=token_exchange_failed`

#### Scenario: Expired/replayed state redirects to the dashboard when configured

- **GIVEN** a callback whose `state` is unknown or expired (no cache entry, so the flow's client cannot be determined) and `ARK_API_DASHBOARD_URL` is configured
- **WHEN** the IdP redirects to `auth/callback`
- **THEN** ark-api SHALL respond `302` to `https://ark.example.com/mcp?auth_error=expired` without a server name or `auth_id`

#### Scenario: Expired/replayed state with no dashboard URL falls back to HTML

- **GIVEN** a callback whose `state` is unknown or expired and `ARK_API_DASHBOARD_URL` is unset
- **WHEN** the IdP redirects to `auth/callback`
- **THEN** ark-api SHALL render the HTML 400 page from the orchestration capability

#### Scenario: Dashboard flow falls back to HTML when no dashboard URL is configured

- **GIVEN** a flow started with `redirect_on_complete: true` and `ARK_API_DASHBOARD_URL` unset
- **WHEN** the IdP redirects to `auth/callback` with a valid `code`
- **THEN** ark-api SHALL render the HTML completion page rather than redirecting

#### Scenario: Redirect target is not derived from client input

- **GIVEN** any dashboard-initiated flow
- **WHEN** ark-api builds the post-callback redirect
- **THEN** the redirect host and path SHALL be derived solely from `ARK_API_DASHBOARD_URL` plus the cache entry's MCPServer name and namespace
- **AND** SHALL NOT echo any URL, host, or path supplied in the callback request query string

### Requirement: Successful exchange records the captured identity as authorized-by

On a successful token exchange, ark-api SHALL set `ark.mckinsey.com/mcp-auth-authorized-by` on the MCPServer to the caller identity captured at `auth/start` time (an authenticated user's resolved identity, or `cli` when none was present). This widens the orchestration capability's hard-coded `cli` value and realises its forward-compatibility scenario. The annotation value is opaque to consumers and SHALL be displayed verbatim. The annotation SHALL be replaced (not appended) on each successful exchange, and SHALL be removed by `auth/logout` as specified by the orchestration capability.

#### Scenario: Dashboard flow annotates the resolved user

- **GIVEN** a flow whose cache entry recorded the identity `alice@example.com`
- **WHEN** the token exchange succeeds
- **THEN** the MCPServer SHALL be annotated `ark.mckinsey.com/mcp-auth-authorized-by: alice@example.com`
- **AND** `ark.mckinsey.com/mcp-auth-authorized-at` SHALL be set to an RFC 3339 UTC timestamp

#### Scenario: CLI flow still annotates cli

- **GIVEN** a flow whose cache entry recorded the identity `cli`
- **WHEN** the token exchange succeeds
- **THEN** the MCPServer SHALL be annotated `ark.mckinsey.com/mcp-auth-authorized-by: cli`

### Requirement: ARK_API_DASHBOARD_URL configuration

ark-api SHALL read an optional `ARK_API_DASHBOARD_URL` environment variable naming the dashboard base URL used to build the post-callback redirect. The redirect target SHALL be `<ARK_API_DASHBOARD_URL>/mcp?…`, so the configured value MUST include any path prefix under which the dashboard is served (e.g. behind an `X-Forwarded-Prefix`). When set, the value SHALL be validated at startup: a well-formed absolute URL with an `https` scheme, except for loopback hosts (`127.0.0.1`, `[::1]` bracketed per RFC 3986 §3.2.2, `localhost`) which MAY use `http`. An invalid value SHALL fail validation at startup. When unset, dashboard-initiated flows SHALL fall back to the HTML completion page; the variable SHALL NOT be required for the CLI flow.

#### Scenario: Invalid dashboard URL fails startup validation

- **GIVEN** `ARK_API_DASHBOARD_URL=ftp://example.com` (non-HTTPS, non-loopback)
- **WHEN** ark-api validates configuration at startup
- **THEN** validation SHALL fail with a message naming the invalid configuration

#### Scenario: Dashboard served under a path prefix

- **GIVEN** `ARK_API_DASHBOARD_URL=https://ark.example.com/dashboard`
- **WHEN** ark-api builds a successful-completion redirect for MCPServer `notion` in `team-a`
- **THEN** the `Location` SHALL be `https://ark.example.com/dashboard/mcp?authorized=notion&namespace=team-a&auth_id=<auth_id>`

#### Scenario: Unset dashboard URL leaves the CLI flow unaffected

- **GIVEN** `ARK_API_DASHBOARD_URL` unset and `ARK_API_PUBLIC_CALLBACK_URL` set
- **WHEN** a CLI flow completes
- **THEN** the callback SHALL render the HTML completion page as before

### Requirement: Dashboard surfaces authorization state on the MCP server card

The dashboard MCP servers page SHALL render each server's authorization state from the `authorization.state` field. `Required` SHALL render an action-needed badge. `Authorized` SHALL render an authorized badge with the `authorizedBy` identity available on hover/detail when present and an `expiresAt`-derived indication, visually flagged when the authorization is near expiry. `DiscoveryFailed` SHALL render an error badge with no authenticate action. A server with no `authorization` block SHALL render no authorization badge.

#### Scenario: Required server shows the authenticate affordance

- **GIVEN** a server card whose `authorization.state` is `Required`
- **WHEN** the card renders
- **THEN** it SHALL show a `Required` badge and an **Authenticate** action

#### Scenario: Authorized server shows identity, expiry, and lifecycle actions

- **GIVEN** a server card whose `authorization.state` is `Authorized` with `expiresAt` set
- **WHEN** the card renders
- **THEN** it SHALL show an `Authorized` badge with an expiry indication, a **Re-authenticate** action, and a **Sign out** action
- **AND** SHALL NOT show the **Authenticate** action

#### Scenario: Near-expiry authorization is flagged

- **GIVEN** an `Authorized` server whose `expiresAt` is within the near-expiry threshold
- **WHEN** the card renders
- **THEN** it SHALL visually flag the authorization as near expiry

#### Scenario: DiscoveryFailed server shows no authenticate action

- **GIVEN** a server card whose `authorization.state` is `DiscoveryFailed`
- **WHEN** the card renders
- **THEN** it SHALL show an error badge and SHALL NOT show an **Authenticate** or **Re-authenticate** action

### Requirement: Dashboard Authenticate and Re-authenticate start the flow

The **Authenticate** action (state `Required`) SHALL call `POST /api/v1/mcp-servers/{name}/auth/start` with `redirect_on_complete: true` and the card's namespace, then navigate the browser to the returned `authorization_url`. The **Re-authenticate** action (state `Authorized`) SHALL behave identically but additionally send `force: true` so `auth/start` accepts the already-`Authorized` server. On a non-2xx response, either action SHALL surface an error toast and remain on the page without navigating.

#### Scenario: Authenticate navigates to the authorization URL

- **GIVEN** a `Required` server
- **WHEN** the user clicks **Authenticate** and `auth/start` returns `200` with an `authorization_url`
- **THEN** the dashboard SHALL navigate the browser to that `authorization_url`

#### Scenario: Re-authenticate sends force on an Authorized server

- **GIVEN** an `Authorized` server
- **WHEN** the user clicks **Re-authenticate**
- **THEN** the dashboard SHALL call `auth/start` with `force: true` and `redirect_on_complete: true`, then navigate to the returned `authorization_url`

#### Scenario: Start failure surfaces a toast

- **WHEN** `auth/start` returns a `4xx`/`5xx`
- **THEN** the dashboard SHALL show an error toast and SHALL NOT navigate away

### Requirement: Dashboard confirms completion via auth/status on return

On loading `/mcp` with auth query parameters set by the callback redirect, the dashboard SHALL determine the outcome as follows and, in all cases, strip the consumed auth parameters (`authorized`, `auth_id`, `auth_error`, `auth_error_desc`, and the redirect-added `namespace`) from the URL so a refresh does not re-trigger the handler:

- When `auth_error` is present, it SHALL show an error toast. The `expired` value SHALL be special-cased to a "flow expired — try again" message; otherwise the toast SHALL use `auth_error_desc` when present, falling back to the `auth_error` code. It SHALL NOT poll.
- Otherwise, with `authorized=<name>` and `auth_id` present, it SHALL poll `GET /api/v1/mcp-servers/{name}/auth/status?auth_id=<auth_id>&namespace=<ns>` — the same completion endpoint the orchestration CLI polls, reused here rather than introducing a streaming/push channel — until a terminal state: `authorized` → success toast; `failed` → error toast carrying the status message; `expired` → expired toast, **except** when the freshly-loaded MCP servers list shows that same server's current `authorization.state == Authorized` (the flow succeeded but its cache entry aged out before the stale params were stripped, so `auth/status` can only report `expired`) — in that case the dashboard SHALL suppress the "flow expired — try again" toast and instead silently strip the params or show an "already authorized — no action needed" message, since it holds strictly more state than `auth/status` does. The token exchange has already completed before the redirect, so only the controller's reconcile to `Authorized` remains: while `pending`, it SHALL poll at a ~2 s interval up to a bounded client-side budget of ~30 s (a dashboard constant, distinct from and much shorter than the server-side `ARK_API_MCP_AUTH_CACHE_TTL_SECONDS` since the flow's own cache entry need not be alive for this confirmation), after which it SHALL show a "submitted — not yet confirmed; check the server status" toast. On `authorized` it SHALL invalidate the MCP servers query so the card reflects the new state.

#### Scenario: Successful return polls auth/status to authorized

- **GIVEN** the browser returns to `/mcp?authorized=notion&namespace=team-a&auth_id=abc`
- **WHEN** the dashboard handles the return and `auth/status` reports `authorized`
- **THEN** it SHALL show a success toast, invalidate the MCP servers query, and strip the auth query parameters

#### Scenario: Returned flow reported as failed

- **GIVEN** the browser returns with `authorized=notion&auth_id=abc` and `auth/status` reports `failed`
- **WHEN** the dashboard handles the return
- **THEN** it SHALL show an error toast carrying the status message and SHALL NOT report success

#### Scenario: Return with auth_error shows an error without polling

- **GIVEN** the browser returns to `/mcp?authorized=notion&namespace=team-a&auth_error=access_denied&auth_error_desc=User%20declined`
- **WHEN** the dashboard handles the return
- **THEN** it SHALL show an error toast using the description and SHALL NOT poll `auth/status`

#### Scenario: Return with expired error

- **GIVEN** the browser returns to `/mcp?auth_error=expired`
- **WHEN** the dashboard handles the return
- **THEN** it SHALL show a "flow expired — try again" toast

#### Scenario: Expired poll on a stale URL whose server is already Authorized

- **GIVEN** the browser returns to a stale `/mcp?authorized=notion&namespace=team-a&auth_id=abc` after the flow's cache entry has aged out
- **AND** the freshly-loaded MCP servers list shows `notion` with `authorization.state == "Authorized"`
- **WHEN** the dashboard polls `auth/status` and it reports `expired`
- **THEN** it SHALL NOT show the "flow expired — try again" toast
- **AND** it SHALL strip the auth query parameters (optionally showing an "already authorized — no action needed" message)

#### Scenario: Pending beyond the timeout

- **GIVEN** a successful return whose `auth/status` stays `pending` past the bounded timeout
- **WHEN** the timeout elapses
- **THEN** the dashboard SHALL show a "submitted — not yet confirmed" toast and stop polling

### Requirement: Dashboard Sign out action revokes authorization

The **Sign out** action (shown when `authorization.state == Authorized`) SHALL open a confirmation dialog and, on confirm, call `POST /api/v1/mcp-servers/{name}/auth/logout` with the default body (clear tokens, retain the Secret) and the card's namespace. On success it SHALL show a toast and invalidate the MCP servers query so the card reflects the revoked state. A `4xx`/`5xx` SHALL surface an error toast.

#### Scenario: Sign out clears tokens and refreshes the card

- **GIVEN** an `Authorized` server
- **WHEN** the user confirms **Sign out** and `auth/logout` returns `200`
- **THEN** the dashboard SHALL invalidate the MCP servers query and show a success toast

#### Scenario: Sign out is confirmed before calling the API

- **GIVEN** an `Authorized` server
- **WHEN** the user clicks **Sign out** but dismisses the confirmation dialog
- **THEN** the dashboard SHALL NOT call `auth/logout`
