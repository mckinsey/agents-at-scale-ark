## 1. Controller direct execution path for ExecutionEngine agents

- [x] 1.1 Add `Telemetry` field to `QueryReconciler` struct in `query_controller.go`
- [x] 1.2 Wire `telemetryProvider` to `QueryReconciler` in `cmd/main.go`
- [x] 1.3 Add `shouldExecuteDirectly(ctx, target, client)` — fetches Agent CRD, returns true if `spec.executionEngine != nil`
- [x] 1.4 Add `executeDirectly(ctx, query, target, impersonatedClient)` — context setup (WithQueryContext, WithA2AContextID, WithExecutionMetadata), MakeAgent, agent.Execute, build response with A2AMetadata
- [x] 1.5 Add `createSuccessResponse(target, messages)` and `createErrorResponse(target, err)` helpers (port from main)
- [x] 1.6 Update `executeQueryAsync` dispatch: call `shouldExecuteDirectly`, route to `executeDirectly` or `executeViaEngine`

## 2. Engine path fixes

- [x] 2.1 Pass resolved target in A2A metadata — add `"target": {"type": ..., "name": ...}` to `arkMetadata` in `executeViaEngine`
- [x] 2.2 Engine handler reads target from metadata when `query.Spec.Target` is nil — add `Target` field to `arkMetadata` struct, fallback logic in `ProcessMessage`
- [x] 2.3 Error response parity — when `executeViaEngine` returns error, create error response with target and error content instead of leaving response nil

## 3. Mock-LLM test configs

- [x] 3.1 Add `/v1/chat/completions` catch-all rule to `tests/agent-partial-tool/mock-llm-values.yaml`
- [x] 3.2 Add `/v1/chat/completions` catch-all rule to `tests/agent-partial-tool-valuefrom/mock-llm-values.yaml`

## 4. Verification

- [x] 4.1 Run `make build` in `ark/` to verify compilation
- [x] 4.2 Run `make test` in `ark/` to verify unit tests pass
- [x] 4.3 Run the 6 failing chainsaw tests: `chainsaw test query-label-selector a2a-blocking-task-completed a2a-blocking-task-failed a2a-message-context agent-partial-tool agent-partial-tool-valuefrom`
- [x] 4.4 Run full chainsaw suite with `--selector '!evaluated,!llm'` to verify no regressions
