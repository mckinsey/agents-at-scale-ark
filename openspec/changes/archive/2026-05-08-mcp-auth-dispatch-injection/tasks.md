## 1. Shared helper

- [ ] 1.1 Add `ark/internal/resolution/mcp_auth.go` with `ResolveBearerToken(ctx, k8sClient, mcpServer) (string, error)` returning `("", nil)` when `spec.authorization == nil`, the Secret is missing, or the access-token key is empty
- [ ] 1.2 Unit tests: nil authorization, missing Secret, empty key, custom `accessTokenKey` override, populated token

## 2. Reconciler alignment

- [ ] 2.1 `ark/internal/controller/mcpserver_controller.go::resolveAuthorizationMaterial` reads access tokens via the same default key constant as the helper (`resolution.DefaultAccessTokenKey`) so the two paths cannot drift; no behaviour change
- [ ] 2.2 All existing reconciler tests pass unchanged

## 3. Built-in completions executor

- [ ] 3.1 `ark/executors/completions/agent_tools.go::createMCPExecutor` calls `ResolveBearerToken` after the `spec.headers` loop
- [ ] 3.2 Skip the helper-derived header when the user has already set `Authorization` in `spec.headers` (precedence rule)
- [ ] 3.3 Unit test: MCPServer with `spec.authorization.tokenSecretRef` and a populated Secret → built `MCPClientConfig.Headers` contains `Authorization: Bearer <token>`

## 4. ark-sdk Python resolver

- [ ] 4.1 `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/extensions/query.py::_resolve_mcp_server` reads the Secret named in `spec.authorization.tokenSecretRef` (with the same default + override key names as the controller)
- [ ] 4.2 Set `headers["Authorization"] = f"Bearer {token}"` when present, skip when `spec.headers` already supplied an `Authorization` header
- [ ] 4.3 Test in `lib/ark-sdk/gen_sdk/overlay/python/test_overlay/test_query_extension.py` covering: no authorization, populated Secret, header precedence

## 5. Docs

- [ ] 5.1 `docs/content/developer-guide/building-execution-engines.mdx`: note that `MCPServerConfig.headers` already carries the resolved `Authorization` header when `spec.authorization.tokenSecretRef` is set; executor authors construct clients from `headers` opaquely

## 6. End-to-end verification

- [ ] 6.1 Local: agent referencing an OAuth-protected MCPServer with a populated `tokenSecretRef` Secret completes a tool call without 401
- [ ] 6.2 Local: same agent with `spec.authorization` cleared still works against an unprotected MCPServer

## 7. Secret watch for real-time reconciliation

- [ ] 7.1 Add `MCPTokenSecretLabel = "ark.mckinsey.com/mcp-token-secret"` constant in `ark/internal/labels/labels.go`, mirroring the existing constant style
- [ ] 7.2 In `MCPServerReconciler.SetupWithManager`, register a field indexer on `&arkv1alpha1.MCPServer{}` for `spec.authorization.tokenSecretRef.name` (use a package-level constant `mcpTokenSecretRefField` for the field path string). Indexer returns `nil` when `spec.Authorization == nil`, otherwise `[]string{ref.Name}`
- [ ] 7.2.1 Field indexer is namespace-scoped (not cluster-wide) — controller-runtime's default cache scope; no cross-namespace Secret reverse lookups
- [ ] 7.3 Extend the controller builder with `Watches(&corev1.Secret{}, handler.EnqueueRequestsFromMapFunc(r.findMCPServersForSecret), builder.WithPredicates(predicate.NewPredicateFuncs(hasMCPTokenSecretLabel)))`. The predicate filters at event-handler level only — the cache is left unfiltered so reconciler reads of any token Secret continue to succeed
- [ ] 7.4 Implement `findMCPServersForSecret` on `*MCPServerReconciler`: list MCPServers via the field index in the Secret's namespace and return one `reconcile.Request` per match. On list error, log and return `nil` so event delivery is not blocked
- [ ] 7.5 Implement `hasMCPTokenSecretLabel(obj client.Object) bool` returning true when `obj.GetLabels()[labels.MCPTokenSecretLabel] == "true"`
- [ ] 7.6 Envtest in `ark/internal/controller/mcpserver_secret_watch_test.go`:
  - Labelled Secret patch enqueues a reconcile for the referencing MCPServer within seconds (use `Eventually` against a counting reconciler hook)
  - Unlabelled Secret patch does NOT enqueue an event-driven reconcile within the same window (`Consistently` asserts the counter does not increment)
  - Two MCPServers referencing the same labelled Secret both get enqueued on a single Secret patch
- [ ] 7.7 Note in the marketplace chart authoring guide that token-Secret-bearing charts SHOULD stamp `ark.mckinsey.com/mcp-token-secret: "true"` on the Secret to opt in to real-time reconciliation. Unlabelled Secrets remain functional via the periodic resync.
- [ ] 7.8 RBAC unchanged — Stage 1 already grants `get/list/watch` on Secrets to the controller SA
