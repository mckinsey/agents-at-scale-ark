## 1. Ark controller — CRD and types

- [ ] 1.1 Add `MCPServerAuthorizationSpec` + `TokenSecretRef` + `TokenSecretKeys` Go types in `ark/api/v1alpha1/mcpserver_types.go` with defaults (`access_token`, `refresh_token`, `expires_at`, `client_id`, `client_secret`)
- [ ] 1.2 Add `Authorization *MCPServerAuthorizationSpec` field to `MCPServerSpec`
- [ ] 1.3 Extend `MCPServerAuthorizationState` enum with `Authorized`, `Expired`, `RefreshFailed`
- [ ] 1.4 Add `LastRefreshed *metav1.Time` to `MCPServerAuthorizationStatus`
- [ ] 1.4a Add `ExpiresAt *metav1.Time` (optional) to `MCPServerAuthorizationStatus`; no additional kubebuilder printcolumn (existing `AUTH` state column is unchanged)
- [ ] 1.5 Regenerate CRD manifests (`make manifests`), sync Helm CRD chart, regenerate zz_generated deepcopy
- [ ] 1.6 Add validating webhook rule rejecting `spec.authorization.tokenSecretRef` with a name referencing a different namespace
- [ ] 1.7 Add validating webhook rule rejecting manifests where `spec.authorization != nil` AND any `spec.headers[i].name` equals `Authorization` case-insensitively (`strings.EqualFold`); error message names the offending header index and both conflicting fields
- [ ] 1.8 Unit tests for the webhook conflict rule: rejects clash; admits non-Authorization headers alongside `spec.authorization`; admits `Authorization` header when `spec.authorization` absent; case-insensitive match (`authorization`, `AUTHORIZATION`, `Authorization`)

## 2. Ark controller — token resolution and injection

- [ ] 2.1 New helper `resolveAuthorizationToken(ctx, mcpserver)` — reads Secret, returns `TokenBundle{accessToken, refreshToken, expiresAt, clientID, clientSecret}`, or typed errors for missing Secret / missing key
- [ ] 2.2 Thread `TokenBundle` into `createMCPClient`; inject `Authorization: Bearer <access_token>` into the header map after `resolveHeaders`
- [ ] 2.3 Controller-side conflict detection: if `spec.authorization != nil` AND any `spec.headers[i].name` matches `Authorization` via `strings.EqualFold`, skip MCP client construction, set `Available=False` and `Discovering=False` with reason `MCPServerReasonAuthorizationHeaderConflict` (new constant matching existing style in `ark/internal/controller/mcpserver_controller.go`), emit a `Warning` event with reason `AuthorizationHeaderConflict` naming the offending header, do not mutate `status.authorization`, and requeue on `pollInterval`
- [ ] 2.4 Transition `status.authorization.state` to `Authorized` on successful MCP client creation with an injected Bearer token

## 3. Ark controller — refresh loop

- [ ] 3.1 Before MCP client creation, check `now >= expires_at - 60s`
- [ ] 3.2 Call token endpoint (`grant_type=refresh_token`) with stored `client_id` / `client_secret`, honouring RFC 6749 §6 refresh token rotation
- [ ] 3.3 On success, PATCH Secret with new `access_token`, `refresh_token` (if returned), `expires_at`; update `status.authorization.lastRefreshed`; state stays `Authorized`
- [ ] 3.4 On failure where access token is still valid, state → `RefreshFailed`; preserve Secret; emit `Warning`
- [ ] 3.5 On failure where access token has also expired, state → `Expired`; emit `Warning`
- [ ] 3.6 On MCP call 401 with valid-looking Bearer, state → `Required`, re-run existing RFC 9728 discovery; preserve Secret keys
- [ ] 3.7 On every successful initial auth and every successful refresh, compute `status.authorization.expiresAt = time.Now().UTC().Add(time.Duration(expires_in) * time.Second)` and persist alongside `lastRefreshed`
- [ ] 3.8 On refresh failure (`RefreshFailed` / `Expired`), leave `status.authorization.expiresAt` unchanged

## 4. Ark controller — state machine wiring

- [ ] 4.1 Clear `status.authorization.state` back to empty (and sub-resource to `nil`) only when `spec.authorization` is unset AND the server is reachable without auth
- [ ] 4.2 Ensure all existing `mcp-auth-detection` scenarios continue to pass unchanged (regression)
- [ ] 4.3 When `status.authorization` is cleared (sub-resource reset to `nil`), ensure `expiresAt` is cleared alongside `state` and `lastRefreshed`

## 5. RBAC

- [ ] 5.1 Add `get`, `list`, `watch`, `update`, `patch` on `secrets` to the controller's Role / ClusterRole in the Helm chart
- [ ] 5.2 Ensure NO `create` or `delete` is granted on `secrets`

## 6. Helm chart — Secret shell

- [ ] 6.1 New template rendering one Secret per MCPServer entry in `values.yaml` (or a user-provided values hook), with `metadata.labels.ark.mckinsey.com/mcpserver: <name>`, `type: Opaque`, and NO `data:` or `stringData:` block
- [ ] 6.2 Confirm `helm template` output has no `data:` field (unit-test the template)
- [ ] 6.3 Document in chart `README.md` that GitOps tooling must ignore `data` diffs on these Secrets

## 7. ark CLI — `ark mcp auth <name>`

- [ ] 7.1 New command skeleton; accepts `-n / --namespace` flag, falls back to kube context
- [ ] 7.2 Fetch `MCPServer`; read `spec.authorization.tokenSecretRef` and `status.authorization` (registration/authorization/token endpoints, scopes)
- [ ] 7.3 Fail fast with actionable errors: MCPServer missing, `spec.authorization` unset, `status.authorization.state != Required`, Secret missing, `registrationEndpoint` absent
- [ ] 7.4 Bind 127.0.0.1 on an ephemeral port; register callback handler at `/callback`
- [ ] 7.5 Perform RFC 7591 DCR (reusing stored `client_id` / `client_secret` if present and `--force-register` is not set)
- [ ] 7.6 Generate PKCE `code_verifier` / `code_challenge` (S256) per RFC 7636
- [ ] 7.7 Open the user's browser to the authorization endpoint with `response_type=code`, `redirect_uri`, `code_challenge`, `scope`, `state`
- [ ] 7.8 On callback, exchange `code` for tokens at the token endpoint
- [ ] 7.9 PATCH the Secret with all five keys in a single update
- [ ] 7.10 Print next-steps message and exit cleanly

## 8. Documentation

- [ ] 8.1 Operator guide: first-time auth against `mcp.notion.com/mcp` (create MCPServer → wait for `Required` → run CLI → verify `Authorized`)
- [ ] 8.2 Troubleshooting: `RefreshFailed`, `Expired`, token revoked at IdP
- [ ] 8.3 GitOps guide: how ArgoCD / Flux users should configure ignore rules for the Secret `data` field

## 9. Tests — controller

- [ ] 9.1 Unit test: Secret missing → state `Required`, no Bearer injected
- [ ] 9.2 Unit test: Secret present, token unexpired → state `Authorized`, Bearer injected
- [ ] 9.3 Unit test: Token within 60s of expiry → refresh called, new tokens PATCH'd
- [ ] 9.4 Unit test: Refresh returns rotated `refresh_token` → both keys updated atomically
- [ ] 9.5 Unit test: Refresh fails, access token valid → state `RefreshFailed`
- [ ] 9.6 Unit test: Refresh fails, access token also expired → state `Expired`
- [ ] 9.7 Unit test: MCP returns 401 with valid Bearer → state `Required`, tokens preserved
- [ ] 9.8 Unit test: controller with `spec.authorization` set AND `spec.headers[Authorization]` present (webhook bypassed) does NOT issue MCP requests, sets `Available=False` and `Discovering=False` with reason `AuthorizationHeaderConflict`, emits `Warning` event, leaves `status.authorization` untouched
- [ ] 9.9 Unit test: once the offending header is removed, the next reconcile clears the `AuthorizationHeaderConflict` reason and resumes the normal auth flow
- [ ] 9.10 Unit test: Cross-namespace `tokenSecretRef` rejected by webhook
- [ ] 9.11 Unit test: Initial auth sets `status.authorization.expiresAt` to `now + expires_in`
- [ ] 9.12 Unit test: Successful refresh updates `expiresAt` to `now + expires_in`; `lastRefreshed` also advances
- [ ] 9.13 Unit test: Refresh failure (both `RefreshFailed` and `Expired` branches) leaves `expiresAt` unchanged
- [ ] 9.14 Unit test: Removing `spec.authorization` on a reachable-without-auth server clears `status.authorization` including `expiresAt`

## 10. Tests — CLI

- [ ] 10.1 Unit test: CLI fails with actionable error when MCPServer missing / auth state not `Required` / Secret missing / `registrationEndpoint` absent
- [ ] 10.2 Unit test: DCR skipped when `client_id` present unless `--force-register`
- [ ] 10.3 Unit test: PKCE verifier / challenge generated per RFC 7636
- [ ] 10.4 Integration test (mock AS): full code → token exchange, Secret PATCH'd with all five keys

## 11. Tests — end-to-end

- [ ] 11.1 Chainsaw test against a mock OAuth-protected MCP server: detection → `Required` → CLI-emulated Secret write → controller transitions to `Authorized` → agent successfully calls MCP tool
- [ ] 11.2 Chainsaw test: expiry within 60s → controller refreshes without user intervention
- [ ] 11.3 Manual trust-anchor validation: full `mcp.notion.com/mcp` flow documented in the operator guide
