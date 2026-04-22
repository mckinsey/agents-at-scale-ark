## 1. Ark controller — CRD and types

- [ ] 1.1 Add `MCPServerAuthorizationSpec` + `TokenSecretRef` + `TokenSecretKeys` Go types in `ark/api/v1alpha1/mcpserver_types.go` with defaults (`access_token`, `refresh_token`, `expires_at`, `client_id`, `client_secret`)
- [ ] 1.2 Add `Authorization *MCPServerAuthorizationSpec` field to `MCPServerSpec`
- [ ] 1.3 Extend `MCPServerAuthorizationState` enum with a single new value `Authorized` (final enum: `Required | DiscoveryFailed | Authorized`)
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

## 3. Ark controller — refresh loop and rollback

- [ ] 3.1 Before MCP client creation, check `now >= expires_at - 60s`
- [ ] 3.2 Call token endpoint (`grant_type=refresh_token`) with stored `client_id` / `client_secret`, honouring RFC 6749 §6 refresh token rotation
- [ ] 3.3 On success, PATCH Secret with new `access_token`, `refresh_token` (if returned), `expires_at`; update `status.authorization.lastRefreshed`; state stays `Authorized`
- [ ] 3.4 On any refresh failure (network, 4xx from token endpoint, missing refresh_token) the controller SHALL call the shared `rollbackToRequired(reason, message)` routine — preserving the tokens in the Secret, setting `status.authorization.state = Required`, and emitting `TokenRejected` iff the previous persisted state was `Authorized`
- [ ] 3.5 On MCP call 401 with a valid-looking Bearer, the controller SHALL call the same `rollbackToRequired` routine with the observed `WWW-Authenticate` header as the event message, preserve Secret keys, and re-run existing RFC 9728 discovery
- [ ] 3.6 On every successful initial auth and every successful refresh, compute `status.authorization.expiresAt = time.Now().UTC().Add(time.Duration(expires_in) * time.Second)` and persist alongside `lastRefreshed`
- [ ] 3.7 On rollback to `Required`, leave `status.authorization.expiresAt` unchanged so the operator can still see when the last good token was minted

## 4. Ark controller — TokenRejected event recorder

- [ ] 4.1 Add a recorder helper (e.g. `recordTokenRejected(mcpserver, prevState, msg)`) on the MCPServer controller that emits a Kubernetes `Warning` event with reason `TokenRejected` if and only if `prevState == Authorized`; no-op otherwise
- [ ] 4.2 Event message SHALL include either the observed `WWW-Authenticate` header (truncated to a reasonable length) for 401-on-use, or a short summary of the refresh-endpoint failure for refresh failures
- [ ] 4.3 Integrate the helper at the single `rollbackToRequired` call site so there is exactly one event per transition; guarantee idempotency while state remains `Required`

## 5. Ark controller — state machine wiring

- [ ] 5.1 Clear `status.authorization.state` back to empty (and sub-resource to `nil`) only when `spec.authorization` is unset AND the server is reachable without auth
- [ ] 5.2 Ensure all existing `mcp-auth-detection` scenarios continue to pass unchanged (regression)
- [ ] 5.3 When `status.authorization` is cleared (sub-resource reset to `nil`), ensure `expiresAt` is cleared alongside `state` and `lastRefreshed`

## 6. RBAC

- [ ] 6.1 Add `get`, `list`, `watch`, `update`, `patch` on `secrets` to the controller's Role / ClusterRole in the Helm chart
- [ ] 6.2 Ensure NO `create` or `delete` is granted on `secrets`

## 7. Helm chart — Secret shell

- [ ] 7.1 New template rendering one Secret per MCPServer entry in `values.yaml` (or a user-provided values hook), with `metadata.labels.ark.mckinsey.com/mcpserver: <name>`, `type: Opaque`, and NO `data:` or `stringData:` block
- [ ] 7.2 Confirm `helm template` output has no `data:` field (unit-test the template)
- [ ] 7.3 Document in chart `README.md` that GitOps tooling must ignore `data` diffs on these Secrets

## 8. Documentation

- [ ] 8.1 Operator guide: Secret contract (keys, lifecycle, who writes what), state machine walkthrough (`Required` → populated → `Authorized` → rollback to `Required`), and refresh behaviour
- [ ] 8.2 Troubleshooting: the `TokenRejected` event and how to read the `WWW-Authenticate` message; what to repopulate in the Secret to recover
- [ ] 8.3 GitOps guide: how ArgoCD / Flux users should configure ignore rules for the Secret `data` field

## 9. Tests — controller

- [ ] 9.1 Unit test: Secret missing → state `Required`, no Bearer injected
- [ ] 9.2 Unit test: Secret present, token unexpired → state `Authorized`, Bearer injected
- [ ] 9.3 Unit test: Token within 60s of expiry → refresh called, new tokens PATCH'd
- [ ] 9.4 Unit test: Refresh returns rotated `refresh_token` → both keys updated atomically
- [ ] 9.5 Unit test: Refresh fails from state `Authorized` → state rolls back to `Required`, tokens preserved, `TokenRejected` Warning event emitted exactly once
- [ ] 9.6 Unit test: Refresh fails when previous state was `Required` (e.g. caller populated Secret with a bad token) → state stays `Required`, NO `TokenRejected` event emitted
- [ ] 9.7 Unit test: MCP returns 401 with valid Bearer from state `Authorized` → state rolls back to `Required`, tokens preserved, `TokenRejected` Warning event emitted, message includes the observed `WWW-Authenticate` header
- [ ] 9.8 Unit test: `TokenRejected` is NOT emitted on first-time transition into `Required` (empty → `Required` still emits `AuthorizationRequired` per `mcp-auth-detection`); also not emitted from `DiscoveryFailed` → `Required`
- [ ] 9.9 Unit test: once state is `Required`, subsequent reconciles that keep the state at `Required` do NOT emit duplicate `TokenRejected` events
- [ ] 9.10 Unit test: controller with `spec.authorization` set AND `spec.headers[Authorization]` present (webhook bypassed) does NOT issue MCP requests, sets `Available=False` and `Discovering=False` with reason `AuthorizationHeaderConflict`, emits `Warning` event, leaves `status.authorization` untouched
- [ ] 9.11 Unit test: once the offending header is removed, the next reconcile clears the `AuthorizationHeaderConflict` reason and resumes the normal auth flow
- [ ] 9.12 Unit test: Cross-namespace `tokenSecretRef` rejected by webhook
- [ ] 9.13 Unit test: Initial auth sets `status.authorization.expiresAt` to `now + expires_in`
- [ ] 9.14 Unit test: Successful refresh updates `expiresAt` to `now + expires_in`; `lastRefreshed` also advances
- [ ] 9.15 Unit test: Rollback to `Required` leaves `expiresAt` unchanged
- [ ] 9.16 Unit test: Removing `spec.authorization` on a reachable-without-auth server clears `status.authorization` including `expiresAt`

## 10. Tests — end-to-end

- [ ] 10.1 Chainsaw test against a mock OAuth-protected MCP server: detection → `Required` → externally-populated Secret → controller transitions to `Authorized` → agent successfully calls MCP tool
- [ ] 10.2 Chainsaw test: expiry within 60s → controller refreshes without user intervention
- [ ] 10.3 Chainsaw test: mock MCP server returns 401 after a successful auth → controller rolls state back to `Required` and emits a `TokenRejected` event whose message includes the `WWW-Authenticate` header
