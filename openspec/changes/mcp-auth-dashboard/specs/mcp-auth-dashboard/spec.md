## ADDED Requirements

### Requirement: ark-api exposes MCPServer authorization state on the read surface

`MCPServerResponse` (list) and `MCPServerDetailResponse` (detail) SHALL carry an optional `authorization` object so clients can render authorization state without parsing raw status or annotation strings. The object SHALL be sourced from the MCPServer's `status.authorization` and the `mcp-auth-authorized-*` annotations:

- `state`: the value of `status.authorization.state` (`Required` | `DiscoveryFailed` | `Authorized`).
- `resourceName`: the value of `status.authorization.resourceName` when present.
- `authorizedBy`: the value of the `ark.mckinsey.com/mcp-auth-authorized-by` annotation when present.
- `authorizedAt`: the value of the `ark.mckinsey.com/mcp-auth-authorized-at` annotation when present.

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

#### Scenario: Authorized server exposes authorized-by

- **GIVEN** an MCPServer whose `status.authorization.state` is `Authorized` and which carries `ark.mckinsey.com/mcp-auth-authorized-by: alice@example.com`
- **WHEN** a client reads the server
- **THEN** the response SHALL include `authorization.state == "Authorized"` and `authorization.authorizedBy == "alice@example.com"`

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

`POST /api/v1/mcp-servers/{name}/auth/start` SHALL accept an optional body field `redirect_on_complete: bool` (default `false`). The value SHALL be stored on the flow's cache entry and SHALL govern whether `auth/callback` redirects to the dashboard or renders the HTML completion page. A `false`/absent value SHALL preserve the existing HTML-completion behaviour exactly. The flag SHALL NOT alter any preflight, DCR, PKCE, or token-exchange behaviour.

#### Scenario: CLI start omits the flag and gets HTML completion

- **WHEN** a client calls `auth/start` without `redirect_on_complete`
- **THEN** the flow's cache entry SHALL record `redirect_on_complete = false`
- **AND** the eventual callback SHALL render the HTML completion page

#### Scenario: Dashboard start sets the flag

- **WHEN** the dashboard calls `auth/start` with `{ "redirect_on_complete": true }`
- **THEN** the flow's cache entry SHALL record `redirect_on_complete = true`

### Requirement: auth/callback redirects dashboard-initiated flows to the dashboard

On a flow whose cache entry has `redirect_on_complete == true`, and when `ARK_API_DASHBOARD_URL` is configured, `GET /api/v1/mcp/auth/callback` SHALL respond `302` with a `Location` of `<ARK_API_DASHBOARD_URL>/mcp?authorized=<name>&namespace=<ns>` on a successful token exchange, or `<ARK_API_DASHBOARD_URL>/mcp?authorized=<name>&namespace=<ns>&auth_error=<oauth_error_code>` when the IdP redirected with an `error`. The MCPServer `name` and `namespace` SHALL be taken from the trusted cache entry (not from any request parameter) and URL-encoded; the `auth_error` value SHALL be the OAuth `error` code, URL-encoded. The Secret write, annotation stamping, and cache-state transitions SHALL be identical to the HTML-completion path — only the response differs.

When `redirect_on_complete` is `false`/absent, or when `ARK_API_DASHBOARD_URL` is not configured, the endpoint SHALL render the HTML completion page from `mcp-auth-ark-api-orchestration` unchanged (graceful fallback).

#### Scenario: Successful dashboard flow redirects to the MCP page

- **GIVEN** a flow started with `redirect_on_complete: true` for MCPServer `notion` in namespace `team-a`, and `ARK_API_DASHBOARD_URL=https://ark.example.com`
- **WHEN** the IdP redirects to `auth/callback` with a valid `code` and the token exchange succeeds
- **THEN** ark-api SHALL write the Secret and respond `302` to `https://ark.example.com/mcp?authorized=notion&namespace=team-a`

#### Scenario: IdP error on a dashboard flow redirects with auth_error

- **GIVEN** a flow started with `redirect_on_complete: true` for MCPServer `notion` in namespace `team-a`
- **WHEN** the IdP redirects to `auth/callback` with `error=access_denied`
- **THEN** ark-api SHALL respond `302` to `https://ark.example.com/mcp?authorized=notion&namespace=team-a&auth_error=access_denied`

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

ark-api SHALL read an optional `ARK_API_DASHBOARD_URL` environment variable naming the dashboard base URL used to build the post-callback redirect. When set, it SHALL be validated at startup: a well-formed absolute URL with an `https` scheme, except for loopback hosts (`127.0.0.1`, `[::1]` bracketed per RFC 3986 §3.2.2, `localhost`) which MAY use `http`. An invalid value SHALL fail validation at startup. When unset, dashboard-initiated flows SHALL fall back to the HTML completion page; the variable SHALL NOT be required for the CLI flow.

#### Scenario: Invalid dashboard URL fails startup validation

- **GIVEN** `ARK_API_DASHBOARD_URL=ftp://example.com` (non-HTTPS, non-loopback)
- **WHEN** ark-api validates configuration at startup
- **THEN** validation SHALL fail with a message naming the invalid configuration

#### Scenario: Unset dashboard URL leaves the CLI flow unaffected

- **GIVEN** `ARK_API_DASHBOARD_URL` unset and `ARK_API_PUBLIC_CALLBACK_URL` set
- **WHEN** a CLI flow completes
- **THEN** the callback SHALL render the HTML completion page as before

### Requirement: Dashboard surfaces authorization state on the MCP server card

The dashboard MCP servers page SHALL render each server's authorization state from the `authorization.state` field. `Required` SHALL render an action-needed badge, `Authorized` SHALL render an authorized badge (with the `authorizedBy` identity available on hover/detail when present), and `DiscoveryFailed` SHALL render an error badge with no authenticate action. A server with no `authorization` block SHALL render no authorization badge.

#### Scenario: Required server shows the authenticate affordance

- **GIVEN** a server card whose `authorization.state` is `Required`
- **WHEN** the card renders
- **THEN** it SHALL show a `Required` badge and an **Authenticate** action

#### Scenario: Authorized server shows authorized state and sign-out

- **GIVEN** a server card whose `authorization.state` is `Authorized`
- **WHEN** the card renders
- **THEN** it SHALL show an `Authorized` badge and a **Sign out** action
- **AND** SHALL NOT show the **Authenticate** action

#### Scenario: DiscoveryFailed server shows no authenticate action

- **GIVEN** a server card whose `authorization.state` is `DiscoveryFailed`
- **WHEN** the card renders
- **THEN** it SHALL show an error badge and SHALL NOT show an **Authenticate** action

### Requirement: Dashboard Authenticate action starts the flow and navigates to the IdP

The **Authenticate** action SHALL call `POST /api/v1/mcp-servers/{name}/auth/start` with `redirect_on_complete: true` and the card's namespace, then navigate the browser to the returned `authorization_url`. On a non-2xx response, it SHALL surface an error toast and remain on the page without navigating.

#### Scenario: Authenticate navigates to the authorization URL

- **GIVEN** a `Required` server
- **WHEN** the user clicks **Authenticate** and `auth/start` returns `200` with an `authorization_url`
- **THEN** the dashboard SHALL navigate the browser to that `authorization_url`

#### Scenario: Authenticate surfaces a start failure

- **WHEN** `auth/start` returns a `4xx`/`5xx`
- **THEN** the dashboard SHALL show an error toast and SHALL NOT navigate away

### Requirement: Dashboard completes the flow on return from the callback

On loading `/mcp` with an `?authorized=<name>` query parameter, the dashboard SHALL treat the flow as returned and SHALL: on `auth_error` present, show an error toast naming the OAuth error; otherwise refetch the named server and poll `authorization.state` until it reads `Authorized` (bounded, surfacing a transient "finishing" indication for the controller reconcile lag) and then show a success toast. In all cases it SHALL strip the `authorized` / `auth_error` / transient query parameters from the URL so a refresh does not re-trigger the handler.

#### Scenario: Return with success polls until Authorized

- **GIVEN** the browser returns to `/mcp?authorized=notion&namespace=team-a`
- **WHEN** the dashboard handles the return
- **THEN** it SHALL refetch `notion` and poll `authorization.state` until `Authorized`, then show a success toast
- **AND** SHALL remove the `authorized` and `namespace` auth query parameters it consumed

#### Scenario: Return with auth_error shows an error

- **GIVEN** the browser returns to `/mcp?authorized=notion&namespace=team-a&auth_error=access_denied`
- **WHEN** the dashboard handles the return
- **THEN** it SHALL show an error toast naming `access_denied` and SHALL NOT report success

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
