## 1. CLI command surface

- [ ] 1.1 Register `ark mcp` parent command in `tools/ark-cli/src/index.tsx`
- [ ] 1.2 Register `ark mcp auth` parent command with `login` and `logout` subcommands
- [ ] 1.3 Add `ark mcp auth login <server-name>` subcommand with `--namespace`, `--force`, `--port`, `--no-open`, `--timeout`
- [ ] 1.4 Validate `--port` and `--timeout` parse as non-negative integers; clear error otherwise

## 2. Resource resolution

- [ ] 2.1 Resolve namespace: `--namespace` → current `kubectl` context → `default`
- [ ] 2.2 `kubectl get mcpserver <name> -o json`; refuse if `status.authorization.state != Required` unless `--force`
- [ ] 2.3 Read `spec.authorization.tokenSecretRef.name` and optional `*Key` overrides

## 3. PKCE primitive

- [ ] 3.1 `generatePkcePair()` — verifier 43-128 unreserved chars, S256 challenge (`tools/ark-cli/src/commands/mcp/pkce.ts`)
- [ ] 3.2 `generateState()` — cryptographically random opaque string
- [ ] 3.3 Unit tests: verifier alphabet, length bounds, challenge derivation

## 4. OAuth flow

- [ ] 4.1 Loopback HTTP listener on `--port` (or free port) handling `GET /callback`; reject missing `code`/`state` or `error=*`
- [ ] 4.2 RFC 7591 DCR against `registrationEndpoint`; reject responses whose `redirect_uris` exclude the loopback URL
- [ ] 4.3 Build authorization URL: `response_type=code`, `client_id`, `redirect_uri`, `state`, S256 challenge, `resource=<MCP URL>` (RFC 8707); `scope` only when supplied
- [ ] 4.4 Open URL in default browser unless `--no-open`; always print URL
- [ ] 4.5 Wait up to `--timeout` (default 5 minutes); single actionable error on timeout
- [ ] 4.6 Verify returned `state` matches generated value before continuing
- [ ] 4.7 Exchange code at `tokenEndpoint` with HTTP Basic + PKCE verifier; surface OAuth error verbatim on non-2xx

## 5. Secret persistence

- [ ] 5.1 Resolve key names from `tokenSecretRef` with documented defaults
- [ ] 5.2 Compute `expires_at = now + expires_in - 30s` (RFC 3339 UTC) when `expires_in` present
- [ ] 5.3 `kubectl create secret generic` if absent, else `kubectl patch secret` with base64 `data`
- [ ] 5.4 Omit keys whose value is empty or absent

## 6. Output and errors

- [ ] 6.1 Print resource URL, `expires_at`, expected `Required → Authorized` transition on success
- [ ] 6.2 Failure → exit non-zero with one `output.error("mcp auth failed:", <message>)` line
- [ ] 6.3 Never log access tokens, refresh tokens, client secrets, or `Authorization` headers

## 7. Tests

- [ ] 7.1 PKCE unit tests (`pkce.spec.ts`)
- [ ] 7.2 End-to-end `runAuth` spec (`auth.spec.ts`) with mock OAuth endpoints + fake `kubectl`; assert patched Secret payload for `ark mcp auth login`
- [ ] 7.3 Negative paths: state mismatch, callback timeout, missing `tokenEndpoint`, bad `redirect_uris`

## 8. Auth logout subcommand

- [ ] 8.1 Add `ark mcp auth logout <server-name>` subcommand with `--namespace`, `--keep-client`, `--delete-secret`
- [ ] 8.2 Resolve target MCPServer + Secret name + `*Key` overrides via the same code path as `login`
- [ ] 8.3 Default behaviour: `kubectl patch secret` to set `access_token`, `refresh_token`, `expires_at`, `client_id`, `client_secret` (or their overridden key names) to empty strings
- [ ] 8.4 `--keep-client`: only empty `access_token`, `refresh_token`, `expires_at`; preserve `client_id` / `client_secret`
- [ ] 8.5 `--delete-secret`: `kubectl delete secret <referenced-name>` instead of patching
- [ ] 8.6 Reject `--keep-client` + `--delete-secret` combination before contacting the cluster; exit non-zero with a clear error
- [ ] 8.7 Output a one-line summary of the cleared keys plus a next-step hint pointing at `ark mcp auth login`
- [ ] 8.8 Idempotent on missing Secret (no-op, exit zero); missing MCPServer → exit non-zero
- [ ] 8.9 Tests covering: default clear, `--keep-client`, `--delete-secret`, missing Secret, missing MCPServer, mutual exclusion error
