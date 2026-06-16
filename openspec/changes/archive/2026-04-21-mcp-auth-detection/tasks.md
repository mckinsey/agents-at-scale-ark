## 1. CRD types (Go)

- [ ] 1.1 Add `MCPServerAuthorizationStatus` struct to `ark/api/v1alpha1/mcpserver_types.go` with fields per spec (`required`, `resource`, `resourceMetadataURL`, `resourceName`, `authorizationServers`, `scopesSupported`, `grantTypesSupported`, `registrationEndpoint`, `authorizationEndpoint`, `tokenEndpoint`, `lastDiscovered`).
- [ ] 1.2 Add optional `Authorization *MCPServerAuthorizationStatus` field to `MCPServerStatus`.
- [ ] 1.3 Add printcolumn `Auth` showing `.status.authorization.required`.
- [ ] 1.4 Run `make manifests` + `make generate` to regenerate CRD YAML, deepcopy, and Helm chart sync.

## 2. Controller — error typing

- [ ] 2.1 Add `ErrUnauthorized` typed error to `ark/internal/mcp/mcp.go`.
- [ ] 2.2 In `attemptMCPConnection`, detect 401 from underlying HTTP response; wrap and return `ErrUnauthorized` carrying the captured response headers.
- [ ] 2.3 Update `createMCPClientWithRetry` so `ErrUnauthorized` is NOT treated as retryable.

## 3. Controller — discovery

- [ ] 3.1 New file `ark/internal/mcp/oauth_discovery.go`.
- [ ] 3.2 `ParseWWWAuthenticate(header string) (resourceMetadataURL string, realm string, ok bool)` — parse RFC 9728 §5.1 header.
- [ ] 3.3 `FetchProtectedResourceMetadata(ctx, url)` — returns typed struct matching RFC 9728.
- [ ] 3.4 `FetchAuthorizationServerMetadata(ctx, issuer)` — appends `/.well-known/oauth-authorization-server`, returns typed struct matching RFC 8414.
- [ ] 3.5 Unit tests for each discovery function (fixture JSON from Notion).

## 4. Controller — reconciler branch

- [ ] 4.1 Add `MCPServerAuthorizationRequired = "AuthorizationRequired"` condition reason constant.
- [ ] 4.2 In `processServer`, when `createMCPClient` returns `ErrUnauthorized`, call a new `handleAuthorizationRequired()` path instead of `reconcileConditionsClientCreationFailed`.
- [ ] 4.3 `handleAuthorizationRequired()` runs discovery, populates `status.authorization`, calls `reconcileConditionsAuthorizationRequired()`, requeues at `pollInterval`.
- [ ] 4.4 `reconcileConditionsAuthorizationRequired()` sets `Available=False/AuthorizationRequired` and `Discovering=False/AuthorizationRequired`; idempotent against unchanged metadata.
- [ ] 4.5 Delete any stale `Tool` CRs owned by this MCPServer (auth-required servers have no tools).

## 5. Controller — eventing

- [ ] 5.1 Add `AuthorizationRequired(ctx, server, message)` to `internal/eventing/mcpserver.go`.
- [ ] 5.2 Emit event only on state entry or resource-metadata-URL change (not every poll).

## 6. Tests

- [ ] 6.1 Unit test: `mcpserver_controller` transitions to `AuthorizationRequired` when client returns `ErrUnauthorized`.
- [ ] 6.2 Unit test: `status.authorization` fields populated from recorded fixture (Notion `.well-known` responses).
- [ ] 6.3 Unit test: unchanged metadata does not bump `lastTransitionTime` or re-emit event.
- [ ] 6.4 Unit test: non-401 client failures still produce `ClientCreationFailed` (regression).
- [ ] 6.5 Chainsaw e2e: apply `MCPServer` pointing at mock-mcp-server that returns 401 + WWW-Authenticate; assert `status.authorization.required == true`, `reason == AuthorizationRequired`.

## 7. Documentation

- [ ] 7.1 Add section to `docs/content/reference/mcp-servers.mdx` covering the `status.authorization` contract.
- [ ] 7.2 Add a note to `docs/content/how-to/mcp-servers.mdx` explaining the `AuthorizationRequired` state and that OAuth-auth itself is not yet supported (pointer to follow-up changes).
