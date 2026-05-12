## 1. ark-api configuration

- [ ] 1.1 Add `ARK_API_PUBLIC_CALLBACK_URL` env var with HTTPS-or-loopback validation at startup; refuse to start on a non-HTTPS public host
- [ ] 1.2 Add `ARK_API_MCP_AUTH_CACHE_TTL_SECONDS` (default `600`)
- [ ] 1.3 Add `ARK_API_MCP_AUTH_DCR_TIMEOUT_SECONDS` (default `15`)
- [ ] 1.4 Add `ARK_API_MCP_AUTH_TOKEN_TIMEOUT_SECONDS` (default `15`)
- [ ] 1.5 Document the env vars in `services/ark-api/README.md` and in the Helm chart values

## 2. ark-api primitives

- [ ] 2.1 `services/ark-api/ark-api/src/ark_api/services/pkce.py` — `generate_verifier()`, `derive_challenge(verifier)`, `generate_state()`
- [ ] 2.2 PKCE unit tests — verifier alphabet, length bounds (default 64), challenge equals `BASE64URL(SHA-256(verifier))`, state >= 16 bytes random
- [ ] 2.3 `services/ark-api/ark-api/src/ark_api/services/mcp_auth_cache.py` — TTL'd cache addressable by `auth_id` and `state`; delete-on-lookup for the callback path

## 3. ark-api outbound clients

- [ ] 3.1 `services/ark-api/ark-api/src/ark_api/services/oauth_dcr.py` — RFC 7591 DCR client. POST `client_name=ark`, `redirect_uris=[<configured>]`, `grant_types=["authorization_code","refresh_token"]`, `response_types=["code"]`, `token_endpoint_auth_method=client_secret_basic`. Reject responses whose `redirect_uris` omits the configured URI. Reject `token_endpoint_auth_method` other than `client_secret_basic` or `none`.
- [ ] 3.2 `services/ark-api/ark-api/src/ark_api/services/oauth_token.py` — POST `grant_type=authorization_code`, `code`, `redirect_uri`, `code_verifier`, `resource=<MCP URL>`, HTTP Basic with `client_id` / `client_secret`. Surface OAuth `error` verbatim on non-2xx.
- [ ] 3.3 Unit tests with `respx` (or equivalent) mocking the IdP endpoints — DCR redirect-URI enforcement, unsupported `token_endpoint_auth_method`, token exchange success, token exchange 4xx

## 4. ark-api endpoints

- [ ] 4.1 `services/ark-api/ark-api/src/ark_api/api/v1/mcp_auth.py` — register the four routes
- [ ] 4.2 `POST /api/v1/mcp-servers/{name}/auth/start` — preflight against `status.authorization.state`, DCR-cache-or-fresh, PKCE generation, cache entry creation, URL assembly with `resource` indicator (RFC 8707)
- [ ] 4.3 `GET /api/v1/mcp/auth/callback` — state lookup, delete-on-lookup, token exchange, Secret patch (create-if-absent), `mcp-token-secret` label stamp, MCPServer annotations (`authorized-by`, `authorized-at`), success/failure HTML pages
- [ ] 4.4 `GET /api/v1/mcp-servers/{name}/auth/status` — terminal state requires both cache `authorized` AND MCPServer `status.authorization.state == Authorized`
- [ ] 4.5 `POST /api/v1/mcp-servers/{name}/auth/logout` — default / `keep_client` / `delete_secret` matrix; mutual-exclusion check; idempotent missing Secret; 404 missing MCPServer; annotation removal
- [ ] 4.6 Plug the new module into the FastAPI router registration

## 5. ark-api persistence helpers

- [ ] 5.1 Reuse the existing Kubernetes Secret read/write code paths in ark-api (used by other services) rather than introducing a parallel implementation
- [ ] 5.2 Honour the `*Key` overrides from `tokenSecretRef` when constructing the patch payload
- [ ] 5.3 Compute `expires_at = now + expires_in - 30s` (RFC 3339 UTC) only when `expires_in > 0`; omit the key otherwise and emit a warning log
- [ ] 5.4 Add MCPServer-patch helper for the annotation pair (set on success, remove on logout)

## 6. ark-api RBAC

- [ ] 6.1 Extend the ark-api SA ClusterRole / Role in `services/ark-api/chart/` with `get/list/watch/create/patch/update/delete` on Secrets in the namespaces ark-api serves
- [ ] 6.2 Verify the SA already has `get/patch` on `mcpservers/status` (or add it) for the annotation patch
- [ ] 6.3 Document the RBAC delta in the chart values comments

## 7. ark-api endpoint tests

- [ ] 7.1 `auth/start` — preflight refusal on Authorized without `force`; success on Required; `force` bypasses preflight; cache entry populated with verifier + state + caller identity
- [ ] 7.2 `auth/start` — DCR happens when Secret lacks `client_secret`; DCR is skipped when both `client_id` and `client_secret` are populated
- [ ] 7.3 `auth/start` — DCR rejection paths (missing `redirect_uris`, unsupported `token_endpoint_auth_method`) propagate as 502
- [ ] 7.4 `auth/start` — Secret untouched on any flow-pre-exchange failure
- [ ] 7.5 `auth/callback` — unknown state → 400 HTML; known state succeeds; second hit for same code → 400 (replay protection via delete-on-lookup)
- [ ] 7.6 `auth/callback` — `error=access_denied` → 400 HTML, cache entry transitions to `failed`, Secret unchanged
- [ ] 7.7 `auth/callback` — token-exchange 400 transitions cache to `failed` with the error string, Secret unchanged
- [ ] 7.8 `auth/callback` — successful exchange creates the Secret if absent; patches with configured `*Key` overrides; stamps `mcp-token-secret` label; stamps MCPServer annotations
- [ ] 7.9 `auth/callback` — `expires_in` missing or ≤ 0 omits `expires_at` key and emits a warning
- [ ] 7.10 `auth/status` — pending while cache is in-flight; pending when cache is `authorized` but MCPServer status hasn't reconciled; authorized only when both align; unknown `auth_id` returns `expired` (not 404)
- [ ] 7.11 `auth/logout` — default empties five keys; `keep_client` preserves DCR creds; `delete_secret` removes the resource; mutual exclusion returns 400; missing Secret returns 200 `{noop:true}`; missing MCPServer returns 404; annotations are removed on every success path
- [ ] 7.12 Token material redaction — assert logs across all four endpoints contain no token, refresh-token, client-secret, or PKCE-verifier values

## 8. ark-api OpenAPI surface

- [ ] 8.1 Add request/response models for the four endpoints in `services/ark-api/ark-api/src/ark_api/models/`
- [ ] 8.2 Regenerate the OpenAPI schema and the downstream typed clients (`lib/api/generated/types.ts` consumers picked up automatically by the dashboard repo when it lands the follow-up capability)

## 9. CLI thin client

- [ ] 9.1 Register `ark mcp` parent command in `tools/ark-cli/src/index.tsx`
- [ ] 9.2 Register `ark mcp auth` parent command with `login` and `logout` subcommands
- [ ] 9.3 `ark mcp auth login <server-name>` flags: `--namespace`, `--force`, `--no-open`, `--timeout <duration>`. NO `--port` flag.
- [ ] 9.4 Validate `--timeout` as a Go-duration string accepting positive durations only; clear error on parse failure
- [ ] 9.5 Resolve namespace: `--namespace` → current `kubectl` context → `default`; pass as `?namespace=` query param
- [ ] 9.6 Drive the flow via `ArkApiProxy`: POST `/auth/start` → print and (unless `--no-open`) `open()` the URL → poll `GET /auth/status` every 2s up to `--timeout`
- [ ] 9.7 Exit zero on `authorized`; exit non-zero on `failed`, `expired`, or poll-timeout — single `output.error("mcp auth failed:", <msg>)` line per failure
- [ ] 9.8 Print resource URL + `expires_at` on success
- [ ] 9.9 `ark mcp auth logout <server-name>` flags: `--namespace`, `--keep-client`, `--delete-secret`; client-side mutual-exclusion check before contacting ark-api
- [ ] 9.10 POST `/auth/logout` and translate HTTP status to exit code (200 with `noop:true` → exit zero; other 200 → exit zero; 404 → exit non-zero with "MCPServer not found"; 4xx → exit non-zero with body message)

## 10. CLI tests

- [ ] 10.1 `auth.spec.ts` — happy path with mock ark-api: start returns `auth_id` + URL → status polls return `pending` then `authorized` → CLI exits zero
- [ ] 10.2 Negative paths: `auth/start` returns 409 without `force`; `auth/status` returns `failed` with `invalid_grant`; poll loop exceeds `--timeout`; ark-api unreachable via proxy
- [ ] 10.3 `--no-open` test: assert the authorization URL is printed to stdout and `defaultDeps.openBrowser` is NOT invoked
- [ ] 10.4 Namespace resolution unit tests: explicit `--namespace`, `kubectl` context fallback, `default` fallback
- [ ] 10.5 `--timeout` parser tests: `60s`, `5m`, `1h` accepted; `abc`, `-1m`, `0s` rejected
- [ ] 10.6 `logout.spec.ts` — default, `--keep-client`, `--delete-secret`, mutual-exclusion error, no-op on missing Secret, non-zero on missing MCPServer
- [ ] 10.7 Assert no `kubectl` shell-out in any auth code path (mock `execa`/equivalent and fail the test if it's invoked)
- [ ] 10.8 Assert tokens, refresh tokens, client secrets, and PKCE verifiers do not appear in CLI stdout/stderr across success and failure paths

## 11. Documentation

- [ ] 11.1 `docs/content/` — operator guide for `ARK_API_PUBLIC_CALLBACK_URL` (public ingress + air-gapped port-forward recipes)
- [ ] 11.2 `docs/content/` — `ark mcp auth login` / `logout` CLI reference (drop the `--port` flag and the loopback-bridging recipe from the PR #2065 draft)
- [ ] 11.3 Note in the MCP authorization overview that token writes go through ark-api and surface the `authorized-by` annotation as the visible side-effect; link to the (future) per-user-tokens capability for the multi-user limitation

## 12. Carry-over from PR #2065

- [ ] 12.1 Mark `openspec/changes/ark-cli-mcp-auth/` as superseded by this change in its `proposal.md` Non-Goals or via an `archive/` move when this change lands (decision deferred to merge time)
- [ ] 12.2 Confirm with PR #2065's author that the loopback-listener code on the existing feature branch is abandoned rather than carried forward into this implementation
