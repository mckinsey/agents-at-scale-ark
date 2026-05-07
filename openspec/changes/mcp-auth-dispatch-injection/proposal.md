## Why

Stage 1 (`mcp-auth-token-injection`) injects `Authorization: Bearer <access_token>` only in the `MCPServerReconciler` path — used to discover tools and flip `status.authorization.state` to `Authorized`. The runtime tool-dispatch paths construct their own MCP clients elsewhere and never read `spec.authorization.tokenSecretRef`. Result: `Available=True`, `AUTH=Authorized`, 14 tools listed, every agent tool call gets `401 Unauthorized`.

Two dispatch paths are affected:

- `ark/executors/completions/agent_tools.go::createMCPExecutor` builds `MCPClientConfig.Headers` from `spec.headers` only.
- `lib/ark-sdk/.../extensions/query.py::_resolve_mcp_server` builds `MCPServerConfig.headers` for named (external) execution engines from `spec.headers` only.

The architecture intent (per `mcp-server-resolution`) is that the controller resolves all MCP config and ships fully-formed `headers` to executors. Executor authors must never touch Secrets themselves. Today both resolvers leak this responsibility back to the executor, and neither end picks it up.

There is also a UX gap on the same Stage 2 "Secret as source of truth" story: peer MCP clients (Cursor, Claude Desktop) reload tokens immediately when their stored Secret changes, but Ark today only re-reads the token Secret on the periodic resync interval. An operator who patches a token Secret has no signal that anything is happening for tens of seconds. The `MCPServerReconciler` does not watch Secrets at all, so an out-of-band token rotation is invisible until the next resync tick — which makes the dashboard "authorize" affordance feel laggy and the kubectl edit experience feel broken.

## What Changes

- Add a shared helper `internal/resolution/mcp_auth.go::ResolveBearerToken(ctx, k8sClient, mcpServer)` returning the access token (empty string when `spec.authorization` is unset or the Secret/key is absent).
- `ark/internal/controller/mcpserver_controller.go::resolveAuthorizationMaterial` SHALL use the new helper for the read; eventing stays in the controller.
- `ark/executors/completions/agent_tools.go::createMCPExecutor` SHALL call the helper after resolving `spec.headers` and SHALL set `headers["Authorization"] = "Bearer <token>"` when a token is returned. `spec.headers` precedence rules are unchanged: a user-set `Authorization` in `spec.headers` takes priority and the helper-derived header is skipped.
- `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/extensions/query.py::_resolve_mcp_server` SHALL fetch the Secret named in `spec.authorization.tokenSecretRef` and SHALL set `MCPServerConfig.headers["Authorization"] = "Bearer <token>"` when present. Same precedence rule for a user-set `Authorization` in `spec.headers`.
- `docs/content/developer-guide/building-execution-engines.mdx` SHALL state that `MCPServerConfig.headers` already carries the resolved `Authorization` header when the MCPServer has `spec.authorization.tokenSecretRef`. Executor authors construct MCP clients from `headers` opaquely.
- `MCPServerReconciler` SHALL gain a label-driven Secret watch. Token Secrets carrying the convention label `ark.mckinsey.com/mcp-token-secret=true` SHALL trigger immediate reconciliation of every MCPServer whose `spec.authorization.tokenSecretRef.name` matches the changed Secret. A field indexer on `spec.authorization.tokenSecretRef.name` resolves the reverse mapping. Helm charts that ship token Secrets stamp the label automatically; operators who hand-create Secrets stamp it manually for the real-time UX. Unlabelled Secrets keep working via the existing periodic resync — slower, but functionally equivalent. The cache SHALL NOT be filtered by the label, so reconciler reads of any token Secret continue to succeed regardless.

## Capabilities

### Modified Capabilities

- `mcp-auth-token-injection`: extends Bearer injection from the reconcile path to every MCP client construction path inside Ark (built-in completions executor + ark-sdk resolver for named executors). Reconcile-side behaviour unchanged.
- `mcp-server-resolution`: `MCPServerConfig.headers` carries the resolved `Authorization` header for OAuth-protected MCPServers. Executor authors no longer need to know about `spec.authorization`.

## Impact

- **Scope:** `ark/internal/resolution/`, `ark/executors/completions/agent_tools.go`, `ark/internal/controller/mcpserver_controller.go` (refactor only), `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/extensions/query.py`, `docs/content/developer-guide/building-execution-engines.mdx`.
- **CRD / RBAC:** none. Stage 1 already grants `get/list/watch` on Secrets to the controller SA. The completions executor runs under the same SA today.
- **Behavioural break:** an OAuth-protected MCPServer whose tool calls used to silently 401 will now succeed. No regression risk for non-OAuth MCPServers (`spec.authorization == nil` short-circuits before any Secret read).

## Non-Goals

- Token refresh — Stage 2 (`mcp-auth-token-refresh`).
- Reacting to dispatch-path 401s by collapsing `status.authorization.state` back to `Required` — Stage 1's reconcile-side rollback already covers expired-token detection on the next reconcile; tool-call 401 surfaces as a query error to the user.
- Per-executor SAs / fine-grained RBAC for non-controller executors — out of scope.
