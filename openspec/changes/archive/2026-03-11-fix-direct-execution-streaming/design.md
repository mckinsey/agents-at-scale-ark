## Context

`executeDirectly` was added to handle ExecutionEngine agents without routing through the query engine sidecar. It sets up context correctly but skips event stream creation — passing `nil, nil` for memory and eventStream to `agent.Execute`.

The A2A execution path in `genai/a2a_execution.go` checks `eventStream != nil` at line 77 to decide whether to use streaming mode, and at line 96 to send a final chunk. With nil, both are skipped.

On main, `reconcileQueue` called `createEventStreamIfNeeded` and passed the stream through to execution, then called `finalizeEventStream` to send a final chunk with the complete query status and close the connection.

## Goals / Non-Goals

**Goals:**
- Dashboard renders streaming chunks for A2A agent queries
- Final chunk with completed query reaches ark-broker so dashboard updates

**Non-Goals:**
- Adding memory support to executeDirectly (A2A agents manage state via contextId)
- Changing the engine sidecar streaming path

## Decisions

### 1. Create event stream in executeDirectly

Add `genai.NewEventStreamForQuery` call after context setup, using the same sessionId logic already present. Pass the event stream to `agent.Execute`.

### 2. Finalize stream after execution

After getting the result, build the completed query status and send a final chunk via `WrapChunkWithMetadata`, then call `NotifyCompletion` and `Close`. This mirrors what the engine handler's `executionState.finalizeStream` does and what main's `finalizeEventStream` did.

### 3. Handle stream creation failure gracefully

If event stream creation fails, log the error and continue with nil — same as the engine handler does. Streaming is optional; execution should still succeed without it.

## Risks / Trade-offs

- **Minimal change** — only `executeDirectly` is modified, no architectural impact.
