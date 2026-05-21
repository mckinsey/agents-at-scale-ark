## ADDED Requirements

### Requirement: ark-api exposes POST /auth/start to initiate an authorization flow

ark-api SHALL expose `POST /api/v1/mcp-servers/{name}/auth/start` to initiate an OAuth 2.1 authorization flow for the referenced `MCPServer` and SHALL return `{ auth_id, authorization_url, flow_expires_at }`. `flow_expires_at` is the cache-entry deadline and SHALL NOT be confused with the token-expiry `expires_at` field returned by `auth/status` — they are intentionally distinct field names so callers don't conflate the two lifetimes. Namespace resolution follows the cross-cutting [Namespace resolution requirement](#requirement-namespace-resolution-prefers-explicit-query-parameter).

The endpoint's response status codes SHALL be drawn from the following matrix; each row is enforced by a requirement and scenario elsewhere in this spec:

| Status | Cause | Owning requirement |
|---|---|---|
| 200 | Flow initiated; body carries `{ auth_id, authorization_url, flow_expires_at }` | this requirement |
| 404 | MCPServer not found in the resolved namespace | this requirement (scenario below) |
| 409 | MCPServer is `Authorized` and no `force: true`; OR `status.authorization` is entirely absent | [auth/start refuses non-Required state without force](#requirement-authstart-refuses-non-required-state-without-force); [auth/start refuses when authorization metadata is missing](#requirement-authstart-refuses-when-authorization-metadata-is-missing-from-the-mcpserver) |
| 422 | MCPServer is `DiscoveryFailed`; OR `spec.authorization` is unset; OR `registrationEndpoint` is empty AND the Secret carries no cached `client_id` / `client_secret` | [auth/start refuses non-Required state without force](#requirement-authstart-refuses-non-required-state-without-force); [auth/start refuses when authorization metadata is missing](#requirement-authstart-refuses-when-authorization-metadata-is-missing-from-the-mcpserver); [auth/start fails closed when no client credentials and no registration endpoint](#requirement-authstart-fails-closed-when-no-client-credentials-and-no-registration-endpoint) |
| 502 | DCR response violates the contract (missing redirect URI, unsupported `token_endpoint_auth_method`) | [Dynamic Client Registration enforces the configured redirect URI](#requirement-dynamic-client-registration-enforces-the-configured-redirect-uri) |
| 503 | `ARK_API_PUBLIC_CALLBACK_URL` is unset at boot | this requirement (scenario below) |

The behaviour of every status code SHALL match the owning requirement; this table is non-normative and exists to surface the matrix in one place for implementers.

- **GIVEN** ark-api starts with `ARK_API_PUBLIC_CALLBACK_URL` unset
- **WHEN** a client calls `POST /api/v1/mcp-servers/{name}/auth/start`
- **THEN** the endpoint SHALL return HTTP 503 with a message naming the missing configuration
- **AND** SHALL NOT contact the IdP

#### Scenario: auth/start is invoked for an unknown MCPServer

- **WHEN** `POST /api/v1/mcp-servers/{name}/auth/start` is called with `{name}` referencing a non-existent MCPServer in the resolved namespace
- **THEN** the endpoint SHALL return HTTP 404 with a clear error body

### Requirement: Auth endpoints inherit ark-api's trust boundary

The four auth endpoints (`auth/start`, `auth/callback`, `auth/status`, `auth/logout`) SHALL NOT introduce a new inbound-authentication contract. They inherit the same trust boundary as every other route on ark-api: cluster-internal Service access, optionally fronted by an authenticating gateway operated alongside ark-api. Any caller that can reach ark-api can drive a flow for any MCPServer in any namespace ark-api serves. End-user-identity authentication on these endpoints is owned by the future `mcp-auth-dashboard` capability.

#### Scenario: Operator exposes ark-api beyond the cluster without a fronting auth proxy

- **GIVEN** an operator publishes ark-api to a public ingress without an authenticating gateway in front
- **WHEN** an unauthenticated caller hits `POST /api/v1/mcp-servers/{name}/auth/logout` with `{ "delete_secret": true }`
- **THEN** ark-api SHALL service the request — the trust boundary is the operator's responsibility, not this endpoint's
- **AND** the deployment guide SHALL document this as an operator concern

### Requirement: ark-api exposes GET /mcp/auth/callback as the registered OAuth redirect URI

ark-api SHALL expose `GET /api/v1/mcp/auth/callback` as the registered OAuth `redirect_uri`. The endpoint SHALL receive `?code` / `?error` from the IdP, perform the token exchange, patch the Secret, and render an HTML completion page. Unlike the other auth endpoints, this path SHALL NOT include an `{name}` segment — the in-flight cache entry referenced by `state` resolves the target MCPServer.

#### Scenario: Callback is reachable without an MCPServer name in the path

- **WHEN** the IdP redirects the user-agent to `/api/v1/mcp/auth/callback?code=...&state=...`
- **THEN** ark-api SHALL service the request without requiring an `{name}` path segment
- **AND** SHALL resolve the target MCPServer by looking up the cache entry keyed on `state`

### Requirement: auth/start refuses non-Required state without force

`POST /api/v1/mcp-servers/{name}/auth/start` SHALL read the target MCPServer and refuse to run unless `status.authorization.state == Required`. The caller MAY override `Authorized` by passing `force: true` in the body. `force` SHALL bypass the `Authorized` pre-flight only; every other invariant (Secret integrity on flow failure, state verification, DCR enforcement) SHALL continue to hold. `force` SHALL NOT bypass the `DiscoveryFailed` pre-flight — in that state `status.authorization.registrationEndpoint` and `tokenEndpoint` are empty and the flow has no path forward.

#### Scenario: MCPServer is already Authorized

- **GIVEN** an `MCPServer` whose `status.authorization.state` is `Authorized`
- **WHEN** the caller invokes `auth/start` with no `force` flag
- **THEN** ark-api SHALL return HTTP 409 with a body explaining that the server is already authorized

#### Scenario: Caller passes force on an Authorized MCPServer

- **WHEN** the caller invokes `auth/start` with `force: true`
- **THEN** ark-api SHALL run the full flow regardless of state

#### Scenario: MCPServer is in DiscoveryFailed

- **GIVEN** an `MCPServer` whose `status.authorization.state` is `DiscoveryFailed`
- **WHEN** the caller invokes `auth/start` with or without `force: true`
- **THEN** ark-api SHALL return HTTP 422 with a message naming the missing RFC 9728 metadata and pointing the operator at the controller's discovery probe
- **AND** SHALL NOT contact the IdP — `force` SHALL NOT bypass `DiscoveryFailed` because the registration / token endpoints are empty

#### Scenario: force flag fails mid-flow

- **GIVEN** an MCPServer in state `Authorized` whose Secret carries valid tokens
- **AND** the caller invokes `auth/start` with `force: true`
- **WHEN** any step of the flow fails (DCR rejected, callback never arrives, token exchange 4xx, etc.)
- **THEN** the existing Secret SHALL be left unchanged — `force` only bypasses the pre-flight guard, it never weakens the "Secret untouched on flow failure" invariant

### Requirement: auth/start refuses when authorization metadata is missing from the MCPServer

`POST /api/v1/mcp-servers/{name}/auth/start` SHALL refuse the request when the target MCPServer lacks the metadata required to drive a flow. Two cases:

- `spec.authorization` is unset (no `tokenSecretRef` to write into): ark-api SHALL return HTTP 422 with a message instructing the operator to add `spec.authorization.tokenSecretRef`. `force` SHALL NOT bypass this — there is nowhere to write the resulting tokens.
- `status.authorization` is entirely absent (the controller has not yet observed a 401 from the upstream, or `spec.authorization` was just added and no reconcile has run): ark-api SHALL return HTTP 409 with a message naming the missing discovery output and pointing the operator at the controller's poll interval. `force` SHALL NOT bypass this — without `tokenEndpoint` / `authorizationEndpoint` / `resource` the flow has no path forward. This case is distinct from `DiscoveryFailed`, which records a probe that ran and failed.

#### Scenario: MCPServer has no spec.authorization

- **GIVEN** an `MCPServer` whose `spec.authorization` is unset
- **WHEN** the caller invokes `auth/start` with or without `force: true`
- **THEN** ark-api SHALL return HTTP 422 with a message naming `spec.authorization.tokenSecretRef` as the missing input
- **AND** SHALL NOT contact the IdP

#### Scenario: MCPServer has no status.authorization yet

- **GIVEN** an `MCPServer` whose `spec.authorization` is set but `status.authorization` is entirely absent (controller has not yet discovered)
- **WHEN** the caller invokes `auth/start` with or without `force: true`
- **THEN** ark-api SHALL return HTTP 409 with a message naming the missing discovery output and the `spec.pollInterval` the operator can wait on
- **AND** SHALL NOT contact the IdP

### Requirement: Namespace resolution prefers explicit query parameter

The CLI client SHALL resolve namespace as: `--namespace` flag if set, else the `namespace` field on the active context in the user's kubeconfig file (parsed directly from disk, never via a `kubectl config view` shell-out), else `default`. The resolved value SHALL be passed as the `namespace` query parameter to ark-api. ark-api SHALL accept the parameter and SHALL fall back to its own pod-context namespace (via `with_ark_client(None, ...)`) when the caller omits the parameter — matching every other ark-api route.

#### Scenario: CLI passes --namespace explicitly

- **WHEN** the user runs `ark mcp auth login <name> --namespace tenant-a`
- **THEN** the CLI SHALL include `?namespace=tenant-a` on every ark-api call

#### Scenario: --namespace omitted, kubectl context has a namespace

- **GIVEN** the active `kubectl` context has `namespace: tenant-a` configured
- **WHEN** the user runs `ark mcp auth login <name>` with no `--namespace` flag
- **THEN** the CLI SHALL include `?namespace=tenant-a` on every ark-api call

#### Scenario: kubectl context has no namespace

- **GIVEN** the active `kubectl` context has no namespace configured
- **WHEN** the user omits `--namespace`
- **THEN** the CLI SHALL include `?namespace=default` on every ark-api call

#### Scenario: Non-CLI caller omits ?namespace= entirely

- **GIVEN** a caller other than `ark mcp auth …` (e.g., curl, an integration script, or any other future client) invokes any of the auth endpoints with no `?namespace=` query parameter
- **WHEN** ark-api processes the request
- **THEN** ark-api SHALL resolve the namespace from its own pod context via `with_ark_client(None, ...)` — the same fallback every other ark-api route uses
- **AND** SHALL NOT reject the request for missing `?namespace=`

### Requirement: PKCE primitives meet RFC 7636 S256

ark-api SHALL generate a PKCE code verifier of 43-128 unreserved characters and an S256-derived challenge, plus a cryptographically random opaque `state` and `auth_id`. The verifier SHALL never leave ark-api; the challenge SHALL accompany the authorization URL; the `state` SHALL be returned to the caller indirectly via the `authorization_url` only.

#### Scenario: Verifier and challenge are derived correctly

- **WHEN** ark-api builds an authorization URL
- **THEN** the verifier SHALL contain only `[A-Za-z0-9-._~]`, SHALL be 43-128 chars, and the challenge SHALL equal `BASE64URL(SHA-256(verifier))`

#### Scenario: Default lengths balance entropy and compatibility

- **WHEN** ark-api generates the verifier, state, and auth_id with no overrides
- **THEN** the verifier SHALL be 64 characters from the unreserved set
- **AND** the `state` SHALL be at least 128 bits (16 bytes) of cryptographically secure random data, base64url-encoded
- **AND** the `auth_id` SHALL be at least 128 bits (16 bytes) of cryptographically secure random data, base64url-encoded — a guessable `auth_id` would let any caller on the same ark-api observe flow state transitions for any in-flight authorization

### Requirement: ark-api owns a stable, install-scoped redirect URI

The OAuth `redirect_uri` registered with the IdP SHALL be derived from the `ARK_API_PUBLIC_CALLBACK_URL` environment variable plus the path `/api/v1/mcp/auth/callback`. The URL SHALL use HTTPS unless the host is `127.0.0.1`, `[::1]`, or `localhost` (RFC 8252 §7.3 carve-out for port-forward / air-gapped operation). IPv6 loopback literals SHALL be bracketed per RFC 3986 §3.2.2 (`[::1]`), and ark-api SHALL accept the bracketed form without unwrapping or canonicalising it.

#### Scenario: ARK_API_PUBLIC_CALLBACK_URL is set to a non-HTTPS public host

- **GIVEN** `ARK_API_PUBLIC_CALLBACK_URL=http://ark.example.com/api/v1/mcp/auth/callback`
- **WHEN** ark-api starts
- **THEN** ark-api SHALL refuse to start and SHALL log a configuration error

#### Scenario: ARK_API_PUBLIC_CALLBACK_URL is set to http on a loopback host

- **GIVEN** `ARK_API_PUBLIC_CALLBACK_URL=http://127.0.0.1:8080/api/v1/mcp/auth/callback`
- **WHEN** ark-api starts
- **THEN** ark-api SHALL accept the configuration

#### Scenario: ARK_API_PUBLIC_CALLBACK_URL is set to http on an IPv6 loopback host

- **GIVEN** `ARK_API_PUBLIC_CALLBACK_URL=http://[::1]:8080/api/v1/mcp/auth/callback`
- **WHEN** ark-api starts
- **THEN** ark-api SHALL accept the configuration
- **AND** SHALL register the bracketed literal `[::1]` verbatim with the IdP at DCR time (no unwrapping, no canonicalisation to `127.0.0.1`)

#### Scenario: ARK_API_PUBLIC_CALLBACK_URL uses an unbracketed IPv6 literal

- **GIVEN** `ARK_API_PUBLIC_CALLBACK_URL=http://::1:8080/api/v1/mcp/auth/callback`
- **WHEN** ark-api starts
- **THEN** ark-api SHALL refuse to start and SHALL log a configuration error naming RFC 3986 §3.2.2 (IPv6 literals must be bracketed)

#### Scenario: ARK_API_PUBLIC_CALLBACK_URL does not include the callback path

- **GIVEN** `ARK_API_PUBLIC_CALLBACK_URL=https://ark.example.com`
- **WHEN** ark-api builds the redirect URI for DCR
- **THEN** ark-api SHALL append `/api/v1/mcp/auth/callback` to form the registered URL

### Requirement: Dynamic Client Registration enforces the configured redirect URI

ark-api SHALL POST to `status.authorization.registrationEndpoint` with `client_name=ark`, `redirect_uris=[<configured redirect URI>]`, `grant_types=["authorization_code","refresh_token"]`, `response_types=["code"]`, and `token_endpoint_auth_method=client_secret_basic`. If the registration response includes `redirect_uris` and the configured URI is absent, ark-api SHALL reject the registration and fail the flow before continuing.

#### Scenario: Registration endpoint omits the configured redirect URI

- **GIVEN** the registration endpoint returns a `redirect_uris` array that does not include ark-api's URL
- **THEN** ark-api SHALL return HTTP 502 with an error naming the offending response — DCR runs before cache-entry creation, so no cache entry exists yet to transition

#### Scenario: Registration response omits redirect_uris entirely

- **GIVEN** the registration response does not include `redirect_uris` at all
- **THEN** ark-api SHALL fail-closed with the same enforcement error — ark-api cannot confirm the configured URI was registered

#### Scenario: DCR response uses an unsupported token_endpoint_auth_method

- **GIVEN** the registration response sets `token_endpoint_auth_method` to any value other than `client_secret_basic` (including `client_secret_post`, `none`, or any private-key-JWT variant)
- **THEN** ark-api SHALL fail the flow with an error naming the unsupported method
- **AND** SHALL accept only `client_secret_basic` as valid — public clients (`none`) are out of scope for this change because every MCP authorization server Ark targets today (Notion, GitHub, Atlassian) issues a confidential client; supporting `none` would add a second token-exchange code path with no production consumer

### Requirement: DCR is reused across logins when client credentials exist

ark-api SHALL perform DCR when any of the following holds:

- The Secret has no cached `client_id` or `client_secret` (under the configured key names), or either value is empty.
- The `auth/start` body sets `force_registration: true`.

Otherwise — both values cached and `force_registration` unset — ark-api SHALL reuse the cached credentials and SHALL skip DCR. On a successful exchange following DCR, ark-api SHALL persist the newly issued `client_id` and `client_secret` to the Secret, replacing any cached values. `force_registration` SHALL be orthogonal to `force`: it controls DCR reuse only and SHALL NOT bypass the `status.authorization.state == Required` pre-flight guard.

#### Scenario: Secret carries cached client credentials

- **GIVEN** the Secret contains non-empty `client_id` and `client_secret` keys
- **WHEN** `auth/start` is invoked
- **THEN** ark-api SHALL skip DCR and use the cached credentials for the subsequent token exchange

#### Scenario: Secret is missing client_secret

- **GIVEN** the Secret contains `client_id` but `client_secret` is empty
- **WHEN** `auth/start` is invoked
- **THEN** ark-api SHALL perform a fresh DCR (treating the cached `client_id` as invalid)

#### Scenario: Caller passes force_registration on a Secret with cached credentials

- **GIVEN** the Secret contains non-empty `client_id` and `client_secret` keys
- **WHEN** `auth/start` is invoked with `force_registration: true`
- **THEN** ark-api SHALL perform a fresh DCR against `status.authorization.registrationEndpoint`
- **AND** SHALL replace the cached `client_id` and `client_secret` with the newly issued values on a successful token exchange
- **AND** SHALL NOT touch the Secret on any pre-exchange failure (DCR rejected, callback never arrives, token exchange 4xx)

#### Scenario: force_registration without force on a non-Required MCPServer

- **GIVEN** an MCPServer whose `status.authorization.state` is `Authorized`
- **WHEN** the caller invokes `auth/start` with `force_registration: true` and no `force` flag
- **THEN** ark-api SHALL return HTTP 409 (pre-flight refusal) without performing DCR — `force_registration` does not bypass the state guard

### Requirement: auth/start fails closed when no client credentials and no registration endpoint

If `status.authorization.registrationEndpoint` is empty AND the Secret carries no cached `client_id` / `client_secret`, ark-api SHALL fail `auth/start` with HTTP 422 and a message naming the missing capability. ark-api SHALL NOT silently invent a redirect URI or call the token endpoint without a registered client. Operators of MCP servers that do not advertise a DCR endpoint MUST pre-populate the Secret with `client_id` / `client_secret` (a static-client recipe documented under the operator guide).

#### Scenario: No registration endpoint and no cached credentials

- **GIVEN** `status.authorization.registrationEndpoint` is empty
- **AND** the Secret carries empty / absent `client_id` and `client_secret`
- **WHEN** the caller invokes `auth/start`
- **THEN** ark-api SHALL return HTTP 422 with a message instructing the operator to pre-populate `client_id` / `client_secret` on the Secret
- **AND** SHALL NOT contact any IdP endpoint

#### Scenario: No registration endpoint but cached credentials exist

- **GIVEN** `status.authorization.registrationEndpoint` is empty
- **AND** the Secret carries non-empty `client_id` and `client_secret`
- **WHEN** the caller invokes `auth/start` without `force_registration`
- **THEN** ark-api SHALL proceed with the cached credentials and skip DCR

### Requirement: Authorization request includes PKCE S256 and resource indicator

ark-api SHALL build the authorization URL with `response_type=code`, the registered `client_id`, `redirect_uri=<configured URI>`, the generated `state`, the S256 `code_challenge` and `code_challenge_method=S256`, and `resource=<status.authorization.resource>` per RFC 8707 — the canonical RFC 9728 resource URI populated by the controller's discovery probe. `scope` SHALL be sourced as follows:

1. If the `auth/start` body sets `scopes` to a non-empty array, those values SHALL be used.
2. If the `auth/start` body sets `scopes` to an explicit empty array (`[]`), `scope` SHALL be omitted — the caller has explicitly opted out of scope negotiation; `status.authorization.scopesSupported` SHALL NOT be consulted.
3. If the `auth/start` body omits `scopes` entirely, ark-api SHALL fall back to `status.authorization.scopesSupported` when non-empty.
4. When none of the above yield values, `scope` SHALL be omitted.

Selected values SHALL be joined by single spaces per RFC 6749 §3.3.

#### Scenario: Authorization URL is constructed for an MCP at https://mcp.example/mcp

- **WHEN** ark-api builds the authorization URL for an MCP whose `status.authorization.resource` is `https://mcp.example/mcp`
- **THEN** the URL SHALL include `code_challenge_method=S256`, the matching `code_challenge`, and `resource=https%3A%2F%2Fmcp.example%2Fmcp`

#### Scenario: scopesSupported supplies the scope parameter

- **GIVEN** the `auth/start` body omits `scopes`
- **AND** `status.authorization.scopesSupported = ["read", "write"]`
- **WHEN** ark-api builds the authorization URL
- **THEN** the URL SHALL include `scope=read%20write`

#### Scenario: No scope source available

- **GIVEN** the `auth/start` body omits `scopes`
- **AND** `status.authorization.scopesSupported` is empty or absent
- **WHEN** ark-api builds the authorization URL
- **THEN** the URL SHALL omit the `scope` parameter

#### Scenario: Caller passes an explicit empty scopes array

- **GIVEN** the `auth/start` body sets `scopes: []`
- **AND** `status.authorization.scopesSupported = ["read", "write"]`
- **WHEN** ark-api builds the authorization URL
- **THEN** the URL SHALL omit the `scope` parameter — the explicit empty array is an opt-out and SHALL suppress the `scopesSupported` fallback

### Requirement: In-flight state is held in a TTL'd cache keyed by auth_id and state

ark-api SHALL maintain a cache of in-flight authorization flows. Each entry SHALL hold the PKCE verifier, generated `state`, MCPServer reference, registered `client_id` / `client_secret`, caller identity, creation timestamp, a terminal-state field (`pending` | `authorized` | `failed` | `expired`) initially set to `pending`, an optional `message` populated on transition to `failed`, and an optional token `expires_at` populated on transition to `authorized` when the IdP advertised a positive `expires_in`. Entries SHALL expire after `ARK_API_MCP_AUTH_CACHE_TTL_SECONDS` (default `600`). Entries SHALL be addressable by `auth_id` (returned to the caller of `auth/start`) and by `state` (presented by the IdP at the callback). On lookup from the callback path, the entry's `state` index SHALL be deleted so codes cannot be replayed against the same `state`. The `auth_id` index SHALL remain addressable until TTL elapses so callers polling `auth/status` after a successful exchange continue to observe the terminal state.

#### Scenario: Callback arrives with an unknown state

- **WHEN** `GET /api/v1/mcp/auth/callback` is hit with a `state` value the cache has never seen (or whose TTL has passed)
- **THEN** ark-api SHALL respond HTTP 400 with an HTML page explaining the flow expired and pointing the user back to `ark mcp auth login`

#### Scenario: Callback is replayed

- **GIVEN** `GET /api/v1/mcp/auth/callback?code=A&state=S` has already completed successfully
- **WHEN** the same `?code=A&state=S` is requested again
- **THEN** ark-api SHALL respond HTTP 400 (the cache entry's `state` index was deleted on first lookup)

#### Scenario: auth/status is polled after a successful exchange

- **GIVEN** the cache entry for `auth_id=A` is in the `authorized` terminal state
- **WHEN** the caller polls `GET /api/v1/mcp-servers/{name}/auth/status?auth_id=A` repeatedly within TTL
- **THEN** ark-api SHALL return the same `state: authorized` payload on every call until the entry ages out
- **AND** the entry SHALL NOT be reaped on first read

#### Scenario: Caller polls auth/status with an unknown auth_id (known MCPServer)

- **GIVEN** the MCPServer named in the path exists
- **WHEN** `GET /api/v1/mcp-servers/{name}/auth/status?auth_id=<unknown>` is invoked
- **THEN** ark-api SHALL return `{ state: "expired", message: <single line> }` rather than 404 — distinguishing "flow expired before completion" from "no such MCPServer"

#### Scenario: auth/status is invoked for an unknown MCPServer with any auth_id

- **GIVEN** the MCPServer named in the path does not exist in the resolved namespace
- **WHEN** `GET /api/v1/mcp-servers/{name}/auth/status?auth_id=<any>` is invoked
- **THEN** ark-api SHALL return HTTP 404 regardless of whether `auth_id` references a live cache entry — the MCPServer-existence check SHALL precede the cache lookup

#### Scenario: Two concurrent flows for the same MCPServer

- **GIVEN** two `auth/start` calls have been issued for the same MCPServer, producing distinct cache entries `auth_id=A` and `auth_id=B`
- **WHEN** the callbacks arrive in some order
- **THEN** ark-api SHALL service both — each `state` key maps to exactly one cache entry — and SHALL issue an independent Secret patch per successful exchange
- **AND** the losing flow's `auth/status` SHALL still report `authorized` against its own `auth_id` even though its tokens have been overwritten — this is observable and intentional given the shared-Secret model

Note: ordering between concurrent Secret patches is a property of the Kubernetes API server's last-write-wins semantics under strategic-merge patch, not of ark-api logic. The Secret's final contents reflect whichever patch lands last at the API server; ark-api does not serialize the patches.

### Requirement: State parameter is verified before token exchange

ark-api SHALL refuse to exchange a code unless the returned `state` exactly matches the value stored in the cache entry it was looked up under. (Lookup by `state` implies equality, but the entry SHALL additionally record the expected state to defend against future cache-implementation changes that loosen the lookup contract.)

#### Scenario: Callback returns a tampered state

- **WHEN** `/callback` arrives with a `state` value the cache does not recognise
- **THEN** ark-api SHALL respond HTTP 400 and SHALL NOT POST to the token endpoint

### Requirement: Callback endpoint handles IdP success and error responses

The `GET /api/v1/mcp/auth/callback` endpoint SHALL respond HTTP 200 with a "you can close this window" HTML page when both `code` and `state` are present and the cache lookup + token exchange succeed. It SHALL respond HTTP 400 with an HTML page naming the OAuth error when the IdP redirects with `error`. It SHALL respond HTTP 400 when `code` or `state` is missing entirely. Every IdP-supplied string interpolated into a rendered page (`error`, `error_description`, and any state echo) SHALL be HTML-escaped before being written into the response body — the IdP is an untrusted reflector and the operator's authenticating browser is the trust boundary that matters.

#### Scenario: Authorization server redirects with code and state

- **WHEN** the IdP redirects to `/callback?code=abc&state=<our-state>`
- **THEN** ark-api SHALL perform the token exchange, patch the Secret, and render the success HTML page
- **AND** the cache entry SHALL transition to `authorized`

#### Scenario: Authorization server redirects with error

- **WHEN** the IdP redirects to `/callback?error=access_denied`
- **THEN** ark-api SHALL render the failure HTML page with the OAuth error code in the body
- **AND** the cache entry SHALL transition to `failed` with `message="access_denied"`
- **AND** the Secret SHALL NOT be modified

#### Scenario: IdP returns an HTML-laced error_description

- **WHEN** the IdP redirects to `/callback?error=invalid_request&error_description=%3Cscript%3Ealert(1)%3C%2Fscript%3E`
- **THEN** the rendered HTML response body SHALL contain the literal text `<script>alert(1)</script>` (HTML-escaped to `&lt;script&gt;alert(1)&lt;/script&gt;`)
- **AND** SHALL NOT contain an executable `<script>` element

### Requirement: Token exchange uses HTTP Basic auth and PKCE verifier

ark-api SHALL POST to `status.authorization.tokenEndpoint` with `grant_type=authorization_code`, `code`, `redirect_uri=<configured URI>`, `code_verifier=<cache entry verifier>`, and `resource=<status.authorization.resource>` (same RFC 8707 value the authorization request carried), authenticating via HTTP Basic with the registered `client_id` / `client_secret` — the only `token_endpoint_auth_method` ark-api accepts from DCR. On non-2xx, ark-api SHALL transition the cache entry to `failed` and SHALL include the OAuth error verbatim in the cache entry's `message`.

#### Scenario: Token endpoint returns 400 invalid_grant

- **WHEN** the token endpoint returns `{"error":"invalid_grant"}` with HTTP 400
- **THEN** the cache entry SHALL transition to `failed`
- **AND** the cache entry's `message` SHALL include `invalid_grant`
- **AND** the Secret SHALL NOT be modified

### Requirement: Tokens are written to the Secret using the configured key names

ark-api SHALL write the token endpoint response into the Secret named in `spec.authorization.tokenSecretRef.name` using the key names from the same `tokenSecretRef` (defaults `access_token`, `refresh_token`, `expires_at`, `client_id`, `client_secret`). When `expires_in` is present and positive, ark-api SHALL write `expires_at = now + expires_in - 30s` (RFC 3339 UTC). ark-api SHALL omit any key whose value is empty or absent. A missing Secret SHALL be created; an existing Secret SHALL be patched. When ark-api creates or patches the Secret, it SHALL also set the label `ark.mckinsey.com/mcp-token-secret: "true"` on the Secret. The label exists so a future controller-side optimization (e.g. a real-time Secret watch) can filter token Secrets without inspecting their contents; it has no consumer on main today.

#### Scenario: Token response carries access, refresh, and expires_in

- **GIVEN** the token endpoint returns `{access_token, refresh_token, expires_in: 3600}`
- **THEN** the patched Secret SHALL contain `access_token`, `refresh_token`, `expires_at` set to `now + 3600s - 30s` (RFC 3339 UTC), `client_id`, and `client_secret`

#### Scenario: Token response omits refresh_token

- **GIVEN** the token endpoint returns no `refresh_token`
- **THEN** the patched Secret SHALL NOT contain a `refresh_token` key

#### Scenario: tokenSecretRef.accessTokenKey is overridden

- **GIVEN** `spec.authorization.tokenSecretRef.accessTokenKey = MY_ACCESS_TOKEN`
- **WHEN** tokens are written
- **THEN** the patched Secret SHALL store the access token under `MY_ACCESS_TOKEN`
- **AND** SHALL NOT add an `access_token` key

#### Scenario: Token response omits expires_in or sets it ≤ 0

- **GIVEN** the token endpoint returns no `expires_in` (or `expires_in <= 0`)
- **THEN** the patched Secret SHALL NOT contain an `expires_at` key
- **AND** ark-api SHALL emit a single warning-level log line indicating the token has no advertised lifetime
- **AND** the cache entry's `expires_at` field SHALL be absent

#### Scenario: Successful exchange stamps the mcp-token-secret label

- **WHEN** ark-api creates or patches the Secret on a successful exchange
- **THEN** the resulting Secret SHALL carry the label `ark.mckinsey.com/mcp-token-secret: "true"`

### Requirement: Successful exchange annotates the MCPServer with caller identity

On a successful token exchange, ark-api SHALL patch the MCPServer with two annotations:

- `ark.mckinsey.com/mcp-auth-authorized-by`: best-effort caller identity as observed by ark-api. In this change, every caller reaches ark-api over the in-cluster Service (typically via `ArkApiProxy`'s `kubectl port-forward`) with no inbound authentication, so this annotation SHALL be the literal string `cli`. Resolving end-user identity from an authenticated bearer token is gated on the inbound auth middleware introduced by the future `mcp-auth-dashboard` capability — that capability will widen this annotation to carry the resolved identity. Format is opaque to consumers and SHALL be displayed verbatim.
- `ark.mckinsey.com/mcp-auth-authorized-at`: RFC 3339 UTC timestamp of the exchange.

The annotations SHALL be replaced (not appended) on each successful exchange. The annotations are intended to surface the shared-token limitation (one Secret per MCPServer) — they do not change controller dispatch behaviour.

#### Scenario: CLI caller completes an exchange via ArkApiProxy

- **GIVEN** the request to `auth/start` arrived on the in-cluster Service path (via `ArkApiProxy`) with no inbound authentication
- **WHEN** the exchange completes successfully
- **THEN** the MCPServer SHALL be annotated `ark.mckinsey.com/mcp-auth-authorized-by: cli`
- **AND** the timestamp annotation SHALL be set to an RFC 3339 UTC value

#### Scenario: Future dashboard caller (deferred)

- **GIVEN** the `mcp-auth-dashboard` capability has landed and is providing inbound user-identity authentication
- **WHEN** an exchange initiated by an authenticated dashboard caller completes successfully
- **THEN** the `mcp-auth-authorized-by` annotation SHALL carry the resolved identity string — this scenario is documented here as the forward-compatibility contract; the implementation lives in `mcp-auth-dashboard` and SHALL NOT be tasked under this change

### Requirement: auth/status reports a terminal state only after the controller has reconciled

ark-api SHALL expose `GET /api/v1/mcp-servers/{name}/auth/status?auth_id=<id>` returning `{ state, message?, expires_at? }` where `state` is one of `pending`, `authorized`, `failed`, `expired`. The endpoint SHALL return `state: authorized` only when both conditions hold:

1. The cache entry for `auth_id` is in the `authorized` terminal state (token exchange succeeded, Secret patched).
2. The MCPServer's `status.authorization.state` has reconciled to `Authorized`.

If only (1) holds, the endpoint SHALL return `state: pending` with a message indicating the controller is still reconciling. This is the "honest completion signal" that ensures `ark mcp auth login` only exits success when the system as a whole is in the `Authorized` state. For non-authorized cache states the **cache wins** regardless of the MCPServer's controller-reconciled state: `failed` is reported as `failed` and an unknown-or-expired `auth_id` is reported as `expired`, both regardless of whether the MCPServer happens to be `Authorized` (a previous flow may have already populated valid tokens). Namespace resolution follows the cross-cutting [Namespace resolution requirement](#requirement-namespace-resolution-prefers-explicit-query-parameter).

#### Scenario: auth/status is invoked for an unknown MCPServer

- **WHEN** `GET /api/v1/mcp-servers/{name}/auth/status` is called with `{name}` referencing a non-existent MCPServer in the resolved namespace
- **THEN** the endpoint SHALL return HTTP 404 with a clear error body

#### Scenario: Token exchange completes, controller has not yet reconciled

- **GIVEN** the cache entry is in `authorized` state
- **AND** `MCPServer.status.authorization.state` is still `Required`
- **WHEN** the caller polls `auth/status`
- **THEN** the response SHALL be `{ state: "pending", message: "<reconciling>" }`

#### Scenario: Controller reconciles to Authorized

- **GIVEN** the cache entry is in `authorized` state
- **AND** `MCPServer.status.authorization.state` has flipped to `Authorized`
- **WHEN** the caller polls `auth/status`
- **THEN** the response SHALL be `{ state: "authorized", expires_at: <RFC 3339> }` (token expiry, not the cache-entry deadline returned by `auth/start`)

#### Scenario: Cache failed but MCPServer happens to be Authorized

- **GIVEN** the cache entry for this `auth_id` is in `failed` state (e.g. `invalid_grant` on this attempt)
- **AND** `MCPServer.status.authorization.state` is `Authorized` from a prior successful flow
- **WHEN** the caller polls `auth/status`
- **THEN** the response SHALL be `{ state: "failed", message: "invalid_grant" }` — the cache state of *this* flow wins; the MCPServer reflects an earlier flow's outcome and is not relevant to this caller's poll

#### Scenario: Cache expired but MCPServer happens to be Authorized

- **GIVEN** the cache entry for this `auth_id` has aged out
- **AND** `MCPServer.status.authorization.state` is `Authorized`
- **WHEN** the caller polls `auth/status`
- **THEN** the response SHALL be `{ state: "expired", message: <single line> }` — the caller must restart their own flow even if another caller has already authorized the server

### Requirement: ark-api never logs OAuth credentials or inbound Authorization headers

ark-api SHALL never log access tokens, refresh tokens, `client_secret`, PKCE verifiers, or the value of any inbound `Authorization` header. Diagnostic output SHALL be limited to: MCPServer name and namespace, resource URL, registered `client_id`, computed `expires_at`, opaque `auth_id`, and high-level state transitions of the in-flight cache entry.

#### Scenario: Callback handler completes an exchange

- **WHEN** the callback handler completes a successful token exchange
- **THEN** the ark-api logs SHALL contain the MCPServer name, the registered `client_id`, the computed `expires_at`, and the resulting cache state transition
- **AND** SHALL NOT contain access-token, refresh-token, `client_secret`, or PKCE-verifier values

#### Scenario: Request carries a user-identity bearer token

- **WHEN** any auth endpoint receives a request with an `Authorization` header
- **THEN** the ark-api logs SHALL NOT contain the header value
- **AND** no resolved identity string SHALL appear in logs under this change — identity resolution is gated on the inbound auth middleware introduced by `mcp-auth-dashboard`; once that lands, a resolved identity string MAY appear in logs per the `authorized-by` annotation contract

### Requirement: ark-cli emits only non-sensitive flow context to stdout/stderr

The CLI never receives access tokens, refresh tokens, `client_secret`, or PKCE verifiers — those live exclusively in ark-api memory and the target Secret. The CLI's stdout/stderr SHALL be limited to fields it actually holds: the resolved MCPServer name and namespace, the `authorization_url` returned by `auth/start`, the opaque `auth_id`, the computed `expires_at`, and high-level state transitions reported by `auth/status` (including the single-line error from [the failure-surfacing requirement](#requirement-failures-surface-as-a-single-error-line-on-the-cli)).

#### Scenario: Successful run from the CLI

- **WHEN** `ark mcp auth login` succeeds end-to-end
- **THEN** stdout/stderr SHALL contain the `authorization_url` and `expires_at`
- **AND** SHALL NOT contain any field beyond those returned by `auth/start` and `auth/status`

#### Scenario: CLI debug logging is enabled

- **GIVEN** the CLI is run with verbose/debug HTTP logging enabled
- **WHEN** the CLI sends a request to ark-api
- **THEN** the emitted log lines SHALL NOT contain the value of any `Authorization` header the CLI forwarded

### Requirement: Failures surface as a single error line on the CLI

Every failure path of `ark mcp auth login` SHALL exit non-zero with one `output.error("mcp auth failed:", <message>)` line — never a raw stack trace. The message SHALL be sourced from the ark-api response body (or the cache entry's `message` field on a poll-detected failure), trimmed and single-line.

#### Scenario: Token exchange fails

- **WHEN** ark-api returns a `failed` state with message `invalid_grant`
- **THEN** the CLI process SHALL exit non-zero
- **AND** stderr SHALL contain exactly one line: `mcp auth failed: invalid_grant`

#### Scenario: Poll loop times out

- **GIVEN** the user passed `--timeout 60s`
- **WHEN** no terminal state is observed within 60 seconds
- **THEN** the CLI SHALL exit non-zero with `mcp auth failed: timeout waiting for authorization (60s)`

### Requirement: ark-cli exposes mcp auth login as a thin client

The Ark CLI SHALL expose `ark mcp auth login <server-name>` accepting `--namespace`, `--force`, `--force-registration`, `--no-open`, and `--timeout <duration>`. `--force` SHALL map to `force: true` in the `auth/start` request body (bypassing the `status.authorization.state == Required` preflight). `--force-registration` SHALL map to `force_registration: true` in the same body (forcing a fresh RFC 7591 DCR even when the Secret carries cached `client_id` / `client_secret`). The two flags SHALL be orthogonal — passing `--force-registration` without `--force` SHALL NOT bypass the preflight, and the CLI SHALL surface the resulting 409 verbatim. `--timeout` SHALL be a Go-duration string and SHALL reject non-parseable or non-positive values; default is `5m`. The CLI SHALL NOT accept a `--port` flag — no loopback listener exists. The CLI SHALL drive the flow as: `POST /auth/start` → open browser (unless `--no-open`) → poll `GET /auth/status` every 2s until a terminal state or timeout. The CLI SHALL always print the returned `authorization_url` to stdout regardless of `--no-open`.

#### Scenario: User runs ark mcp auth login against a Required MCPServer

- **GIVEN** an `MCPServer` named `notion` whose `status.authorization.state` is `Required`
- **WHEN** the user runs `ark mcp auth login notion`
- **THEN** the CLI SHALL POST to `/auth/start`, print the returned `authorization_url`, open it in the default browser, and poll `/auth/status` until `authorized`

#### Scenario: User passes an unparseable timeout

- **WHEN** the user runs `ark mcp auth login notion --timeout abc`
- **THEN** the CLI SHALL exit non-zero with a message naming `--timeout` and the offending value
- **AND** SHALL NOT contact ark-api

#### Scenario: --no-open suppresses browser launch

- **GIVEN** the user runs `ark mcp auth login <name> --no-open`
- **THEN** the CLI SHALL print the full authorization URL to stdout
- **AND** SHALL NOT spawn a browser process
- **AND** SHALL continue polling `/auth/status` in the normal way

Note: this follows the CLI's `--no-X` convention — every boolean flag whose default is "yes, do X" supports a corresponding `--no-X` to opt out.

#### Scenario: --force-registration triggers a fresh DCR

- **GIVEN** an MCPServer whose `status.authorization.state` is `Required` and whose Secret already carries non-empty `client_id` / `client_secret`
- **WHEN** the user runs `ark mcp auth login <name> --force-registration`
- **THEN** the CLI SHALL send `force_registration: true` in the `auth/start` body
- **AND** ark-api SHALL perform a fresh DCR and replace the cached credentials on a successful exchange

#### Scenario: --force-registration without --force on a non-Required MCPServer

- **GIVEN** an MCPServer whose `status.authorization.state` is `Authorized`
- **WHEN** the user runs `ark mcp auth login <name> --force-registration`
- **THEN** the CLI SHALL send `force_registration: true` with no `force`
- **AND** the CLI SHALL exit non-zero on the resulting HTTP 409 — `--force-registration` does not bypass the state guard

#### Scenario: Poll budget elapses

- **GIVEN** `--timeout 60s`
- **WHEN** no callback is received within 60 seconds
- **THEN** the CLI SHALL exit non-zero with a timeout message naming the elapsed budget
- **AND** the ark-api cache entry SHALL continue to age out under its own TTL — the CLI SHALL NOT request cleanup explicitly

### Requirement: ark-cli does not call kubectl for auth flows

The CLI SHALL route every auth operation through the existing `ArkApiProxy`. The CLI SHALL NOT shell out to `kubectl` to read MCPServers, read Secrets, patch Secrets, or create Secrets in any of the auth code paths (`login`, `logout`, future `status`).

#### Scenario: ark-api is unreachable from the CLI

- **GIVEN** the `ArkApiProxy` cannot establish a connection to the in-cluster ark-api Service
- **WHEN** the user runs `ark mcp auth login notion`
- **THEN** the CLI SHALL exit non-zero with a single error line naming the proxy failure
- **AND** SHALL NOT fall back to a direct `kubectl` path

### Requirement: ark-api exposes auth/logout that clears or deletes the token Secret

ark-api SHALL expose `POST /api/v1/mcp-servers/{name}/auth/logout` to clear or delete the Secret referenced by `spec.authorization.tokenSecretRef`. The endpoint SHALL accept `{ keep_client?: bool, delete_secret?: bool }`. By default it SHALL patch the Secret so `access_token`, `refresh_token`, `expires_at`, `client_id`, and `client_secret` (or their `*Key`-overridden names) hold empty strings, leaving the Secret resource itself in place. `keep_client: true` SHALL empty only `access_token`, `refresh_token`, and `expires_at`, preserving `client_id` and `client_secret`. `delete_secret: true` SHALL delete the Secret resource entirely. `keep_client` and `delete_secret` SHALL be mutually exclusive. On any successful path, ark-api SHALL also remove the `ark.mckinsey.com/mcp-auth-authorized-by` and `ark.mckinsey.com/mcp-auth-authorized-at` annotations from the MCPServer. Namespace resolution follows the cross-cutting [Namespace resolution requirement](#requirement-namespace-resolution-prefers-explicit-query-parameter).

#### Scenario: Default logout clears all five token+client keys

- **GIVEN** an MCPServer whose state is `Authorized` and whose Secret carries all five token+client keys
- **WHEN** the caller invokes `auth/logout` with an empty body
- **THEN** the patched Secret SHALL contain empty values for `access_token`, `refresh_token`, `expires_at`, `client_id`, `client_secret`
- **AND** the MCPServer's `mcp-auth-authorized-by` / `mcp-auth-authorized-at` annotations SHALL be removed

#### Scenario: keep_client preserves the DCR client credentials

- **GIVEN** an Authorized MCPServer with all five keys populated
- **WHEN** the caller invokes `auth/logout` with `keep_client: true`
- **THEN** the patched Secret SHALL contain empty `access_token`, `refresh_token`, `expires_at`
- **AND** the patched Secret SHALL still contain the original `client_id` and `client_secret` values
- **AND** the MCPServer's `mcp-auth-authorized-by` / `mcp-auth-authorized-at` annotations SHALL be removed

#### Scenario: delete_secret removes the Secret resource

- **WHEN** the caller invokes `auth/logout` with `delete_secret: true`
- **THEN** ark-api SHALL delete the referenced Secret and return HTTP 200
- **AND** the MCPServer's `mcp-auth-authorized-by` / `mcp-auth-authorized-at` annotations SHALL be removed

#### Scenario: keep_client and delete_secret are mutually exclusive

- **WHEN** the caller invokes `auth/logout` with both `keep_client: true` and `delete_secret: true`
- **THEN** ark-api SHALL return HTTP 400 before contacting the cluster
- **AND** the response body SHALL name the conflict

### Requirement: Logout honours overridden key names

ark-api SHALL operate on the overridden key names from `spec.authorization.tokenSecretRef` rather than the defaults whenever any of `accessTokenKey`, `refreshTokenKey`, `expiresAtKey`, `clientIDKey`, or `clientSecretKey` is set. With `keep_client: true`, ark-api SHALL empty only the overridden access-token, refresh-token, and expires-at keys.

#### Scenario: tokenSecretRef has accessTokenKey override

- **GIVEN** `spec.authorization.tokenSecretRef.accessTokenKey = MY_ACCESS_TOKEN`
- **WHEN** the caller invokes `auth/logout` with default body
- **THEN** the patched Secret SHALL have `MY_ACCESS_TOKEN` set to empty
- **AND** SHALL NOT add an `access_token` key

### Requirement: Logout is idempotent against a missing Secret

When the referenced Secret does not exist, `auth/logout` SHALL return HTTP 200 with a body indicating no-op across every body shape (default / `keep_client: true` / `delete_secret: true`) — idempotency is uniform across the matrix. When the MCPServer itself does not exist, `auth/logout` SHALL return HTTP 404 regardless of body. The annotation-removal step SHALL be best-effort on the no-op path: if the MCPServer exists and carries the annotations but the Secret does not, ark-api SHALL still strip the annotations before returning 200.

#### Scenario: Secret named in tokenSecretRef does not exist (default body)

- **GIVEN** the MCPServer's Secret has been deleted out of band
- **WHEN** the caller invokes `auth/logout` with an empty body
- **THEN** ark-api SHALL return HTTP 200 with `{ noop: true }`
- **AND** the CLI thin client SHALL exit zero with a one-line "no-op" message

#### Scenario: Secret does not exist with delete_secret: true

- **GIVEN** the MCPServer's Secret has already been deleted out of band
- **WHEN** the caller invokes `auth/logout` with `{ "delete_secret": true }`
- **THEN** ark-api SHALL return HTTP 200 with `{ noop: true }` — `delete_secret` on a missing Secret is idempotent, matching every other no-Secret path

#### Scenario: Secret does not exist with keep_client: true

- **GIVEN** the MCPServer's Secret has been deleted out of band
- **WHEN** the caller invokes `auth/logout` with `{ "keep_client": true }`
- **THEN** ark-api SHALL return HTTP 200 with `{ noop: true }` — no Secret means there are no client credentials to preserve

#### Scenario: MCPServer does not exist

- **WHEN** the caller invokes `auth/logout` for `does-not-exist` with any body
- **THEN** ark-api SHALL return HTTP 404
- **AND** the CLI thin client SHALL exit non-zero

### Requirement: Logout never logs token material

ark-api and the CLI SHALL never log access tokens, refresh tokens, client secrets, PKCE verifiers, or `Authorization` headers during a logout run. Logout reads the Secret only to construct the patch payload; diagnostic output SHALL be limited to the Secret name, the keys cleared (or that the Secret was deleted), and a hint to re-run `ark mcp auth login <server-name>`.

#### Scenario: Successful logout from the CLI

- **WHEN** `ark mcp auth logout <name>` succeeds against a populated Secret
- **THEN** stdout/stderr SHALL name the cleared keys but SHALL NOT contain any token, refresh-token, or client-secret value

### Requirement: ark-cli exposes mcp auth logout as a thin client

The Ark CLI SHALL expose `ark mcp auth logout <server-name>` accepting `--namespace`, `--keep-client`, and `--delete-secret`. The CLI SHALL reject `--keep-client` + `--delete-secret` combined before contacting ark-api and exit non-zero with a clear error message. The CLI SHALL POST to `auth/logout` and exit zero on HTTP 200 (including the no-op case), non-zero on any other status.

#### Scenario: User passes both --keep-client and --delete-secret

- **WHEN** the user runs `ark mcp auth logout <name> --keep-client --delete-secret`
- **THEN** the CLI SHALL exit non-zero before contacting ark-api
- **AND** the error message SHALL name both flags

#### Scenario: User logs out of a missing Secret via the CLI

- **GIVEN** the referenced Secret has been deleted out of band
- **WHEN** the user runs `ark mcp auth logout <name>`
- **THEN** ark-api SHALL respond HTTP 200 with `{ noop: true }`
- **AND** the CLI SHALL exit zero with a one-line "no-op" message
