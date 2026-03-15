# Tasks: Simplify Query Controller Dispatch

## Task 1: Add context enrichment to completions handler

**File**: `ark/executors/completions/handler.go`

In `setupExecution()`, after the existing session ID and event stream setup, add:

- `WithQueryContext(ctx, string(query.UID), sessionId, query.Name)`
- `WithA2AContextID` from `query.Annotations[annotations.A2AContextID]`

This unblocks the A2A execution engine path to work correctly when routed through completions.

**Tests**: Verify existing handler tests still pass. Add a test that confirms context values are set in `setupExecution`.

---

## Task 2: Simplify Agent.executeAgent in completions

**File**: `ark/executors/completions/agent.go`

- Remove `executeWithExecutionEngineRouter`
- Remove `executeWithNamedExecutionEngine`
- Simplify `executeAgent`: if `ExecutionEngine != nil`, call `executeWithA2AExecutionEngine` directly
- Remove the import/usage of `QueryContextKey` in `executeWithNamedExecutionEngine`

**Tests**: Update agent tests that cover execution engine routing.

---

## Task 3: Delete ExecutionEngineA2AClient from completions

**File**: `ark/executors/completions/execution_engine.go`

Delete:
- `ExecutionEngineA2AClient` struct and `NewExecutionEngineA2AClient`
- `Execute` method
- `resolveExecutionEngineAddress` (logic moves to controller in Task 4)
- `extractResponseText` (controller already has `extractA2AResponseText`)
- `convertToExecutionEngineMessage`
- `buildAgentConfig`, `buildParameters`, `detectProviderName`, `buildModelConfig`, `buildToolDefinitions`
- `ExecutionEngineMessage`, `AgentConfig`, `ExecutionEngineModel`, `Parameter`, `TokenUsage` types

Keep the file if other things remain, otherwise delete entirely.

**Tests**: Delete `execution_engine_test.go` tests that cover removed code.

---

## Task 4: Refactor controller dispatch to single path

**File**: `ark/internal/controller/query_controller.go`

**Add**:
- `resolveDispatchAddress(ctx, target, query)` — fetches Agent CRD if target is agent, checks ExecutionEngine field, returns address:
  - `"a2a"` → `r.CompletionsAddr`
  - `<named>` → fetch ExecutionEngine CRD, return `.status.lastResolvedAddress`
  - `nil` / non-agent → `r.CompletionsAddr`
- Generalize `executeViaEngine` to accept an address parameter (rename to `sendQueryA2A` or similar)

**Delete**:
- `shouldExecuteDirectly`
- `executeDirectly`
- `finalizeDirectStream`
- `createSuccessResponse`
- `serializeMessages`
- `extractUserInput`
- Streaming-related imports (`completions.NewEventStreamForQuery`, `completions.NewContentChunk`, `completions.WrapChunkWithMetadata`, etc.)

**Simplify**:
- `dispatchExecution` → call `resolveDispatchAddress` then `sendQueryA2A`

**Tests**: Update `query_controller_test.go` — remove tests for `executeDirectly` path, add tests for address resolution logic.

---

## Task 5: Verify end-to-end

Run full test suite:

```bash
cd ark && make test
```

Confirm:
- Queries targeting agents without execution engines work (completions path)
- Queries targeting agents with "a2a" execution engines work (completions → A2A path)
- Queries targeting agents with named execution engines work (direct to engine)
- Queries targeting teams, models, tools work (completions path)
- Cancel and TTL flows unaffected
