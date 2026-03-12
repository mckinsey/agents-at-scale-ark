## 1. Fix SonarQube Failures

- [x] 1.1 `a2a.go:220` — Extract `extractAgentTextFromHistory(history []protocol.Message) string` helper from `ExtractTextFromTask` to reduce cognitive complexity from 20 to under 15
- [x] 1.2 `evaluation_controller.go:728` — Extract `updateEvaluationAnnotations(ctx, client, evalKey, metadata) error` helper from `updateEvaluationComplete` to reduce cognitive complexity from 18 to under 15
- [x] 1.3 `dist/chart/values.yaml:51` — Clear-text HTTP for cluster-internal service. Add NOSONAR annotation or move to a config pattern that satisfies the scanner

## 2. Fix SonarQube Warnings — Parameter Counts

- [x] 2.1 `a2a_execution.go:196` — Create `a2aStreamState` struct grouping `content`, `response`, `eventStream`, `completionID`, `modelID` and refactor `consumeA2ATaskEvent` to accept it (12 → ≤7 params)
- [x] 2.2 `mcp/pool.go:19` — Create `MCPClientConfig` struct grouping `serverName`, `serverNamespace`, `serverURL`, `headers`, `transport`, `timeout` and refactor `GetOrCreateClient` (8 → ≤7 params)
- [x] 2.3 `handler.go:286` — Refactor `executeMember` to accept `*executionState` instead of individual params (8 → ≤7 params)
- [x] 2.4 `agent_tools.go:28` — Create `ToolExecutorDeps` struct grouping `mcpPool`, `mcpSettings`, `telemetryProvider`, `eventingProvider` and refactor `CreateToolExecutor` (8 → ≤7 params)

## 3. Fix SonarQube Warnings — Context and Style

- [x] 3.1 `model_probe.go:24-25` — Use passed `ctx` parameter: `completions.ContextWithProbeMode(ctx)` instead of `context.Background()`
- [x] 3.2 `mcp.go:161` — Use the passed `ctx` parameter instead of creating `context.Background()`
- [x] 3.3 `mcp.go:35` — Inline the unnecessary variable declaration into the if condition
- [x] 3.4 `deployment.yaml:18` — Completions needs K8s API access so can't disable SA token. Add annotation to acknowledge RBAC is managed by controller chart

## 4. Fix E2E CI Install Order

- [x] 4.1 `.github/actions/setup-e2e/setup-local.sh` — Swap order: install ark-controller first (creates SA), then ark-completions (uses SA)
- [x] 4.2 `.github/actions/test-ark-cli/action.yaml` — Same swap: controller before completions
- [x] 4.3 `.github/actions/deploy-ark-helmchart/action.yml` — Same swap: controller before completions

## 5. Test Coverage

- [x] 5.1 `resolution/headers_test.go` — Add tests for `ResolveHeadersWith` with custom resolver, error paths in `ResolveHeaderValue`
- [x] 5.2 `a2a/a2a_test.go` — Add tests for `ExtractTextFromTask` edge cases (empty history, failed state with message), `ExtractTextFromParts` with pointer vs value parts

## Success Criteria

- [x] All SonarQube failures resolved (0 failures on PR)
- [x] All SonarQube warnings resolved or suppressed with justification
- [x] E2E CI setup completes without timeout
- [x] Test coverage for `resolution/headers.go` ≥95%
- [x] Test coverage for `a2a/a2a.go` improves
- [x] `go build ./...` passes
- [x] `go test ./...` passes
- [x] `make lint` passes
