## Why

The query engine extraction moved all query execution into a sidecar service, but 6 chainsaw tests fail because the controller no longer handles execution engine agents (A2A, named engines) directly. These agents need controller-level context (queryName, a2aContextID) that the engine sidecar doesn't set up, and they're just proxying to external services — the sidecar adds an unnecessary hop. Additionally, two mock-LLM test configs accidentally lost their default `/v1/chat/completions` handler when custom rules were added.

## What Changes

- Controller dispatches execution engine agents (A2A and named engines) directly instead of routing through the query engine sidecar
- Restore context setup (WithQueryContext, WithA2AContextID, WithExecutionMetadata) and response handling (A2AMetadata, error responses) from the main branch for the direct execution path
- Add Telemetry provider to QueryReconciler to support MakeAgent calls
- Pass resolved target in A2A metadata so the engine sidecar can handle selector-based queries
- Create error responses when engine execution fails (matching main branch behavior)
- Fix mock-LLM configs that accidentally replaced default rules

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

- `ark/internal/controller/query_controller.go` — dispatch logic, direct execution path, error response, target in metadata
- `ark/cmd/main.go` — wire Telemetry to QueryReconciler
- `tests/agent-partial-tool/mock-llm-values.yaml` — add chat completions rule
- `tests/agent-partial-tool-valuefrom/mock-llm-values.yaml` — add chat completions rule
