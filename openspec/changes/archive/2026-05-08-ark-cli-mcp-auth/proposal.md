## Why

Stage 1 (`mcp-auth-token-injection`) reads tokens from a Secret and reaches `Authorized`, but leaves token *production* to the operator. Today that means: discover OAuth metadata, register a dynamic client, drive PKCE through a browser, exchange the code, then `kubectl create secret` with the right keys. Miss a step and the controller stays in `Required` with no useful surface.

This change adds `ark mcp auth login <server-name>` — one command that reads the discovered endpoints from `status.authorization`, runs RFC 7591 + RFC 7636 (DCR + PKCE on a loopback redirect), and writes the resulting tokens to the exact Secret the controller is polling. The controller transitions `Required → Authorized` on its next reconcile.

It also adds `ark mcp auth logout <server-name>`. Today operators recover from connecting to the wrong server or upstream token revocation by hand-editing the Secret with `kubectl edit secret`; `logout` makes that a one-liner.

The CLI is a UX layer over the existing Stage 1 contract. No CRD, controller, or RBAC changes.

## What Changes

- Add `ark mcp auth login <server-name>` to `ark-cli`. Behaviour:
  - Reads the target `MCPServer` via `kubectl`. Refuses to run unless `status.authorization.state == Required`. Override with `--force`.
  - Reads `status.authorization.{registrationEndpoint, authorizationEndpoint, tokenEndpoint, resource, scopesSupported}` populated by detection.
  - Picks a free loopback port (or `--port <n>`) and starts an `http://127.0.0.1:<port>/callback` listener. Auto-opens the browser unless `--no-open`. The authorization URL is always printed to stdout so headless / SSH operators can paste it manually.
  - Performs RFC 7591 Dynamic Client Registration with `redirect_uris=[<loopback>]`, `grant_types=[authorization_code, refresh_token]`, `response_types=[code]`, `token_endpoint_auth_method=client_secret_basic`. Rejects responses whose `redirect_uris` exclude the loopback URL.
  - Builds the authorization URL with PKCE S256, random `state`, and `resource=<MCP URL>` (RFC 8707). Waits up to `--timeout <duration>` (default 5 minutes).
  - Exchanges the code at `tokenEndpoint` using HTTP Basic with the registered `client_id` / `client_secret` plus the PKCE verifier.
  - Patches the Secret named in `spec.authorization.tokenSecretRef.name` using the configured key names (defaults `access_token`, `refresh_token`, `expires_at`, `client_id`, `client_secret`). Creates the Secret if absent.
  - Computes `expires_at = now + expires_in - 30s` (RFC 3339 UTC) — the 30s margin absorbs clock skew between the CLI host, the IdP, and the controller, plus typical network round-trip on the next reconcile.
  - Prints the resource URL, `expires_at`, and the expected `Required → Authorized` next transition. Exits non-zero on failure with one `output.error("mcp auth failed:", <message>)` line.
- Add `ark mcp auth logout <server-name>` to `ark-cli`. Behaviour:
  - Default: kubectl-patches the Secret named in `spec.authorization.tokenSecretRef.name`, setting `access_token`, `refresh_token`, `expires_at`, `client_id`, `client_secret` to empty strings. Honours `*Key` overrides on `tokenSecretRef`.
  - `--keep-client`: only empties `access_token`, `refresh_token`, `expires_at`. Preserves `client_id` / `client_secret` so a subsequent `login` re-uses the registered OAuth client without a fresh DCR.
  - `--delete-secret`: deletes the Secret resource entirely instead of patching empties.
  - `--keep-client` and `--delete-secret` are mutually exclusive.
  - Idempotent on missing Secret (no-op, exit zero). Missing MCPServer → exit non-zero.
  - On the controller's next reconcile, the empty `access_token` falls through the existing 401 path and `status.authorization.state` collapses to `Required` — ready for `ark mcp auth login`.
- Wire the commands into `tools/ark-cli/src/index.tsx`.
- Ship `pkce.ts` (S256 verifier/challenge + state) plus unit tests and an end-to-end `runAuth` test mocking the OAuth endpoints and `kubectl`.

### Headless / SSH operators

OAuth 2.1 loopback redirect (RFC 8252 §7.3) requires `127.0.0.1` / `[::1]` — authorization servers reject other hostnames. For a CLI session on a remote host:

```sh
# on the laptop
ssh -L 8080:localhost:8080 jumphost
# on the jumphost
ark mcp auth login notion --port 8080 --no-open
```

The CLI prints the authorization URL with `http://127.0.0.1:8080/callback`. Paste it into the browser on the laptop — SSH forwards the loopback callback back to the jumphost. Loopback stays loopback. The proper headless flow (RFC 8628 device authorization grant) is out of scope; most MCP authorization servers do not support it yet.

## Capabilities

### New Capabilities

- `ark-cli-mcp-auth`: `ark mcp auth login <server-name>` drives DCR + PKCE + loopback callback against an `MCPServer`'s discovered endpoints and patches the controller-referenced Secret. `ark mcp auth logout <server-name>` empties (or deletes) the same Secret to return the server to `Required`.

### Modified Capabilities

None. Consumes `mcp-auth-detection` (`status.authorization.*`) and `mcp-auth-token-injection` (`spec.authorization.tokenSecretRef`) unchanged (see `openspec/specs/mcp-auth-detection/` and `openspec/specs/mcp-auth-token-injection/`).

## Impact

- **Scope:** `tools/ark-cli/` only. No controller, CRD, RBAC, or Helm changes.
- **New runtime deps:** none. `execa` and `open` already in `tools/ark-cli/package.json`.
- **User-facing:** new command replaces the operator runbook. Stage 1 manual path still works.
- **Security:** tokens written via the user's kubeconfig RBAC. CLI never persists tokens to disk, never logs them.

## Non-Goals

- Token refresh — Stage 2 (`mcp-auth-token-refresh`). Re-run `ark mcp auth login` until then.
- Validating webhook for `spec.headers[Authorization]` vs `spec.authorization` clash — Stage 2.
- Chainsaw e2e — blocked on TLS-capable in-cluster mock MCP.
- Non-loopback / device-code flows — loopback covers every interactive MCP host today.
