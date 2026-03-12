## Context

The completions extraction PR moved ~50 files across packages. SonarQube treats moved files as new code and flagged pre-existing issues. The e2e pipeline also fails because the Helm install order creates a dependency problem.

## Goals / Non-Goals

**Goals:**
- Fix all SonarQube failures and warnings to unblock PR merge
- Fix e2e CI install order
- Improve test coverage for new packages

**Non-Goals:**
- Refactoring beyond what SonarQube requires
- Adding TLS support (clear-text HTTP is standard for cluster-internal K8s services)

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Complexity reduction in `a2a.go` | Extract `extractAgentTextFromHistory` helper | Isolates the nested loop in `ExtractTextFromTask` |
| Complexity reduction in `evaluation_controller.go` | Extract `updateEvaluationAnnotations` helper | Isolates the metadata annotation block |
| Parameter reduction pattern | Introduce typed config/state structs | Standard Go pattern, no interface changes needed |
| `consumeA2ATaskEvent` (12 params) | Group into `a2aStreamState` struct | Holds content, response, eventStream, IDs |
| `GetOrCreateClient` (8 params) | Group into `MCPClientConfig` struct | Holds server details, headers, transport, timeout |
| `executeMember` (8 params) | Reuse existing `executionState` struct | Already exists in handler.go, just pass it through |
| `CreateToolExecutor` (8 params) | Group into `ToolExecutorDeps` struct | Holds mcpPool, mcpSettings, providers |
| `model_probe.go` context | Derive probe context from passed `ctx` | `ContextWithProbeMode(ctx)` instead of `context.Background()` |
| `values.yaml` HTTP | Keep HTTP, it's cluster-internal | Standard K8s pattern, TLS via service mesh is separate concern |
| E2e install order | Controller first, then completions | Controller creates the ServiceAccount that completions references |
| `deployment.yaml` SA warning | Add `automountServiceAccountToken: false` | Completions reads CRDs via its own K8s client config, doesn't need mounted token. Actually it does need it — so keep `true` but that's the default. The real fix is that RBAC is defined in the controller chart. |

## Risks / Trade-offs

**Risk: struct proliferation.** Adding 4 new structs for parameter grouping. Acceptable — each is small (3-5 fields) and scoped to its function.

**Trade-off: `automountServiceAccountToken`.** Completions needs K8s API access to read CRDs. Can't disable token mounting. SonarQube warning about SA permissions is a cross-chart visibility issue — the RBAC bindings exist in the controller chart. Will suppress with annotation.
