# Simplify Query Controller Dispatch

## Problem

The query controller has two execution paths (`executeDirectly` and `executeViaEngine`) that both end up sending A2A messages. `executeDirectly` builds a full Agent struct, creates event streams, and prepares messages — only to have the Agent route to an execution engine via A2A anyway. This creates duplicated code, split streaming ownership, and makes the controller harder to reason about.

## Proposal

Collapse the query controller into a single dispatch path based on the agent's `ExecutionEngine` field:

- **`engine == "a2a"`** — send to CompletionsAddr. The completions engine already handles A2A agents (streaming, headers, contextID, A2AServer CRD lookup).
- **`engine == <named>`** — resolve address from ExecutionEngine CRD, send A2A directly. Uses the same QueryExtension protocol as completions.
- **`engine == nil` (or non-agent target)** — send to CompletionsAddr. Default path, unchanged.

All three paths use the same A2A message format (QueryExtension metadata with query name/namespace) and the same response parsing. The only difference is address resolution.

## Key Changes

**Controller (`query_controller.go`):**
- Replace `dispatchExecution` with 3-way address resolution + shared A2A send
- Generalize `executeViaEngine` to accept any address
- Add ExecutionEngine CRD address resolution (from `execution_engine.go`)
- Delete: `shouldExecuteDirectly`, `executeDirectly`, `finalizeDirectStream`, `createSuccessResponse`, `serializeMessages`, all streaming code

**Completions handler (`handler.go`):**
- Add missing context values in `setupExecution`: `WithQueryContext`, `WithA2AContextID`

**Completions agent (`agent.go`, `execution_engine.go`):**
- Delete `executeWithNamedExecutionEngine` path — controller handles it now
- Delete `ExecutionEngineA2AClient` and supporting types (`buildAgentConfig`, `convertToExecutionEngineMessage`, etc.)
- Keep `executeWithA2AExecutionEngine` — still needed when completions receives an "a2a" agent

## Non-goals

- Changing the A2A extension schema (stays as `{name, namespace}`, no target info added)
- Fixing selector-based query resolution in the completions handler (separate concern)
- Changing the completions engine's internal routing logic

## Impact

- ~220 lines removed from controller
- ~100 lines removed from completions (`execution_engine.go` types/functions)
- Controller becomes a pure CR lifecycle manager + A2A dispatcher
- Streaming ownership is fully in completions — no more split responsibility
- One fewer code path to test and maintain
