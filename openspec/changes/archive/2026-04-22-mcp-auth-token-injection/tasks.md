## 1. Ark controller — CRD and types

- [x] 1.1 Add `MCPServerAuthorizationSpec` + `TokenSecretReference` Go types in `ark/api/v1alpha1/mcpserver_types.go` with per-key defaults (`access_token`, `refresh_token`, `expires_at`, `client_id`, `client_secret`)
- [x] 1.2 Add `Authorization *MCPServerAuthorizationSpec` field to `MCPServerSpec`
- [x] 1.3 Extend `MCPServerAuthorizationState` enum with a single new value `Authorized` (final enum: `Required | DiscoveryFailed | Authorized`)
- [x] 1.4 Add `ExpiresAt *metav1.Time` (optional) to `MCPServerAuthorizationStatus`; no additional kubebuilder printcolumn (existing `AUTH` state column is unchanged)
- [x] 1.5 Regenerate CRD manifests (`make manifests`), sync Helm CRD chart, regenerate zz_generated deepcopy

## 2. Ark controller — token resolution and injection

- [x] 2.1 Resolver reads the referenced Secret at reconcile, extracting `access_token` and (optionally) `expires_at` using the configured key names with defaults
- [x] 2.2 Inject `Authorization: Bearer <access_token>` into the MCP client's header map alongside existing `spec.headers`
- [x] 2.3 On a successful tool-list using the injected Bearer, transition `status.authorization.state` to `Authorized` and set `Available=True` with reason `Authorized`
- [x] 2.4 Populate `status.authorization.expiresAt` from the Secret's `expires_at` key when parseable; leave absent and log otherwise (does not block the `Authorized` transition)
- [x] 2.5 If the Secret is missing or `access_token` is empty, do not inject Bearer; fall through to the existing `mcp-auth-detection` 401 discovery path

## 3. Ark controller — TokenRejected event on rollback

- [x] 3.1 When the MCP server returns 401 and the prior persisted `status.authorization.state` was `Authorized`, emit a Kubernetes `Warning` event with reason `TokenRejected` whose message includes the observed `WWW-Authenticate` header
- [x] 3.2 Ensure `TokenRejected` is NOT emitted when the prior state was empty, `Required`, or `DiscoveryFailed` — first-time transitions into `Required` continue to emit the existing `AuthorizationRequired` event from `mcp-auth-detection`
- [x] 3.3 After emitting `TokenRejected`, transition `status.authorization.state` back to `Required` and re-run RFC 9728 detection

## 4. RBAC

- [x] 4.1 Add `get`, `list`, `watch` on `secrets` to the controller's Role / ClusterRole (via kubebuilder RBAC marker) in the namespaces it already watches
- [x] 4.2 Ensure NO `create`, `update`, `patch`, or `delete` is granted on `secrets` — Stage 1 is read-only

## 5. Regression / coexistence

- [x] 5.1 All existing `mcp-auth-detection` scenarios continue to pass unchanged
- [x] 5.2 `spec.headers` entries (e.g. `X-Org-Id`) are still sent alongside the injected Bearer when `spec.authorization` is set
