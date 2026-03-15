# Design: Simplify Query Controller Dispatch

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Controller: dispatchExecution(query, target)            │
│                                                         │
│  1. If target is agent → fetch Agent CRD                │
│                                                         │
│  2. resolveDispatchAddress():                           │
│     ├─ agent.ExecutionEngine.Name == "a2a"              │
│     │    → r.CompletionsAddr                            │
│     ├─ agent.ExecutionEngine.Name == <named>            │
│     │    → ExecutionEngine CRD .status address          │
│     └─ no ExecutionEngine (or non-agent target)         │
│          → r.CompletionsAddr                            │
│                                                         │
│  3. sendQueryA2A(address, query, target)                │
│     QueryExtension metadata: {name, namespace}          │
│     Blocking A2A, extract response + engine meta        │
│                                                         │
│  4. Write response to CR status                         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Completions Engine (handler.go)                        │
│                                                         │
│  ProcessMessage → fetch Query CR → resolve target       │
│  setupExecution:                                        │
│    - memory, event stream, telemetry (existing)         │
│    - WithQueryContext (new)                              │
│    - WithA2AContextID (new)                             │
│                                                         │
│  dispatchTarget:                                        │
│    agent (nil engine)  → executeLocally                 │
│    agent ("a2a")       → A2AExecutionEngine.Execute     │
│    team/model/tool     → existing paths                 │
│                                                         │
│  buildA2AResponse: memory, tokens, stream finalize      │
└─────────────────────────────────────────────────────────┘
```

## Decisions

### Controller resolves ExecutionEngine CRD address directly

The controller already has a K8s client. Resolving the ExecutionEngine CRD address is a single `Get` + read `.status.lastResolvedAddress`. No need to build an Agent or go through completions for this.

Pulled from existing `ExecutionEngineA2AClient.resolveExecutionEngineAddress` — same logic, just moved to the controller.

### `executeViaEngine` becomes `sendQueryA2A` accepting an address parameter

Today `executeViaEngine` hardcodes `r.CompletionsAddr`. Generalize it to accept an address. The A2A message construction, timeout handling, response parsing all stay the same.

### Completions handler adds context enrichment

`setupExecution` already has access to the Query CR. Add:

```go
ctx = WithQueryContext(ctx, string(query.UID), sessionId, query.Name)

if a2aContextID := query.Annotations[annotations.A2AContextID]; a2aContextID != "" {
    ctx = WithA2AContextID(ctx, a2aContextID)
}
```

These are consumed by `a2a_execution.go` for streaming chunk IDs and A2A context propagation. Without them, the A2A execution engine path in completions would produce empty query IDs in streaming chunks.

### Agent.executeAgent removes named engine routing

After this change, agents in completions only see two execution paths:

```go
func (a *Agent) executeAgent(...) {
    if a.ExecutionEngine != nil {
        // Only "a2a" reaches here now — named engines are dispatched by controller
        return a.executeWithA2AExecutionEngine(ctx, userInput, eventStream)
    }
    return a.executeLocally(ctx, userInput, history, memory, eventStream)
}
```

The `executeWithExecutionEngineRouter` and `executeWithNamedExecutionEngine` methods are removed. The router indirection is gone — if an agent in completions has an ExecutionEngine, it's always "a2a".

## Files Changed

| File | Change |
|------|--------|
| `ark/internal/controller/query_controller.go` | Rewrite `dispatchExecution`, add `resolveDispatchAddress`, generalize `sendQueryA2A`, delete `shouldExecuteDirectly`, `executeDirectly`, `finalizeDirectStream`, `createSuccessResponse`, `serializeMessages`, `extractUserInput` |
| `ark/executors/completions/handler.go` | Add `WithQueryContext` and `WithA2AContextID` in `setupExecution` |
| `ark/executors/completions/agent.go` | Remove `executeWithExecutionEngineRouter`, `executeWithNamedExecutionEngine`. Simplify `executeAgent` to direct "a2a" check |
| `ark/executors/completions/execution_engine.go` | Delete `ExecutionEngineA2AClient`, `resolveExecutionEngineAddress` (moved to controller), `extractResponseText`, `convertToExecutionEngineMessage`, `buildAgentConfig`, `buildParameters`, `detectProviderName`, `buildModelConfig`, `buildToolDefinitions` |

## Risks

- **Selector-resolved queries through completions**: If `spec.target` is nil (selector was used), the completions handler currently can't resolve it. Pre-existing issue, out of scope, but worth noting.
- **Named engine response format**: Assumes named engines return the same A2A response format as completions (QueryExtension metadata with token usage, conversation ID, messages). If a named engine doesn't include these, `extractEngineResponseMeta` returns empty — same as today's behavior.
