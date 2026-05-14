## Why

Ark's MCP integration lets agents call remote MCP servers as tools. When those servers require OAuth — Notion's `mcp.notion.com/mcp`, GitHub Copilot MCP, Atlassian MCP — the controller needs a valid `access_token` for the protected resource and must present it on every call. Two earlier capabilities cover discovery and injection: `mcp-auth-detection` parses `WWW-Authenticate` and surfaces `status.authorization.state = Required` with the RFC 9728 / RFC 8414 metadata, and `mcp-auth-token-injection` reads a referenced Secret and injects `Authorization: Bearer <access_token>` on each MCP call to reach `Authorized`. The step in between — actually **minting** those tokens via Dynamic Client Registration, PKCE, and a token exchange — is left to the operator. This change closes that loop inside Ark.

Operators today script DCR + PKCE + token exchange + Secret patch out of band, or copy-paste tokens from another tool's UI. The orchestration lands in **ark-api**: a single service performs Dynamic Client Registration, generates the PKCE verifier and `state`, redirects the user's browser to the IdP, exchanges the authorization code for tokens, and writes the resulting Secret using its own in-cluster ServiceAccount. The user's CLI (and, in a follow-up capability, the dashboard) is a thin client over four ark-api endpoints — `auth/start`, `auth/callback`, `auth/status`, `auth/logout` — and never sees token material. Completion is signalled honestly: `auth/status` returns `authorized` only when both the token exchange succeeded and the MCPServer's `status.authorization.state` has reconciled to `Authorized`, so the CLI exits when the system is actually ready.

The CLI gains `ark mcp auth login <server>` / `ark mcp auth logout <server>` as a thin client over the new endpoints. **No dashboard changes ship here** — that lands in a follow-up capability (see Non-Goals) and consumes the same endpoint contract.

## What Changes

### Architecture

ark-api hosts the OAuth flow end-to-end. A client (CLI today, dashboard in a follow-up) calls `POST /auth/start` for a given MCPServer and receives an opaque `auth_id` plus an authorization URL. The operator's browser visits that URL and authenticates against the IdP, which redirects back to `GET /auth/callback` on the same ark-api instance. ark-api looks the in-flight state up by `state`, performs the code-for-token exchange against the IdP token endpoint, writes the access/refresh tokens into the Secret named by `spec.authorization.tokenSecretRef` using ark-api's in-cluster ServiceAccount, and updates the cache entry. The client polls `GET /auth/status` until ark-api reports `authorized` (after both the exchange succeeded and the controller has reconciled the MCPServer's `status.authorization.state` to `Authorized`). `POST /auth/logout` reverses the flow by emptying or deleting the Secret. The cache is in-memory and TTL'd; tokens, the `client_secret`, and the PKCE verifier are confined to ark-api.

### ark-api endpoint surface

Four new endpoints under `services/ark-api/`, walking the OAuth flow from kickoff to completion (the operator hits `start`, the browser hits `callback`, the CLI/dashboard polls `status`, and `logout` reverses it):

- **`POST /api/v1/mcp-servers/{name}/auth/start`** — initiates a flow.
  - Query: `?namespace=<ns>` (optional; ark-api falls back to its pod-context namespace via `with_ark_client(None, ...)` when omitted, matching every other ark-api route).
  - Body: `{ force?: bool, force_registration?: bool, scopes?: string[] }`.
  - Reads the MCPServer; refuses unless `status.authorization.state == Required` (override with `force: true`). `DiscoveryFailed` is refused outright — even with `force: true` — because `registrationEndpoint` / `tokenEndpoint` are empty in that state.
  - Reads `spec.authorization.tokenSecretRef`. If the Secret already carries `client_id` / `client_secret`, ark-api reuses them (skip DCR) unless `force_registration: true` is passed, in which case it performs a fresh RFC 7591 Dynamic Client Registration regardless of cached credentials and replaces them on a successful exchange. Otherwise it performs RFC 7591 Dynamic Client Registration against `status.authorization.registrationEndpoint` with `redirect_uris=[<ark-api callback URL>]`, `grant_types=["authorization_code","refresh_token"]`, `response_types=["code"]`, `token_endpoint_auth_method=client_secret_basic`. If `registrationEndpoint` is empty and the Secret has no cached client credentials, ark-api fails the call with HTTP 422 (no path forward).
  - DCR responses with `token_endpoint_auth_method` other than `client_secret_basic` are rejected. Public-client (`none`) support is out of scope here — every MCP authorization server Ark targets today (Notion, GitHub, Atlassian) issues a confidential client.
  - Generates PKCE verifier (64 unreserved chars), S256 challenge, and `state` (≥128 bits, base64url). The opaque `auth_id` returned to the caller SHALL be ≥128 bits of CSPRNG entropy, base64url-encoded.
  - Stores `{verifier, state, mcpServer ref, registered client_id, registered client_secret, caller identity, created_at}` in a short-lived cache keyed by an opaque `auth_id`. TTL is configurable (default 10 minutes).
  - Returns `{ auth_id, authorization_url, flow_expires_at }`. `flow_expires_at` is the cache-entry deadline (not a token expiry — that field lives on `auth/status`). The authorization URL carries `response_type=code`, the registered `client_id`, ark-api's redirect URI, `state`, `code_challenge`, `code_challenge_method=S256`, and `resource=<status.authorization.resource>` (RFC 8707; the canonical RFC 9728 resource URI discovered by the controller). `scope` is included when the body carries non-empty `scopes`, or — if the body omits `scopes` — when `status.authorization.scopesSupported` is non-empty (space-joined per RFC 6749 §3.3). When neither source has values, `scope` is omitted.

- **`GET /api/v1/mcp/auth/callback`** — single, install-stable endpoint registered as the OAuth redirect URI at DCR time.
  - Receives `?code=<>&state=<>` (or `?error=<>&error_description=<>` on failure).
  - Looks up the cache entry by `state`. Unknown / expired state → 400 + a minimal HTML page explaining the flow expired and pointing the user back to `ark mcp auth login`. Cache entry is deleted on lookup so codes cannot be replayed.
  - On `error` from the IdP, marks the cache entry as `failed` (with the OAuth error code in the message) so the CLI's poll surfaces it, and renders an HTML page with the error.
  - On `code`, POSTs to `status.authorization.tokenEndpoint` with `grant_type=authorization_code`, `code`, `redirect_uri`, `code_verifier`, and `resource=<status.authorization.resource>`, authenticating via HTTP Basic with the cached `client_id` / `client_secret`.
  - Computes `expires_at = now + expires_in - 30s` (RFC 3339 UTC) when `expires_in` is positive.
  - Patches the Secret named in `spec.authorization.tokenSecretRef.name` (creates if absent), honouring the configured `*Key` overrides. Stamps the Secret with the `ark.mckinsey.com/mcp-token-secret: "true"` label as a forward-compatible marker for the planned controller-side Secret-watch optimization (mcp-auth-token-injection Stage 2); harmless if no consumer ever lands. Stamps the MCPServer with the `ark.mckinsey.com/mcp-auth-authorized-by` and `ark.mckinsey.com/mcp-auth-authorized-at` annotations (best-effort caller identity + RFC 3339 timestamp).
  - Renders an HTML page saying "Authorization complete — you can close this window" on success. All IdP-supplied strings (`error`, `error_description`) are HTML-escaped before being interpolated into any rendered page — the IdP is an untrusted reflector and the operator's browser is the trust boundary that matters.

- **`GET /api/v1/mcp-servers/{name}/auth/status`** — caller-facing status poll.
  - Query: `?auth_id=<>&namespace=<ns>` (`namespace` optional with pod-context fallback).
  - Returns `{ state: "pending" | "authorized" | "failed" | "expired", message?: string, expires_at?: string }`. Here `expires_at` is the **token** expiry (RFC 3339 UTC), distinct from `auth/start`'s `flow_expires_at` cache-entry deadline.
  - `authorized` is returned only when (a) the cache entry is in the `authorized` terminal state **and** (b) the MCPServer's `status.authorization.state` has reconciled to `Authorized`, so the caller exits when the system is actually ready.
  - Resolution order: missing MCPServer → HTTP 404 wins over any `auth_id` lookup. With a known MCPServer, an unknown `auth_id` returns `state: expired` (distinguishing "flow aged out" from "no such server").
  - The cache entry SHALL persist until its TTL elapses even after a successful `authorized` response, so concurrent / repeat pollers observe the same terminal state.

- **`POST /api/v1/mcp-servers/{name}/auth/logout`** — mirrors `ark mcp auth logout`.
  - Query: `?namespace=<ns>` (optional with pod-context fallback).
  - Body: `{ keep_client?: bool, delete_secret?: bool }`. Mutual exclusion is enforced.
  - Default: patches the Secret so `access_token`, `refresh_token`, `expires_at`, `client_id`, `client_secret` (or their `*Key`-overridden names) hold empty strings. Leaves the Secret resource in place.
  - `keep_client: true`: empties only `access_token`, `refresh_token`, `expires_at`. Preserves `client_id` / `client_secret` so a follow-up `start` skips DCR.
  - `delete_secret: true`: deletes the Secret resource entirely.
  - Idempotent on missing Secret across every path (default / `keep_client` / `delete_secret`) — returns 200 `{noop:true}`. Missing MCPServer → 404 regardless of body.
  - On any of the above paths, removes the `ark.mckinsey.com/mcp-auth-authorized-by` / `ark.mckinsey.com/mcp-auth-authorized-at` annotations from the MCPServer.

### Trust boundary on the auth endpoints

This change does not introduce inbound authentication on the four auth endpoints — they sit behind the same trust boundary as every other ark-api route (cluster-internal Service, optional gateway in front). Any client that can reach ark-api can initiate or revoke a flow for any MCPServer in any namespace ark-api serves; in particular `auth/logout` with `delete_secret: true` is destructive. Operators who expose ark-api beyond the cluster MUST front it with the same authenticating gateway they use for the rest of the API surface. End-user authentication for the dashboard path is owned by the follow-up `mcp-auth-dashboard` capability.

### Configuration

- `ARK_API_PUBLIC_CALLBACK_URL` — required when `auth/start` is invoked. Must be a stable, externally-reachable URL terminating at `GET /api/v1/mcp/auth/callback`. Validation: HTTPS scheme except for `127.0.0.1`, `[::1]`, or `localhost` (RFC 8252 §7.3 carve-out for the air-gapped/port-forward case; IPv6 loopback literals SHALL be bracketed per RFC 3986 §3.2.2).
- `ARK_API_MCP_AUTH_CACHE_TTL_SECONDS` — TTL for cache entries (default `600`).
- `ARK_API_MCP_AUTH_DCR_TIMEOUT_SECONDS` — outbound DCR call timeout (default `15`).
- `ARK_API_MCP_AUTH_TOKEN_TIMEOUT_SECONDS` — outbound token-exchange call timeout (default `15`).

### CLI (thin client)

`tools/ark-cli/` gains `ark mcp auth login` and `ark mcp auth logout` as a thin client over the ark-api endpoints. The CLI does not call `kubectl` for the auth flow — every operation flows through the existing `ArkApiProxy` (`tools/ark-cli/src/lib/arkApiProxy.ts`).

- `ark mcp auth login <server-name>`:
  - Flags: `--namespace`, `--force`, `--force-registration`, `--no-open`, `--timeout <duration>` (Go-duration; default `5m`).
  - POST `/auth/start`. `--force` maps to `force: true` (bypass `status.authorization.state` preflight); `--force-registration` maps to `force_registration: true` (perform a fresh RFC 7591 DCR even when the Secret carries cached `client_id` / `client_secret`). The two are orthogonal — `--force-registration` does not bypass the state guard. On 4xx other than `force`-overridable preflight, exit non-zero with a single `mcp auth failed:` line.
  - Always print the returned `authorization_url` to stdout. Open the default browser via `open` unless `--no-open`.
  - Poll `GET /auth/status` every 2s up to `--timeout`. Exit zero on `authorized`; exit non-zero on `failed`, `expired`, or timeout.
  - Print the resource URL and `expires_at` on success.
- `ark mcp auth logout <server-name>`:
  - Flags: `--namespace`, `--keep-client`, `--delete-secret`. Mutual exclusion enforced client-side before the call.
  - POST `/auth/logout`. Exit non-zero on 4xx/5xx with a single error line. Idempotent on a missing Secret (200 → exit zero).

### Headless / SSH operators

Two operator recipes cover the laptop / jumphost case, depending on whether ark-api is reachable from the operator's browser:

- **Publicly-reachable ark-api ingress:** the laptop browser hits `https://ark.example.com/api/v1/mcp/auth/callback` directly. The CLI on the jumphost just polls `/auth/status`. **No SSH tunnel needed.**
- **Air-gapped / private ark-api:** the cluster operator deploys ark-api with `ARK_API_PUBLIC_CALLBACK_URL=http://127.0.0.1:8080/api/v1/mcp/auth/callback` (or `http://[::1]:8080/...`) — the env var is read at pod startup, so it has to be set on the Deployment, not on the laptop. The end user then port-forwards ark-api to the laptop, binding both IPv4 and IPv6 loopback so the browser reaches it regardless of how the OS resolves `localhost` (`kubectl port-forward --address 127.0.0.1,::1 svc/ark-api 8080:80`). The DCR registers the loopback URL (RFC 8252 §7.3 permits this and recommends binding both stacks). This recipe is only viable in single-operator clusters — a callback URL that resolves to the cluster's `127.0.0.1` would be useless to a remote user-agent, so a publicly-reachable ingress is the normal mode.

### Authorized-by surface

ark-api stamps two annotations on the MCPServer at exchange time:

- `ark.mckinsey.com/mcp-auth-authorized-by`: best-effort caller identity as observed by ark-api. This change ships only the `ArkApiProxy` (CLI) branch, which annotates `cli` because no per-user identity is available on the kubeconfig path. Resolving end-user identity from an authenticated bearer token is owned by the future `mcp-auth-dashboard` capability, which will add the inbound auth middleware that makes the user identity available to this annotation. Format is opaque; consumers display verbatim.
- `ark.mckinsey.com/mcp-auth-authorized-at`: RFC 3339 UTC timestamp of the exchange.

These annotations surface the **shared-token limitation** (one Secret per MCPServer; last login wins) without trying to fix it. A future per-user-tokens capability will own the controller- and dispatch-side changes required to act on caller identity.

## Capabilities

### New Capabilities

- `mcp-auth-ark-api-orchestration`: ark-api exposes `auth/start`, `auth/callback`, `auth/status`, `auth/logout` endpoints orchestrating RFC 7591 DCR + RFC 7636 PKCE S256 + RFC 8707 resource indicator + token exchange + Secret write. The CLI consumes these endpoints; the dashboard will consume the same endpoints in a follow-up capability.

### Modified Capabilities

- `mcp-auth-token-injection`: unchanged contract. ark-api becomes an additional writer of the Secret named in `spec.authorization.tokenSecretRef`; the controller's read path is untouched. Stage 1's reconcile-side rollback on 401 is unchanged.

## Impact

- **Scope:**
  - `services/ark-api/ark-api/src/ark_api/api/v1/` — new `mcp_auth.py` module with the four endpoints.
  - `services/ark-api/ark-api/src/ark_api/services/` — DCR client, OAuth token-exchange client, PKCE/state primitives, in-flight cache.
  - `services/ark-api/chart/` — RBAC additions for `patch`/`create` on Secrets (the controller SA already has this; ark-api needs it added).
  - `tools/ark-cli/src/commands/mcp/` — `auth.ts` (thin client).
  - `docs/content/` — operator docs for the new env vars and the simplified SSH recipe.
- **CRD:** none. Consumes `spec.authorization.tokenSecretRef` and `status.authorization.*` unchanged.
- **RBAC:** ark-api SA gains `get/list/watch/create/patch/update/delete` on Secrets within the namespaces it serves. The controller-side RBAC from Stage 1 (read-only on Secrets) is unaffected.
- **Security:**
  - Tokens never reach the CLI process or any future browser. The full set of token material flows IdP → ark-api → Secret and never traverses an external boundary.
  - PKCE verifier is generated and consumed entirely inside ark-api; it never appears on any HTTP boundary.
  - `client_secret` never leaves ark-api. The cache entry holding it is in-memory with TTL; `auth_id` returned to the CLI is opaque and grants no privileges by itself.
  - Logs never carry tokens, refresh tokens, client secrets, PKCE verifiers, or `Authorization` headers — applies to both the ark-api endpoints and the CLI.

## Non-Goals

- **Dashboard MCP authorize flow** — out of scope for this change. A future capability `mcp-auth-dashboard` will add the dashboard-side button, callback handling (just a query-param read on `/mcp?authorized=<name>`), and `Authorize`/`Sign out` actions on the MCP card. The endpoint contract defined here is the contract that capability will consume; no further ark-api changes will be required.
- **Per-user tokens / multi-tenant MCP credentials** — out of scope. The shared-token model from Stage 1 is inherited. The `mcp-auth-authorized-by` annotation surfaces the limitation but does not change dispatch behaviour. A future capability `mcp-auth-per-user-tokens` will own the controller, A2A, and executor changes required for per-user identity to flow through query dispatch.
- **Token refresh** — Stage 2 (`mcp-auth-token-refresh`). Re-run `ark mcp auth login` until then.
- **Validating webhook for `spec.headers[Authorization]` vs `spec.authorization` clash** — Stage 2.
- **Multi-replica ark-api with shared in-flight cache** — the proposal specifies an opaque cache contract (TTL'd, addressed by `auth_id` and `state`) without prescribing storage. A single-replica deployment trivially satisfies the contract; HA-mode deployments will need either sticky sessions on the ingress, a shared backing store, or a persisted-cache implementation. Treated here as an operational consideration, not a feature.
- **RFC 8628 device authorization grant** — out of scope. With status polling already in place, adding a device-flow mode to `auth/start` is a small additive change but it requires IdP support that most MCP authorization servers don't yet expose.
- **Chainsaw e2e** — blocked on TLS-capable in-cluster mock MCP.
