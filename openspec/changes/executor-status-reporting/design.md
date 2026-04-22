## Context

Today the operator dispatches queries to external executors via A2A `SendMessage` with `blocking: true`. It blocks until the executor returns a complete response, then writes `Query.status.response`. No intermediate status is surfaced. The Query phase jumps from `pending` to `running` to `done/error` with nothing in between.

Executors with scheduling capabilities (e.g., Claude Agent SDK with per-conversation pod isolation) can take ~30 seconds to provision infrastructure before agent execution begins. Users see "Running" during this entire window with no explanation.

The existing Query Extension (`query/v1`) carries a `QueryRef` from operator to executor. It currently has no mechanism for the executor to report state back.

## Goals / Non-Goals

**Goals:**
- Users see "Initializing session" (or equivalent) across all surfaces while executor infrastructure provisions
- Status propagation is standardized via A2A using the existing Query Extension
- The Ark SDK enforces a vocabulary of executor states so surfaces can render consistently
- The operator remains unaware of executor infrastructure details — it relays status, doesn't interpret it
- ExecutionEngine CRD stays simple (address resolver only)

**Non-Goals:**
- Sub-step progress within "initializing" (e.g., "pulling image", "mounting volume")
- Streaming A2A — we use task polling, not SSE/streaming
- Health checks or readiness probes for executors (separate concern)
- Changes to the phase state machine (phases remain: pending, running, done, error, canceled)

## Decisions

### Decision: Extend the existing Query Extension, not a new extension

The Query Extension already defines the A2A contract between operator and executors. Adding a `/status` metadata key alongside the existing `/ref` key keeps related concerns together and avoids extension proliferation.

**Keys:**
- `{URI}/ref` — operator → executor (QueryRef, unchanged)
- `{URI}/status` — executor → operator (ExecutorStatus, new)

**Alternative considered**: New `executor-status/v1` extension. Rejected — adds a separate extension for what is fundamentally part of query execution flow.

### Decision: Task polling via non-blocking `SendMessage` + `GetTask`

The operator sends `SendMessage` with `blocking: false`. The executor returns a Task immediately in `working` state with status metadata. The operator polls `GetTask` on requeue intervals (3-5 seconds) until the task reaches a terminal state.

This fits the existing K8s reconciliation pattern (check state, update, requeue) and uses standard request/response HTTP semantics. No long-lived connections.

**Alternative considered**: A2A streaming (`SendMessageStreaming`). Rejected — requires reworking the operator's dispatch model to handle event streams, introduces long-lived connection management, and adds complexity for a signal that changes at most a few times over 30 seconds.

### Decision: `executorStatus` field on QueryStatus, not a new phase

Adding `initializing` as a Query phase would change the phase state machine that all existing consumers depend on. Instead, `executorStatus` is a structured field within the existing `running` phase. Surfaces that understand it show contextual status; surfaces that don't still work (they see "Running").

```go
type ExecutorStatus struct {
    State     string       `json:"state,omitempty"`
    Message   string       `json:"message,omitempty"`
    UpdatedAt *metav1.Time `json:"updatedAt,omitempty"`
}
```

**Alternative considered**: Sub-condition (`SessionReady=False`). Rejected — conditions are for tracking lifecycle state transitions, not transient executor progress.

**Alternative considered**: K8s Events only. Rejected — events are fire-and-forget with no structured field for surfaces to read. Dashboard and CLI would need to parse event messages.

### Decision: Standardized state vocabulary in the SDK

The Ark SDK defines an `ExecutorState` enum:

```
INITIALIZING = "initializing"   # Infrastructure provisioning
WORKING      = "working"        # Agent is executing
COMPLETED    = "completed"      # Execution finished
FAILED       = "failed"         # Execution failed
CANCELED     = "canceled"       # Execution canceled
```

The `state` field is the enum value (standardized, surfaces key on it). The `message` field is freeform (human-readable, for display). The SDK enforces the vocabulary; executors import it; the operator relays it without interpretation.

**Alternative considered**: Freeform state strings with no enum. Rejected — surfaces need to map states to specific UX treatments (spinner text, icons, colors). A standardized vocabulary makes this deterministic.

### Decision: All surfaces read from Query CR

The CLI, Fark, dashboard, and REST API all consume `executorStatus` from the Query CR. No surface talks directly to executors. This ensures a single source of truth and uniform behavior.

The CLI uses two paths today:
- Polling: reads `Query.status` via REST API
- Streaming: reads chunks from broker via SSE

For executor status, both paths can read `executorStatus` from the query response — the API already exposes full query status.

### Decision: No backward compatibility shim

The SDK and executors are released together. When the SDK gains `report_status()`, all executor deployments pick it up. The operator switches to `blocking: false` for all external executors in the same release. No feature detection or fallback needed.

## A2A Wire Format

### Outbound (unchanged)

```http
POST /a2a HTTP/1.1

{
  "jsonrpc": "2.0",
  "method": "message/send",
  "params": {
    "message": { "role": "user", "parts": [{ "text": "..." }] },
    "configuration": { "blocking": false },
    "metadata": {
      ".../query/v1/ref": { "name": "my-query", "namespace": "default" }
    }
  }
}
```

### Immediate Return (executor returns Task)

```json
{
  "id": "t-abc123",
  "status": {
    "state": "working",
    "message": { "role": "agent", "parts": [{ "text": "Initializing session" }] },
    "metadata": {
      ".../query/v1/status": {
        "state": "initializing",
        "message": "Initializing session"
      }
    }
  }
}
```

### Poll Response (GetTask, after provisioning)

```json
{
  "id": "t-abc123",
  "status": {
    "state": "completed",
    "metadata": {
      ".../query/v1/status": {
        "state": "working",
        "message": "Processing"
      }
    }
  },
  "history": [
    { "role": "user", "parts": [{ "text": "..." }] },
    { "role": "agent", "parts": [{ "text": "response content" }] }
  ]
}
```

## Operator Poll Loop

```
1. SendMessage(blocking: false)
2. Receive Task{state: working}
3. Extract .../query/v1/status from task metadata
4. Write Query.status.executorStatus
5. Set Query.status.phase = running (if not already)
6. Requeue after 3-5 seconds
7. GetTask(taskId)
8. If task.state != terminal → goto 3
9. If task.state == completed → extract response, write Query.status.response, phase = done
10. If task.state == failed → extract error, phase = error
```

## Surface Rendering

| Surface | What changes |
|---------|-------------|
| Dashboard | Subtitle under phase badge: "Initializing session..." when `executorStatus.state == "initializing"` |
| Ark CLI (polling) | Status line before response: "Initializing session..." |
| Ark CLI (streaming) | Status line before chunks begin |
| Fark CLI | Spinner text includes executor status message with elapsed timer |
| REST API | `executorStatus` field included in query status response |

## Risks / Trade-offs

- **Poll interval latency**: 3-5 second requeue means status updates are delayed by up to one poll interval. For a ~30 second provisioning window this is acceptable. If sub-second updates become necessary, streaming can be revisited.
- **Operator load**: Each running query with a non-blocking executor adds periodic `GetTask` HTTP calls. At moderate scale this is fine. At high concurrency, consider batching or backoff.
- **Task support in A2A libraries**: The `trpc-a2a-go` client must support `GetTask`. If not already available, this needs implementation or contribution.

## Open Questions

- What should the poll interval be? Fixed 3-5s, or exponential backoff? (Likely fixed for simplicity — defer to implementation.)
- Should `executorStatus` be cleared when the query reaches a terminal phase, or preserved for post-mortem inspection? (Leaning toward preserved.)
- Does `trpc-a2a-go` already support `GetTask`/`tasks/get`? Needs verification before implementation.
