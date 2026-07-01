## 1. ark-api configuration

- [ ] 1.1 Add `ARK_API_PUBLIC_CALLBACK_URL` env var with HTTPS-or-loopback validation at startup; refuse to start on a non-HTTPS public host. Loopback carve-out SHALL accept `127.0.0.1`, `[::1]` (bracketed per RFC 3986 §3.2.2), and `localhost`. Reject unbracketed IPv6 literals.
- [ ] 1.2 Add `ARK_API_MCP_AUTH_CACHE_TTL_SECONDS` (default `600`)
- [ ] 1.3 Add `ARK_API_MCP_AUTH_DCR_TIMEOUT_SECONDS` (default `15`)
- [ ] 1.4 Add `ARK_API_MCP_AUTH_TOKEN_TIMEOUT_SECONDS` (default `15`)
- [ ] 1.5 Document the env vars in `services/ark-api/README.md` and in the Helm chart values

## 2. ark-api primitives

- [ ] 2.1 `services/ark-api/ark-api/src/ark_api/services/pkce.py` — `generate_verifier()`, `derive_challenge(verifier)`, `generate_state()`
- [ ] 2.2 PKCE unit tests — verifier alphabet, length bounds (default 64), challenge equals `BASE64URL(SHA-256(verifier))`, state >= 16 bytes random
- [ ] 2.3 `services/ark-api/ark-api/src/ark_api/services/mcp_auth_cache.py` — TTL'd cache addressable by `auth_id` and `state`; delete-on-lookup for the callback path

## 3. ark-api outbound clients

- [ ] 3.1 `services/ark-api/ark-api/src/ark_api/services/oauth_dcr.py` — RFC 7591 DCR client. POST `client_name=ark`, `redirect_uris=[<configured>]`, `grant_types=["authorization_code","refresh_token"]`, `response_types=["code"]`, `token_endpoint_auth_method=client_secret_basic`. Reject responses whose `redirect_uris` omits the configured URI. Reject any `token_endpoint_auth_method` other than `client_secret_basic` (public-client `none` is out of scope — see spec). Fail-closed with HTTP 422 when `status.authorization.registrationEndpoint` is empty AND the Secret carries no cached `client_id` / `client_secret`.
- [ ] 3.2 `services/ark-api/ark-api/src/ark_api/services/oauth_token.py` — POST `grant_type=authorization_code`, `code`, `redirect_uri`, `code_verifier`, `resource=<status.authorization.resource>` (canonical RFC 9728 URI), HTTP Basic with `client_id` / `client_secret`. Surface OAuth `error` verbatim on non-2xx.
- [ ] 3.3 Unit tests with `respx` (or equivalent) mocking the IdP endpoints — DCR redirect-URI enforcement, unsupported `token_endpoint_auth_method` (assert `none` is rejected alongside `client_secret_post`), missing-`registrationEndpoint` + no-cached-creds → 422, token exchange success, token exchange 4xx

## 4. ark-api endpoints

- [ ] 4.1 `services/ark-api/ark-api/src/ark_api/api/v1/mcp_auth.py` — register the four routes
- [ ] 4.2 `POST /api/v1/mcp-servers/{name}/auth/start` — preflight against `status.authorization.state` (`Authorized` → 409 unless `force`; `DiscoveryFailed` → 422 even with `force`), DCR-cache-or-fresh, PKCE generation, cache entry creation, URL assembly with `resource=<status.authorization.resource>` (RFC 8707) and `scope` sourced from request body OR `status.authorization.scopesSupported` fallback. Return shape uses `flow_expires_at` (NOT `expires_at`) to keep the cache-deadline field name distinct from `auth/status`'s token expiry.
- [ ] 4.3 `GET /api/v1/mcp/auth/callback` — state lookup, delete-state-index-on-lookup (keep `auth_id` index live until TTL so `auth/status` keeps reporting `authorized` after success), token exchange, Secret patch (create-if-absent), `mcp-token-secret` label stamp (forward-compatible), MCPServer annotations (`authorized-by` = `cli` for this change; user-identity branch is gated on the dashboard capability), HTML escape every IdP-supplied string (`error`, `error_description`) before interpolating into the success/failure HTML pages
- [ ] 4.4 `GET /api/v1/mcp-servers/{name}/auth/status` — terminal state `authorized` requires both cache `authorized` AND MCPServer `status.authorization.state == Authorized`; cache wins for `failed`/`expired` regardless of MCPServer state; missing-MCPServer 404 SHALL precede any cache lookup (404-before-expired ordering)
- [ ] 4.5 `POST /api/v1/mcp-servers/{name}/auth/logout` — default / `keep_client` / `delete_secret` matrix; mutual-exclusion check; **all three body shapes** idempotent on missing Secret (200 `{noop: true}`); 404 missing MCPServer for any body; annotation removal on every success path including the no-op-on-missing-Secret path
- [ ] 4.6 Plug the new module into the FastAPI router registration
- [ ] 4.7 `auth_id` generator uses `secrets.token_urlsafe(16)` (≥128 bits CSPRNG, base64url) — match the same primitive used for `state`

## 5. ark-api persistence helpers

- [ ] 5.1 Reuse the existing Kubernetes Secret read/write code paths in ark-api (used by other services) rather than introducing a parallel implementation
- [ ] 5.2 Honour the `*Key` overrides from `tokenSecretRef` when constructing the patch payload
- [ ] 5.3 Compute `expires_at = now + expires_in - 30s` (RFC 3339 UTC) only when `expires_in > 0`; omit the key otherwise and emit a warning log
- [ ] 5.4 Add MCPServer-patch helper for the annotation pair (set on success, remove on logout)

## 6. ark-api RBAC

- [ ] 6.1 Extend the ark-api SA ClusterRole / Role in `services/ark-api/chart/` with `get/create/patch/update/delete` on Secrets in the namespaces ark-api serves. `list` / `watch` are NOT required — the four endpoints only touch the single Secret named in `spec.authorization.tokenSecretRef`.
- [ ] 6.2 Verify the SA already has `get/patch` on `mcpservers` (the parent resource, NOT `mcpservers/status`) — annotations live in `metadata.annotations` on the parent object; the `/status` subresource only services `.status.*` fields and a patch routed there will leave annotations untouched. Add the rule if missing.
- [ ] 6.3 Document the RBAC delta in the chart values comments

## 7. ark-api endpoint tests

- [ ] 7.1 `auth/start` — preflight refusal on Authorized without `force`; success on Required; `force` bypasses Authorized preflight; `DiscoveryFailed` → 422 even with `force: true` (no path forward when registration/token endpoints are empty); cache entry populated with verifier + state + caller identity
- [ ] 7.2 `auth/start` — DCR happens when Secret lacks `client_secret`; DCR is skipped when both `client_id` and `client_secret` are populated; `force_registration: true` triggers fresh DCR even with cached credentials and replaces them on a successful exchange; `force_registration: true` without `force` on a non-Required MCPServer still returns 409; empty `registrationEndpoint` + no cached creds → 422; empty `registrationEndpoint` + cached creds succeeds (DCR skipped)
- [ ] 7.3 `auth/start` — DCR rejection paths (missing `redirect_uris`, unsupported `token_endpoint_auth_method` — assert `none` AND `client_secret_post` both rejected) propagate as 502
- [ ] 7.4 `auth/start` — Secret untouched on any flow-pre-exchange failure
- [ ] 7.5 `auth/callback` — unknown state → 400 HTML; known state succeeds; second hit for same code → 400 (replay protection via delete-state-index-on-lookup)
- [ ] 7.6 `auth/callback` — `error=access_denied` → 400 HTML, cache entry transitions to `failed`, Secret unchanged
- [ ] 7.7 `auth/callback` — token-exchange 400 transitions cache to `failed` with the error string, Secret unchanged
- [ ] 7.8 `auth/callback` — successful exchange creates the Secret if absent; patches with configured `*Key` overrides; stamps the `mcp-token-secret` label on the Secret; stamps MCPServer annotations (`authorized-by: cli`, `authorized-at: <RFC 3339>`); cache `auth_id` index remains live for repeat `auth/status` polls until TTL
- [ ] 7.9 `auth/callback` — `expires_in` missing or ≤ 0 omits `expires_at` key and emits a warning
- [ ] 7.10 `auth/callback` HTML escaping — assert `?error=invalid_request&error_description=<script>alert(1)</script>` renders the literal text and NOT an executable `<script>` element (response body contains `&lt;script&gt;`, not `<script>`)
- [ ] 7.11 `auth/status` — pending while cache is in-flight; pending when cache is `authorized` but MCPServer status hasn't reconciled; authorized only when both align; cache-`failed` reports `failed` even when MCPServer is `Authorized` from a prior flow; cache-`expired` reports `expired` even when MCPServer is `Authorized`; unknown `auth_id` against known MCPServer returns `expired` (not 404); unknown MCPServer returns 404 regardless of `auth_id` validity (404-before-expired ordering); cache entry persists for repeat polls
- [ ] 7.12 `auth/logout` — default empties five keys; `keep_client` preserves DCR creds; `delete_secret` removes the resource; mutual exclusion returns 400; missing Secret returns 200 `{noop:true}` across all three body shapes (default / `keep_client` / `delete_secret`); missing MCPServer returns 404 for any body; annotations are removed on every success path including the no-op-on-missing-Secret path
- [ ] 7.13 Token material redaction — assert logs across all four endpoints contain no token, refresh-token, client-secret, or PKCE-verifier values
- [ ] 7.14 `auth_id` entropy — assert generated `auth_id` decodes to ≥16 bytes; statistical sanity check that two consecutive generations differ

## 8. ark-api OpenAPI surface

- [ ] 8.1 Add request/response models for the four endpoints in `services/ark-api/ark-api/src/ark_api/models/`. The `auth/start` response field SHALL be named `flow_expires_at` (not `expires_at`) to keep it distinct from the token-expiry `expires_at` returned by `auth/status` — both endpoints currently emit RFC 3339 strings; the rename prevents callers from conflating cache-deadline with token lifetime
- [ ] 8.2 Regenerate the OpenAPI schema and the downstream typed clients in `services/ark-dashboard/ark-dashboard/lib/api/generated/types.ts` (the dashboard service — same monorepo, not a separate repo). The follow-up `mcp-auth-dashboard` capability consumes these types from the same path; no cross-repo coordination required.

## 9. CLI thin client

- [ ] 9.1 Register `ark mcp` parent command in `tools/ark-cli/src/index.tsx`
- [ ] 9.2 Register `ark mcp auth` parent command with `login` and `logout` subcommands
- [ ] 9.3 `ark mcp auth login <server-name>` flags: `--namespace`, `--force`, `--force-registration`, `--no-open`, `--timeout <duration>`. `--force` → `force: true` in `auth/start` body; `--force-registration` → `force_registration: true`. The two are orthogonal — `--force-registration` does not bypass the preflight. NO `--port` flag.
- [ ] 9.4 Validate `--timeout` as a Go-duration string accepting positive durations only; clear error on parse failure
- [ ] 9.5 Resolve namespace by reading the kubeconfig file directly (NOT by shelling out to `kubectl config view` — see 10.7's no-shell-out assertion): `--namespace` flag → active context's `namespace` field in the parsed kubeconfig → `default`; pass the resolved value as `?namespace=` query param to ark-api
- [ ] 9.6 Drive the flow via `ArkApiProxy`: POST `/auth/start` → print and (unless `--no-open`) `open()` the URL → poll `GET /auth/status` every 2s up to `--timeout`
- [ ] 9.7 Exit zero on `authorized`; exit non-zero on `failed`, `expired`, or poll-timeout — single `output.error("mcp auth failed:", <msg>)` line per failure
- [ ] 9.8 Print `expires_at` on success — do NOT print `status.authorization.resource` (the CLI never reads the MCPServer directly and the auth endpoints do not surface the resource URL in their response bodies; spec's "no fields beyond auth/start and auth/status responses" requirement forbids it)
- [ ] 9.9 `ark mcp auth logout <server-name>` flags: `--namespace`, `--keep-client`, `--delete-secret`; client-side mutual-exclusion check before contacting ark-api
- [ ] 9.10 POST `/auth/logout` and translate HTTP status to exit code (200 with `noop:true` → exit zero; other 200 → exit zero; 404 → exit non-zero with "MCPServer not found"; 4xx → exit non-zero with body message)

## 10. CLI tests

- [ ] 10.1 `auth.spec.ts` — happy path with mock ark-api: start returns `auth_id` + URL → status polls return `pending` then `authorized` → CLI exits zero
- [ ] 10.2 Negative paths: `auth/start` returns 409 without `force`; `auth/status` returns `failed` with `invalid_grant`; poll loop exceeds `--timeout`; ark-api unreachable via proxy; `--force-registration` without `--force` on a non-Required MCPServer surfaces the 409 verbatim
- [ ] 10.2.1 `--force-registration` test: assert the CLI sends `force_registration: true` in the `auth/start` body and that the flag is independent of `--force`
- [ ] 10.3 `--no-open` test: assert the authorization URL is printed to stdout and `defaultDeps.openBrowser` is NOT invoked
- [ ] 10.4 Namespace resolution unit tests: explicit `--namespace`, active kubeconfig context's namespace fallback (read directly from the kubeconfig file, never via `kubectl config view` — see 10.7), `default` fallback
- [ ] 10.5 `--timeout` parser tests: `60s`, `5m`, `1h` accepted; `abc`, `-1m`, `0s` rejected
- [ ] 10.6 `logout.spec.ts` — default, `--keep-client`, `--delete-secret`, mutual-exclusion error, no-op on missing Secret, non-zero on missing MCPServer
- [ ] 10.7 Assert no `kubectl` shell-out for Kubernetes resource operations (read/patch MCPServers, read/patch/create Secrets, list resources) in any auth code path. Mock `execa`/equivalent and fail the test if it is invoked with `kubectl` arguments other than `port-forward` — `ArkApiProxy`'s own `kubectl port-forward` to reach the in-cluster ark-api Service is the explicit carve-out, since every other CLI command uses it the same way.
- [ ] 10.8 Assert tokens, refresh tokens, client secrets, and PKCE verifiers do not appear in CLI stdout/stderr across success and failure paths

## 11. Documentation

- [ ] 11.1 `docs/content/` — operator guide for `ARK_API_PUBLIC_CALLBACK_URL` (public ingress + air-gapped port-forward recipes). The port-forward recipe SHALL show `kubectl port-forward --address 127.0.0.1,::1 svc/ark-api 8080:80` so the browser reaches the listener regardless of how the OS resolves `localhost`.
- [ ] 11.2 `docs/content/` — `ark mcp auth login` / `logout` CLI reference
- [ ] 11.3 Note in the MCP authorization overview that token writes go through ark-api and surface the `authorized-by` annotation as the visible side-effect; link to the (future) per-user-tokens capability for the multi-user limitation
- [ ] 11.4 External-executor header-resolution workaround. Document under `docs/content/` (MCP authorization page) that when an agent targets an external `ExecutionEngine` (claude-agent-sdk, langchain, …) AND uses `ark mcp auth login` against an MCPServer whose `spec.authorization.tokenSecretRef` is the sole authorization source, the operator SHALL add a redundant `spec.headers[]` entry of the form:

  ```yaml
  spec:
    headers:
      - name: Authorization
        value:
          valueFrom:
            secretKeyRef:
              name: <same as spec.authorization.tokenSecretRef.name>
              key: <accessTokenKey override, or "access_token" by default>
  ```

  The redundancy is intentional: the controller already resolves `spec.authorization` for tool discovery; this extra entry lets the SDK's `_resolve_mcp_server()` resolve the same token for query-dispatch `MCPServerConfig`. The doc SHALL link to the `mcp-auth-sdk-header-resolution` follow-up capability and SHALL note that the entry becomes unnecessary once that capability lands.
