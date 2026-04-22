# Statement of Work — mock-llm MCP OAuth Support

**Target repo:** `github.com/dwmkerr/mock-llm`
**Working copy:** `/Users/Dave_Kerr/repos/github/dwmkerr/mock-llm/feat/method-matching-and-models/`
**Owner:** mock-llm
**Consumer:** Ark `mcp-auth-cli-authorize` change (`openspec/changes/mcp-auth-cli-authorize/`)

## Why

Ark is adding OAuth 2.1 authentication for remote MCP servers (see `proposal.md` and `specs/mcp-auth-cli-authorize/spec.md` in this change folder). Chainsaw e2e tests must run against a fixture that emulates a real OAuth-protected MCP server without hitting Notion / Atlassian / Linear. mock-llm already mocks OpenAI, A2A, and MCP — it is the right place to add OAuth server emulation.

Target fidelity: enough to exercise the controller's state machine (`Required → Authorized → Expired → RefreshFailed → Required`) and the CLI's OAuth flow end-to-end. Not a general-purpose OAuth provider.

## Scope

### In

1. **Protected resource mode** — serve an MCP endpoint that gates all `initialize`, `tools/list`, `tools/call` requests behind a Bearer token check.
2. **RFC 9728 metadata** — serve `/.well-known/oauth-protected-resource[/<path>]` with the document the controller expects.
3. **RFC 8414 metadata** — serve `/.well-known/oauth-authorization-server` advertising endpoints below.
4. **RFC 7591 Dynamic Client Registration** — `POST /register` endpoint returning a `client_id` (and optionally `client_secret`), configurable per-rule.
5. **RFC 6749 §4.1 Authorization endpoint** — `GET /authorize` that auto-approves and redirects to the supplied `redirect_uri` with an authorization code. No user interaction; this is a fixture.
6. **RFC 6749 §3.2 Token endpoint** — `POST /token` supporting:
   - `grant_type=authorization_code` with PKCE (RFC 7636): verify `code_verifier` matches the earlier `code_challenge`.
   - `grant_type=refresh_token`: issue new access + refresh tokens.
   - Return `access_token`, `refresh_token`, `expires_in`, `token_type=Bearer`.
7. **401 challenge semantics** — when a request arrives at the MCP endpoint without a valid Bearer, return `401` with `WWW-Authenticate: Bearer realm="mcp", resource_metadata="<RFC9728 URL>"`.
8. **Token expiry control** — config knob to issue short-lived tokens (`expires_in: 5`) so refresh can be exercised inside a test.
9. **Token revocation trigger** — config knob to flip an issued token from valid → invalid without restart, so the controller sees a `401` after prior success and transitions back to `Required`.
10. **Deterministic issuance** — tokens must be reproducible given config, so chainsaw asserts can compare exact values (e.g. `access_token: "fixture-access-001"`).
11. **Docs + samples** — add `samples/14-mcp-oauth-discovery.sh`, `samples/15-mcp-oauth-pkce-flow.sh`, `samples/16-mcp-oauth-refresh.sh` following the existing `.sh` sample pattern.

### Out

- Real cryptographic signing (JWT, JWKS). Opaque fixture tokens are enough.
- Real user consent UI. `/authorize` auto-approves.
- TLS. Chainsaw runs in-cluster over HTTP.
- Token revocation endpoint (RFC 7009).
- Device flow (RFC 8628).
- Multi-tenant / multi-user isolation.

## Configuration Surface

Extend the existing mock-llm config (the `POST /config` rules model) with a new top-level block. Keep backwards compatibility — no existing sample should break.

```yaml
# Illustrative — final shape at implementor's discretion
oauth:
  # Which MCP endpoints require a Bearer token
  protectedPaths:
    - /mcp/
  # Issued at DCR time, or pre-registered
  clients:
    - clientId: fixture-client
      clientSecret: fixture-secret   # omit for public clients
      redirectUris: ["http://127.0.0.1:*"]
  # Token behaviour
  tokens:
    expiresInSeconds: 3600
    refreshable: true
    revoked: []                      # appending here invalidates previously issued tokens
  # Discovery overrides (defaults fine for most tests)
  metadata:
    resourceName: "Mock MCP Resource"
    scopesSupported: ["mcp:read", "mcp:tools"]
    grantTypesSupported: ["authorization_code", "refresh_token"]
    registrationEndpoint: enabled    # set false to simulate pre-registered-only IdP
```

Also expose control endpoints for test orchestration:

```
POST /oauth/revoke     { "token": "fixture-access-001" }
POST /oauth/expire     { "token": "fixture-access-001" }   # force early expiry
POST /oauth/reset                                           # wipe issued tokens/clients
```

## Discovery Response Contracts

Controller uses `github.com/modelcontextprotocol/go-sdk/oauthex`. Responses MUST be valid RFC 9728 / RFC 8414 documents. Minimum required fields:

**`/.well-known/oauth-protected-resource`**
```json
{
  "resource": "http://<svc>/mcp",
  "resource_name": "Mock MCP Resource",
  "authorization_servers": ["http://<svc>"]
}
```

**`/.well-known/oauth-authorization-server`**
```json
{
  "issuer": "http://<svc>",
  "authorization_endpoint": "http://<svc>/authorize",
  "token_endpoint": "http://<svc>/token",
  "registration_endpoint": "http://<svc>/register",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "scopes_supported": ["mcp:read", "mcp:tools"]
}
```

PKCE `S256` is required — Ark CLI will send `code_challenge_method=S256`.

## Acceptance Criteria

| # | Criterion | Verification |
|---|---|---|
| 1 | Unauthenticated `initialize` returns 401 with RFC 9728 `WWW-Authenticate` | `curl -i` inspection |
| 2 | `GET /.well-known/oauth-protected-resource` returns valid RFC 9728 JSON | `jq` schema check |
| 3 | `GET /.well-known/oauth-authorization-server` returns valid RFC 8414 JSON | `jq` schema check |
| 4 | `POST /register` returns `client_id` (+ optional `client_secret`) | new sample script |
| 5 | `GET /authorize` with valid params redirects to `redirect_uri` with `code` + `state` | sample script |
| 6 | `POST /token` with matching `code_verifier` returns tokens; wrong verifier returns 400 | sample script |
| 7 | `POST /token` with `grant_type=refresh_token` issues new tokens; old refresh_token optionally rotated | sample script |
| 8 | MCP `initialize` with valid Bearer succeeds; with expired/revoked Bearer returns 401 | sample script |
| 9 | `POST /oauth/revoke` flips state so next request sees 401 | sample script |
| 10 | All existing mock-llm samples (1–13) still pass | `npm run test:samples` |
| 11 | New unit tests in `src/mcp/oauth/*.spec.ts` cover happy path + 6 error cases | `npm test` |
| 12 | README updated with an "OAuth emulation" section | review |
| 13 | Chainsaw e2e test in Ark repo using the fixture transitions an MCPServer through `Required → Authorized → Expired → Authorized` | `chainsaw test --selector '!llm'` |

## Test Artifacts (downstream Ark)

Stage-gated — the Ark repo will land these in follow-up PRs that depend on this SoW shipping:

- `ark/tests/mcp-auth-stage-1-manual-token/` — Secret pre-populated with a fixture token from mock-llm `/oauth/config`.
- `ark/tests/mcp-auth-stage-2-refresh/` — short `expires_in`, assert controller refreshes.
- `ark/tests/mcp-auth-stage-2-refresh-fail/` — force `revoked`, assert `RefreshFailed` condition.
- `ark/tests/mcp-auth-stage-4-cli-flow/` — full CLI + DCR + PKCE + token exchange against mock-llm.

## Implementation Notes

1. **Reuse the MCP SDK already present** (`@modelcontextprotocol/sdk@^1.20.1`). Do not hand-roll MCP transport. Thin adapter for the OAuth gate on top.
2. **Opaque tokens** — generate via `crypto.randomBytes(16).toString("hex")` or accept a configured deterministic value.
3. **PKCE verification** — `base64url(sha256(code_verifier)) === code_challenge`. `crypto.createHash("sha256")`, then `Buffer.toString("base64url")`.
4. **State storage** — in-memory map keyed by `code`, with 10-minute TTL. No persistence.
5. **Clock** — inject a clock source so tests can force expiry without sleeping.
6. **Do not invent CLI UX for the fixture** — this is a server. CLI work lives in Ark `tools/ark-cli`.

## References

- RFC 6749 — OAuth 2.0 core (authorization + token endpoints)
- RFC 7591 — Dynamic Client Registration
- RFC 7636 — PKCE
- RFC 8252 — OAuth for Native Apps (loopback redirects)
- RFC 8414 — Authorization Server Metadata
- RFC 9728 — Protected Resource Metadata
- MCP 2025-06-18 authorization specification
- Ark change proposal: `openspec/changes/mcp-auth-cli-authorize/proposal.md`
- Ark spec: `openspec/changes/mcp-auth-cli-authorize/specs/mcp-auth-cli-authorize/spec.md`

## Definition of Done

- All 13 acceptance criteria green.
- New mock-llm release tagged (`ghcr.io/dwmkerr/mock-llm:X.Y.Z`).
- `samples/mocks/mock-llm.yaml` in Ark bumped to pin the new image version.
- README section linked from the mock-llm root README.
- Ark chainsaw fixture PR can open and pass against the new image.
