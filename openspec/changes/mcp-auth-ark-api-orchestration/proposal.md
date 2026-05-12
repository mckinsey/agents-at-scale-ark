## Why

Stage 1 (`mcp-auth-token-injection`) reads tokens from a Secret and reaches `Authorized`, but leaves token *production* to the operator. The prior proposal (`ark-cli-mcp-auth`, PR #2065) addressed that by adding `ark mcp auth login` — a self-contained CLI that ran the entire OAuth dance against the IdP, bound a `127.0.0.1:<port>` loopback listener, exchanged the code in-process, and `kubectl patch`'d the Secret.

Review of PR #2065 surfaced four structural problems with that shape:

1. **Duplication.** The dashboard needs the same flow. A browser cannot bind a useful loopback port, so a separate implementation would be required end-to-end (DCR, state verification, token exchange, CORS handling on browser→IdP token endpoints, Secret RBAC).
2. **Port binding pain.** `--port`, "port already in use," IPv6 dual-stack listener requirements, and the SSH-tunnel recipe for jumphost operators all exist solely to support the loopback callback.
3. **Inconsistent RBAC.** PR #2065's CLI patches Secrets with the operator's `kubeconfig` — different audience and different permissions than the controller's ServiceAccount. Cluster admins succeed; developers without `patch secrets` fail.
4. **Honest completion signal.** The CLI exits when the token exchange returns 200, not when the controller has reconciled the Secret to `Authorized`. The user thinks they're done before the system is.

This change supersedes `ark-cli-mcp-auth` by moving DCR, state verification, token exchange, and Secret writes into ark-api, with the CLI reduced to "two HTTP calls plus a status poll." The same ark-api endpoint surface is the foundation a future dashboard MCP authorize flow will consume, but **no dashboard changes ship here** — that lands in a follow-up capability (see Non-Goals).

The CLI keeps the same operator-facing UX as PR #2065 (`ark mcp auth login <server>` / `ark mcp auth logout <server>`, same flags minus `--port`); the implementation underneath is now a thin client.

## What Changes

### ark-api endpoint surface

Three new endpoints under `services/ark-api/`:

- **`POST /api/v1/mcp-servers/{name}/auth/start`** — initiates a flow.
  - Query: `?namespace=<ns>`.
  - Body: `{ force?: bool, scopes?: string[] }`.
  - Reads the MCPServer; refuses unless `status.authorization.state == Required` (override with `force: true`).
  - Reads `spec.authorization.tokenSecretRef`. If the Secret already carries `client_id` / `client_secret`, ark-api reuses them (skip DCR). Otherwise it performs RFC 7591 Dynamic Client Registration against `status.authorization.registrationEndpoint` with `redirect_uris=[<ark-api callback URL>]`, `grant_types=["authorization_code","refresh_token"]`, `response_types=["code"]`, `token_endpoint_auth_method=client_secret_basic`.
  - Generates PKCE verifier (64 unreserved chars), S256 challenge, and `state` (16 bytes, base64url).
  - Stores `{verifier, state, mcpServer ref, registered client_id, registered client_secret, caller identity, created_at}` in a short-lived cache keyed by an opaque `auth_id`. TTL is configurable (default 10 minutes).
  - Returns `{ auth_id, authorization_url, expires_at }`. The authorization URL carries `response_type=code`, the registered `client_id`, ark-api's redirect URI, `state`, `code_challenge`, `code_challenge_method=S256`, and `resource=<MCP URL>` (RFC 8707). `scope` is only included when supplied.

- **`GET /api/v1/mcp/auth/callback`** — single, install-stable endpoint registered as the OAuth redirect URI at DCR time.
  - Receives `?code=<>&state=<>` (or `?error=<>&error_description=<>` on failure).
  - Looks up the cache entry by `state`. Unknown / expired state → 400 + a minimal HTML page explaining the flow expired and pointing the user back to `ark mcp auth login`. Cache entry is deleted on lookup so codes cannot be replayed.
  - On `error` from the IdP, marks the cache entry as `failed` (with the OAuth error code in the message) so the CLI's poll surfaces it, and renders an HTML page with the error.
  - On `code`, POSTs to `status.authorization.tokenEndpoint` with `grant_type=authorization_code`, `code`, `redirect_uri`, `code_verifier`, and `resource=<MCP URL>`, authenticating via HTTP Basic with the cached `client_id` / `client_secret`.
  - Computes `expires_at = now + expires_in - 30s` (RFC 3339 UTC) when `expires_in` is positive.
  - Patches the Secret named in `spec.authorization.tokenSecretRef.name` (creates if absent), honouring the configured `*Key` overrides. Stamps the Secret with the `ark.mckinsey.com/mcp-token-secret: "true"` label (`mcp-auth-dispatch-injection` consumer). Stamps the MCPServer with the `ark.mckinsey.com/mcp-auth-authorized-by` and `ark.mckinsey.com/mcp-auth-authorized-at` annotations (best-effort caller identity + RFC 3339 timestamp).
  - Renders an HTML page saying "Authorization complete — you can close this window" on success.

- **`GET /api/v1/mcp-servers/{name}/auth/status`** — caller-facing status poll.
  - Query: `?auth_id=<>&namespace=<ns>`.
  - Returns `{ state: "pending" | "authorized" | "failed" | "expired", message?: string, expires_at?: string }`.
  - `authorized` is returned only when (a) the cache entry is in the `authorized` terminal state **and** (b) the MCPServer's `status.authorization.state` has reconciled to `Authorized`. This is the "honest completion signal" the loopback design lacked.

- **`POST /api/v1/mcp-servers/{name}/auth/logout`** — mirrors `ark mcp auth logout`.
  - Query: `?namespace=<ns>`.
  - Body: `{ keep_client?: bool, delete_secret?: bool }`. Mutual exclusion is enforced.
  - Default: patches the Secret so `access_token`, `refresh_token`, `expires_at`, `client_id`, `client_secret` (or their `*Key`-overridden names) hold empty strings. Leaves the Secret resource in place.
  - `keep_client: true`: empties only `access_token`, `refresh_token`, `expires_at`. Preserves `client_id` / `client_secret` so a follow-up `start` skips DCR.
  - `delete_secret: true`: deletes the Secret resource entirely.
  - Idempotent on missing Secret (no-op, 200). Missing MCPServer → 404.
  - On any of the above paths, removes the `ark.mckinsey.com/mcp-auth-authorized-by` / `ark.mckinsey.com/mcp-auth-authorized-at` annotations from the MCPServer.

### Configuration

- `ARK_API_PUBLIC_CALLBACK_URL` — required when `auth/start` is invoked. Must be a stable, externally-reachable URL terminating at `GET /api/v1/mcp/auth/callback`. Validation: HTTPS scheme except for `127.0.0.1` / `localhost` (RFC 8252 §7.3 carve-out for the air-gapped/port-forward case).
- `ARK_API_MCP_AUTH_CACHE_TTL_SECONDS` — TTL for cache entries (default `600`).
- `ARK_API_MCP_AUTH_DCR_TIMEOUT_SECONDS` — outbound DCR call timeout (default `15`).
- `ARK_API_MCP_AUTH_TOKEN_TIMEOUT_SECONDS` — outbound token-exchange call timeout (default `15`).

### CLI (thin client)

`tools/ark-cli/` gains `ark mcp auth login` and `ark mcp auth logout` as a thin client over the ark-api endpoints. The CLI does not call `kubectl` for the auth flow — every operation flows through the existing `ArkApiProxy` (`tools/ark-cli/src/lib/arkApiProxy.ts`).

- `ark mcp auth login <server-name>`:
  - Flags: `--namespace`, `--force`, `--no-open`, `--timeout <duration>` (Go-duration; default `5m`). **No `--port` flag** — the loopback listener is gone.
  - POST `/auth/start`. On 4xx other than `force`-overridable preflight, exit non-zero with a single `mcp auth failed:` line.
  - Always print the returned `authorization_url` to stdout. Open the default browser via `open` unless `--no-open`.
  - Poll `GET /auth/status` every 2s up to `--timeout`. Exit zero on `authorized`; exit non-zero on `failed`, `expired`, or timeout.
  - Print the resource URL and `expires_at` on success.
- `ark mcp auth logout <server-name>`:
  - Flags: `--namespace`, `--keep-client`, `--delete-secret`. Mutual exclusion enforced client-side before the call.
  - POST `/auth/logout`. Exit non-zero on 4xx/5xx with a single error line. Idempotent on a missing Secret (200 → exit zero).

### Headless / SSH operators

The loopback bridge from PR #2065 disappears in the common case:

- **Publicly-reachable ark-api ingress:** the laptop browser hits `https://ark.example.com/api/v1/mcp/auth/callback` directly. The CLI on the jumphost just polls `/auth/status`. **No SSH tunnel needed.**
- **Air-gapped / private ark-api:** the operator port-forwards ark-api to the laptop (`kubectl port-forward svc/ark-api 8080:80`) and sets `ARK_API_PUBLIC_CALLBACK_URL=http://127.0.0.1:8080/api/v1/mcp/auth/callback`. The DCR registers the loopback URL (RFC 8252 §7.3 permits this). Same end-state as PR #2065's SSH recipe but with one fewer hop and a more conventional tool (`kubectl port-forward` vs. arbitrary loopback bridging).

### Authorized-by surface

ark-api stamps two annotations on the MCPServer at exchange time:

- `ark.mckinsey.com/mcp-auth-authorized-by`: best-effort caller identity as observed by ark-api. For dashboard callers, the authenticated user identity from the session. For CLI callers (via `ArkApiProxy`), `cli` (no per-user identity is available on the kubeconfig path today). Format is opaque; consumers display verbatim.
- `ark.mckinsey.com/mcp-auth-authorized-at`: RFC 3339 UTC timestamp of the exchange.

These annotations surface the **shared-token limitation** (one Secret per MCPServer; last login wins) without trying to fix it. A future per-user-tokens capability will own the controller- and dispatch-side changes required to act on caller identity.

## Capabilities

### New Capabilities

- `mcp-auth-ark-api-orchestration`: ark-api exposes `auth/start`, `auth/callback`, `auth/status`, `auth/logout` endpoints orchestrating RFC 7591 DCR + RFC 7636 PKCE S256 + RFC 8707 resource indicator + token exchange + Secret write. The CLI consumes these endpoints; the dashboard will consume the same endpoints in a follow-up capability.

### Modified Capabilities

- `mcp-auth-token-injection`: unchanged contract. ark-api becomes an additional writer of the Secret named in `spec.authorization.tokenSecretRef`; the controller's read path is untouched. Stage 1's reconcile-side rollback on 401 is unchanged.

### Superseded Capabilities

- `ark-cli-mcp-auth` (PR #2065): the CLI surface (`ark mcp auth login` / `logout` + flags) is preserved as-is minus `--port`. The implementation underneath (loopback listener, in-process DCR + token exchange, `kubectl patch` from the CLI) is replaced by HTTP calls to ark-api.

## Impact

- **Scope:**
  - `services/ark-api/ark-api/src/ark_api/api/v1/` — new `mcp_auth.py` module with the four endpoints.
  - `services/ark-api/ark-api/src/ark_api/services/` — DCR client, OAuth token-exchange client, PKCE/state primitives, in-flight cache.
  - `services/ark-api/chart/` — RBAC additions for `patch`/`create` on Secrets (the controller SA already has this; ark-api needs it added).
  - `tools/ark-cli/src/commands/mcp/` — `auth.ts` (thin client), no `loopback.ts`, no `pkce.ts`.
  - `docs/content/` — operator docs for the new env vars and the simplified SSH recipe.
- **CRD:** none. Consumes `spec.authorization.tokenSecretRef` and `status.authorization.*` unchanged.
- **RBAC:** ark-api SA gains `get/list/watch/create/patch/update/delete` on Secrets within the namespaces it serves. The completions executor RBAC change from `mcp-auth-dispatch-injection` is unaffected.
- **Behavioural break vs PR #2065:** an Ark install that has *already* shipped the PR #2065 CLI would lose the `--port` flag and the loopback callback. Since PR #2065 is unmerged at the time of this proposal, there is no observed-in-the-wild impact.
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
- **Chainsaw e2e** — blocked on TLS-capable in-cluster mock MCP, same as PR #2065.
