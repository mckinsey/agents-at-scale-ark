## Context

Validated against a live `MCPServer` pointing at Notion's hosted remote MCP (`https://mcp.notion.com/mcp`). Observed behaviour on the current controller (2026-04-21):

```
HTTP/2 401
www-authenticate: Bearer realm="OAuth",
  resource_metadata="https://mcp.notion.com/.well-known/oauth-protected-resource/mcp",
  error="invalid_token"
```

```yaml
status:
  conditions:
  - type: Available
    status: "False"
    reason: ClientCreationFailed
    message: "Server not ready due to client creation failure"
```

Event: `Failed to create MCP client: ... calling "initialize": sending "initialize": Unauthorized`

The OAuth discovery data (resource metadata URL, authorization server list, registration endpoint) is discarded by `github.com/modelcontextprotocol/go-sdk/mcp.Client.Connect()` before reaching the controller. Status is indistinguishable from DNS failure, TLS error, or a dead endpoint.

## Goal

Make authorization failure **observable and structured** so dashboard, CLI, and a future `ark-api` OAuth flow have a stable contract to act on. No OAuth client, no token exchange, no browser flow in this change.

## Division of Responsibility (reference)

```
+----------------------+     (later changes)      +----------------------+
|   ark-controller     |                          |       ark-api        |
|   (this change)      |                          |  (follow-up change)  |
|                      |                          |                      |
|  detect 401          |                          |  RFC 7591 register   |
|  parse WWW-Auth.     |                          |  PKCE auth URL       |
|  fetch RFC 9728      |   status.authorization   |  OAuth callback      |
|  fetch RFC 8414      |   (CRD contract)         |  token exchange      |
|  populate status     |<------------- read ------|  write Secret        |
|  set condition       |                          |                      |
|                      |                          |                      |
|  (later) read Secret |   Secret contract        |                      |
|  (later) refresh     |<---------- write --------|                      |
+----------------------+                          +----------------------+
                                                             ^
                                                             | (later)
                                                   +---------+---------+
                                                   | dashboard / CLI   |
                                                   +-------------------+
```

This change lands only the left-hand box plus the `status.authorization` contract. Everything else ships in follow-up OpenSpec changes (`mcp-auth-oauth-flow`, `mcp-auth-token-refresh`, `mcp-auth-dashboard-ux`, `mcp-auth-cli`).

## Decisions

### Decision 1: Surface an error type from `internal/mcp`, not string-matching

`internal/mcp/mcp.go` currently wraps SDK errors into generic strings. We introduce a typed error `ErrUnauthorized` returned when the underlying transport sees a 401. The controller branches on `errors.Is(err, mcp.ErrUnauthorized)` and pulls the original `http.Response` (captured on the transport) to read `WWW-Authenticate`.

**Alternatives considered:**
- *String-match on `err.Error()`* — brittle; go-sdk error wording changes across versions.
- *Patch go-sdk upstream* — higher value, but out of scope for this change. File an upstream issue.

### Decision 2: Perform discovery with a dedicated HTTP client, not via the MCP SDK

Once we know the server speaks OAuth, we use `net/http` directly to fetch the two `.well-known` documents. This avoids coupling discovery to the MCP SDK session lifecycle and lets us re-run discovery cheaply on each poll.

### Decision 3: Store discovery output on `status`, not as annotations

Annotations (our `MigrationWarningPrefix` pattern) are a good fit for short, human-visible notes. Structured OAuth metadata is machine-consumed by the dashboard and future ark-api flow — it belongs on `status` with a typed Go struct so it shows up in the generated OpenAPI schema and the TypeScript SDK.

### Decision 4: No spec changes in this change

`spec.authorization` (token Secret refs, client Secret refs, scopes) belongs with the token-storage change, not here. Keeping spec untouched means this change is purely additive on `status` and cannot break existing `MCPServer` manifests.

### Decision 5: Condition reason naming

We use `AuthorizationRequired` (not `Unauthorized`, not `AuthFailed`) to match the MCP spec wording ("authorization is optional; when required...") and to make the state self-describing for a non-expert reader of `kubectl describe mcpserver`.

## Open Questions

1. **Should the controller retry discovery aggressively on first-time 401, or wait for `pollInterval`?** Leaning toward: immediate retry once, then back off to `pollInterval` — otherwise the user waits up to a minute to see `AuthorizationRequired` after first applying the CR.
2. **Should `ClientCreationFailed` still fire before `AuthorizationRequired`, or be replaced?** Current plan: `AuthorizationRequired` replaces `ClientCreationFailed` on `Available` when authorization is the cause. Any other 401-but-not-OAuth cases (rare) remain `ClientCreationFailed`.
3. **RFC 9728 URL construction fallback.** If a server returns 401 without `resource_metadata=` in `WWW-Authenticate` (non-compliant), do we still attempt `<origin>/.well-known/oauth-protected-resource`? Spec says no — we log and surface partial state.

## Risks

- **go-sdk error shape.** `go-sdk` (v1.4.1) error messages are not typed; we are relying on surface-level detection. Mitigated by centralising the 401 check in `internal/mcp`.
- **Schema churn.** Adding `status.authorization` changes the generated CRD, Python SDK, TypeScript SDK, and OpenAPI. Must be regenerated in the PR that implements this change.
- **Event spam.** Without the idempotency check (Scenario 3), the controller would emit an `AuthorizationRequired` event on every poll. The spec mandates change-detection on the underlying metadata.
