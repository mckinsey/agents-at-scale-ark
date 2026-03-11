## Context

Phase 1 extracted the LLM execution loop into a query engine sidecar. The controller delegates via A2A, the engine runs agent/team/model/tool execution. During integration testing on a live cluster, we found: duplicate EventStream connections causing the dashboard to lose previous messages, disconnected OTEL traces, missing token usage and conversation ID in Query CR status, and an awkward dev mode where both processes share one container.

## Goals / Non-Goals

**Goals:**
- Streaming works correctly end-to-end (engine → ark-broker → dashboard) with no message loss
- OTEL traces for query execution are complete and connected, owned by the engine
- Token usage and conversation ID appear in Query CR status
- DevSpace dev mode allows independent restart of controller and engine

**Non-Goals:**
- A2A native streaming (progressive task updates over A2A protocol)
- Engine writing directly to Query CR (controller remains sole writer)
- Separate Go module for engine (remains same module)

## Decisions

### 1. Engine owns full EventStream lifecycle

The engine creates the EventStream, streams chunks during execution, and calls `NotifyCompletion` + `Close` when done. The controller does not touch EventStream at all.

```
Engine:
  NewEventStreamForQuery() → open connection to ark-broker
  StreamChunk() × N        → during execution
  NotifyCompletion()       → signal end of stream
  Close()                  → release connection

Controller:
  (no stream interaction)
```

This eliminates the duplicate connection bug where the controller opened a second EventStream after the A2A response.

**On error:** Engine calls `StreamError()` before `NotifyCompletion` + `Close`.

### 2. Engine owns all OTEL telemetry for query execution

The controller removes all `Telemetry.QueryRecorder()` calls from `executeQueryAsync`. The engine creates the full trace tree:

```
Engine spans:
  query/execute (root)
    ├── target/{type}/{name}
    │   ├── model/chatCompletion
    │   ├── tool/{name}
    │   └── ...
    └── memory/save
```

The controller becomes a pure K8s orchestrator with no execution telemetry. The only thing lost is A2A round-trip timing (localhost latency, not meaningful).

### 3. Engine returns token usage and conversationId in A2A response metadata

The A2A response `protocol.Message` includes metadata:

```json
{
  "role": "agent",
  "parts": [{ "text": "..." }],
  "metadata": {
    "ark.mckinsey.com/execution-engine": {
      "tokenUsage": {
        "prompt_tokens": 100,
        "completion_tokens": 50,
        "total_tokens": 150
      },
      "conversationId": "conv-abc-123"
    }
  }
}
```

The controller reads these from the response and writes to `Query.Status.TokenUsage` and `Query.Status.ConversationId`.

### 4. DevSpace deploys engine as separate pod

```
Dev mode:
┌──────────────┐    ┌──────────────┐
│  Controller   │    │  Query Engine│
│  Pod          │    │  Pod         │
│  go run       │    │  go run      │
│  cmd/main.go  │    │  cmd/query-  │
│               │    │  engine/     │
│  --query-     │    │  main.go     │
│  engine-addr= │    │  :9090       │
│  http://query-│    │              │
│  engine:9090  │    │              │
└──────────────┘    └──────────────┘
        │                    ▲
        └── K8s Service ─────┘
```

The engine gets its own devspace image, sync config, and dev entry. Code changes to the engine restart only the engine pod. Code changes to the controller restart only the controller pod.

Production deployment remains sidecar (Helm chart unchanged).

## Risks / Trade-offs

- [Engine stream finalization without Query CR] The final chunk previously included the completed Query CR status. Without it, the dashboard relies on the chunk content alone. → The dashboard already has all content from streaming chunks; the Query CR can be read separately if final status is needed.
- [Token usage accuracy] The engine's eventing recorder collects tokens, but the genai layer may not return them through `ExecutionResult`. → Need to verify how token counts flow through the genai layer and ensure they reach the A2A response.
- [DevSpace separate pods] Adds complexity to devspace.yaml with a second image and service. → Justified by faster dev iteration — independent restarts save significant time.
