# ark-cli-mcp-auth Specification

## Purpose
TBD - created by archiving change ark-cli-mcp-auth. Update Purpose after archive.
## Requirements
### Requirement: ark-cli exposes `mcp auth login` and `mcp auth logout` subcommands

The Ark CLI SHALL expose `ark mcp auth` as a parent command with two verbs: `login` and `logout`. `ark mcp auth login <server-name>` SHALL drive an end-to-end OAuth 2.1 flow against an `MCPServer`'s discovered authorization endpoints and write the resulting tokens to the Secret named in `spec.authorization.tokenSecretRef`. `ark mcp auth logout <server-name>` SHALL clear (or delete) that same Secret so the controller's next reconcile collapses the server back to `Required`. The `login` subcommand SHALL accept `--namespace`, `--force`, `--port <int>`, `--no-open`, and `--timeout <ms>`; `--port` and `--timeout` SHALL reject non-integer or negative values.

#### Scenario: User runs ark mcp auth login against a Required MCPServer

- **GIVEN** an `MCPServer` named `notion` whose `status.authorization.state` is `Required`
- **WHEN** the user runs `ark mcp auth login notion`
- **THEN** the CLI SHALL drive DCR + PKCE + loopback callback + token exchange and patch the Secret named in `spec.authorization.tokenSecretRef`

#### Scenario: User passes an unparseable port

- **WHEN** the user runs `ark mcp auth login notion --port abc`
- **THEN** the CLI SHALL exit non-zero with a message naming `--port` and the offending value

### Requirement: Pre-flight refuses non-Required state without --force

The command SHALL refuse to run unless `status.authorization.state` is `Required`. The user MAY override with `--force`.

#### Scenario: MCPServer is already Authorized

- **GIVEN** an `MCPServer` whose `status.authorization.state` is `Authorized`
- **WHEN** the user runs `ark mcp auth login <name>` without `--force`
- **THEN** the CLI SHALL exit non-zero and explain that the server is already authorized

#### Scenario: User passes --force on an Authorized MCPServer

- **WHEN** the user runs `ark mcp auth login <name> --force`
- **THEN** the CLI SHALL run the full flow regardless of state

### Requirement: Namespace resolution prefers explicit flag, then context, then default

The CLI SHALL resolve namespace as: `--namespace` if set, else current `kubectl` context namespace, else `default`.

#### Scenario: User passes --namespace explicitly

- **WHEN** the user runs `ark mcp auth login <name> --namespace tenant-a`
- **THEN** the CLI SHALL use `tenant-a` for every kubectl call

#### Scenario: kubectl context has no namespace

- **GIVEN** the active `kubectl` context has no namespace configured
- **WHEN** the user omits `--namespace`
- **THEN** the CLI SHALL use `default`

### Requirement: PKCE primitives meet RFC 7636 S256

The CLI SHALL generate a PKCE code verifier of 43-128 unreserved characters and an S256-derived challenge, plus a cryptographically random opaque `state`.

#### Scenario: Verifier and challenge are derived correctly

- **WHEN** `generatePkcePair()` is invoked
- **THEN** the verifier SHALL contain only `[A-Za-z0-9-._~]`, SHALL be 43-128 chars, and the challenge SHALL equal `BASE64URL(SHA-256(verifier))`

#### Scenario: Default lengths balance entropy and compatibility

- **WHEN** `generatePkcePair()` and `generateState()` are invoked with no overrides
- **THEN** the verifier SHALL be 64 characters from the unreserved set
- **AND** the `state` SHALL be at least 128 bits (16 bytes) of cryptographically secure random data, base64url-encoded

### Requirement: Loopback callback listener handles success and error cases

The CLI SHALL start an `http://127.0.0.1:<port>/callback` listener using `--port` if provided, else a free port. The listener SHALL respond 200 to a request with both `code` and `state`, SHALL respond 400 to a request whose query carries `error`, and SHALL respond 400 to a request missing `code` or `state`.

#### Scenario: Authorization server redirects with code and state

- **WHEN** the browser is redirected to `/callback?code=abc&state=<our-state>`
- **THEN** the listener SHALL respond 200 and surface `(code, state)` to the flow

#### Scenario: Authorization server redirects with error

- **WHEN** the browser is redirected to `/callback?error=access_denied`
- **THEN** the listener SHALL respond 400 and the CLI SHALL exit non-zero with the OAuth `error` value in the message

#### Scenario: Callback never arrives within --timeout

- **GIVEN** `--timeout 60000`
- **WHEN** no callback is received within 60 seconds
- **THEN** the CLI SHALL exit non-zero with a timeout message naming the elapsed budget

#### Scenario: User-supplied --port is already bound

- **GIVEN** the user runs `ark mcp auth login <name> --port 8080`
- **AND** port 8080 is already in use on the loopback interface
- **THEN** the CLI SHALL exit non-zero with an error message naming the port and suggesting the user omit `--port` to let the OS pick a free port
- **AND** SHALL NOT silently fall back to auto-selection

### Requirement: Dynamic Client Registration enforces the loopback redirect URI

The CLI SHALL POST to `status.authorization.registrationEndpoint` with `client_name=ark mcp auth`, `redirect_uris=[<loopback>]`, `grant_types=["authorization_code","refresh_token"]`, `response_types=["code"]`, and `token_endpoint_auth_method=client_secret_basic`. If the registration response includes `redirect_uris` and the loopback URI is absent, the CLI SHALL reject the registration and exit non-zero before continuing.

#### Scenario: Registration endpoint omits the loopback URI

- **GIVEN** the registration endpoint returns a `redirect_uris` array that does not include the loopback URL
- **THEN** the CLI SHALL exit non-zero with an error naming the offending response

#### Scenario: Registration response omits redirect_uris entirely

- **GIVEN** the registration response does not include `redirect_uris` at all
- **THEN** the CLI SHALL exit non-zero with the same loopback-enforcement error — fail-closed since we cannot confirm the loopback URL was registered

### Requirement: DCR response uses a supported token_endpoint_auth_method

The CLI registers with `token_endpoint_auth_method: client_secret_basic`. If the registration response advertises a different `token_endpoint_auth_method` that is neither `client_secret_basic` nor `none`, the CLI SHALL exit non-zero with an error naming the unsupported method.

#### Scenario: Registration endpoint returns token_endpoint_auth_method=client_secret_post

- **GIVEN** the registration response sets `token_endpoint_auth_method: "client_secret_post"`
- **THEN** the CLI SHALL exit non-zero with an error naming the unsupported method

### Requirement: Authorization request includes PKCE S256 and resource indicator

The CLI SHALL build the authorization URL with `response_type=code`, `client_id`, `redirect_uri=<loopback>`, generated `state`, S256 `code_challenge` and `code_challenge_method=S256`, and `resource=<MCP URL>` per RFC 8707. `scope` SHALL be included only when supplied.

#### Scenario: Authorization URL is constructed for an MCP at https://mcp.example/mcp

- **WHEN** the CLI builds the authorization URL for an MCP whose discovered resource is `https://mcp.example/mcp`
- **THEN** the URL SHALL include `code_challenge_method=S256`, the matching `code_challenge`, and `resource=https%3A%2F%2Fmcp.example%2Fmcp`

### Requirement: State parameter is verified before token exchange

The CLI SHALL refuse to exchange a code unless the returned `state` exactly matches the value the CLI generated.

#### Scenario: Callback returns a tampered state

- **WHEN** `/callback` arrives with a `state` value the CLI did not generate
- **THEN** the CLI SHALL exit non-zero before posting to the token endpoint

### Requirement: Token exchange uses HTTP Basic auth and PKCE verifier

The CLI SHALL POST to `status.authorization.tokenEndpoint` with `grant_type=authorization_code`, `code`, `redirect_uri=<loopback>`, `code_verifier`, and `resource=<MCP URL>`, authenticating via HTTP Basic with the registered `client_id` / `client_secret`. On non-2xx the CLI SHALL surface the OAuth error verbatim.

#### Scenario: Token endpoint returns 400 invalid_grant

- **WHEN** the token endpoint returns `{"error":"invalid_grant"}` with HTTP 400
- **THEN** the CLI SHALL exit non-zero and the error message SHALL include `invalid_grant`

### Requirement: Tokens are written to the Secret using the configured key names

The CLI SHALL write the token endpoint response into the Secret named in `spec.authorization.tokenSecretRef.name` using the key names from the same `tokenSecretRef` (defaults `access_token`, `refresh_token`, `expires_at`, `client_id`, `client_secret`). When `expires_in` is present the CLI SHALL write `expires_at = now + expires_in - 30s` (RFC 3339 UTC). The CLI SHALL omit any key whose value is empty or absent. Missing Secret → create; existing Secret → patch.

#### Scenario: Token response carries access, refresh, and expires_in

- **GIVEN** the token endpoint returns `{access_token, refresh_token, expires_in: 3600}`
- **THEN** the patched Secret SHALL contain `access_token`, `refresh_token`, `expires_at` set to `now + 3600s - 30s` (RFC 3339 UTC), `client_id`, and `client_secret`

#### Scenario: Token response omits refresh_token

- **GIVEN** the token endpoint returns no `refresh_token`
- **THEN** the patched Secret SHALL NOT contain a `refresh_token` key

#### Scenario: User has overridden accessTokenKey on tokenSecretRef

- **GIVEN** `spec.authorization.tokenSecretRef.accessTokenKey = MY_ACCESS_TOKEN`
- **WHEN** tokens are written
- **THEN** the patched Secret SHALL store the access token under `MY_ACCESS_TOKEN`

#### Scenario: Token response omits expires_in or sets it ≤ 0

- **GIVEN** the token endpoint returns no `expires_in` (or `expires_in <= 0`)
- **THEN** the patched Secret SHALL NOT contain an `expires_at` key
- **AND** the CLI SHALL emit a single warning line indicating the token has no advertised lifetime

### Requirement: Secrets and tokens never appear in logs

The CLI SHALL never log access tokens, refresh tokens, client secrets, or `Authorization` headers. Diagnostic output SHALL be limited to: resource URL, chosen loopback port, registered `client_id`, computed `expires_at`, and high-level state transitions.

#### Scenario: Successful run

- **WHEN** `ark mcp auth login` succeeds
- **THEN** stdout/stderr SHALL contain the resource URL and `expires_at` but SHALL NOT contain access or refresh token values

### Requirement: Failures exit non-zero with a single error line

Every failure path SHALL exit non-zero with one `output.error("mcp auth failed:", <message>)` line — never a raw stack trace.

#### Scenario: Token exchange fails

- **WHEN** the token endpoint returns 400
- **THEN** the process SHALL exit non-zero and stderr SHALL contain exactly one `mcp auth failed:` line

### Requirement: ark-cli exposes an `mcp auth logout` subcommand

The CLI SHALL expose `ark mcp auth logout <server-name>` that empties (or deletes) the Secret named on `spec.authorization.tokenSecretRef`, returning the MCPServer to a state where `ark mcp auth login <server-name>` can run cleanly. The command SHALL accept `--namespace`, `--keep-client`, and `--delete-secret`. By default the CLI SHALL `kubectl patch` the Secret so `access_token`, `refresh_token`, `expires_at`, `client_id`, and `client_secret` (or their `*Key`-overridden names) all hold empty strings, leaving the Secret resource itself in place. `--keep-client` SHALL empty only `access_token`, `refresh_token`, and `expires_at`, preserving `client_id` and `client_secret` so a follow-up `login` re-uses the registered DCR client. `--delete-secret` SHALL `kubectl delete secret <name>` instead of patching. `--keep-client` and `--delete-secret` SHALL be mutually exclusive.

#### Scenario: User logs out of an Authorized MCPServer

- **GIVEN** an MCPServer whose state is `Authorized` and whose Secret carries all five token+client keys
- **WHEN** the user runs `ark mcp auth logout <name>`
- **THEN** the patched Secret SHALL contain empty values for `access_token`, `refresh_token`, `expires_at`, `client_id`, `client_secret`

#### Scenario: User passes --keep-client

- **GIVEN** an Authorized MCPServer with all five keys populated
- **WHEN** the user runs `ark mcp auth logout <name> --keep-client`
- **THEN** the patched Secret SHALL contain empty `access_token`, `refresh_token`, `expires_at`
- **AND** the patched Secret SHALL still contain the original `client_id` and `client_secret` values

#### Scenario: User passes --delete-secret

- **WHEN** the user runs `ark mcp auth logout <name> --delete-secret`
- **THEN** the CLI SHALL `kubectl delete secret <referenced-name>` and exit zero

#### Scenario: User passes both --keep-client and --delete-secret

- **WHEN** the user runs `ark mcp auth logout <name> --keep-client --delete-secret`
- **THEN** the CLI SHALL exit non-zero before contacting the cluster, naming the conflict between the two flags

### Requirement: Logout honours overridden key names

The CLI SHALL operate on the overridden key names from `spec.authorization.tokenSecretRef` rather than the defaults whenever any of `accessTokenKey`, `refreshTokenKey`, `expiresAtKey`, `clientIDKey`, or `clientSecretKey` is set. With `--keep-client`, the CLI SHALL empty only the overridden access-token, refresh-token, and expires-at keys.

#### Scenario: tokenSecretRef has accessTokenKey override

- **GIVEN** `spec.authorization.tokenSecretRef.accessTokenKey = MY_ACCESS_TOKEN`
- **WHEN** the user runs `ark mcp auth logout <name>`
- **THEN** the patched Secret SHALL have `MY_ACCESS_TOKEN` set to empty (and SHALL NOT add an `access_token` key)

### Requirement: Logout is idempotent against a missing Secret

When the referenced Secret does not exist, the CLI SHALL exit zero with a no-op message. When the MCPServer itself does not exist, the CLI SHALL exit non-zero.

#### Scenario: Secret named in tokenSecretRef does not exist

- **GIVEN** the MCPServer's Secret has been deleted out of band
- **WHEN** the user runs `ark mcp auth logout <name>`
- **THEN** the CLI SHALL exit zero with a one-line message indicating no-op

#### Scenario: MCPServer does not exist

- **WHEN** the user runs `ark mcp auth logout does-not-exist`
- **THEN** the CLI SHALL exit non-zero with an error

### Requirement: Logout never logs token material

The CLI SHALL never log access tokens, refresh tokens, client secrets, or `Authorization` headers during a logout run. Logout reads the Secret only to construct the patch payload; diagnostic output SHALL be limited to the Secret name, the keys cleared (or that the Secret was deleted), and a hint to re-run `ark mcp auth login <server-name>`.

#### Scenario: Successful logout

- **WHEN** `ark mcp auth logout <name>` succeeds against a populated Secret
- **THEN** stdout/stderr SHALL name the cleared keys but SHALL NOT contain any token, refresh-token, or client-secret value

