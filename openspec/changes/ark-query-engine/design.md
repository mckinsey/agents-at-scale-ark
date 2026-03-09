# Ark Query Engine — Design

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Controller Pod                                         │
│                                                         │
│  ┌──────────────┐    A2A        ┌────────────────────┐  │
│  │  Controller   │──message────►│  Query Engine      │  │
│  │  (reconciler) │              │  (sidecar)         │  │
│  │               │◄─response────│                    │  │
│  │  - watch CRs  │              │  - agent loop      │  │
│  │  - resolve    │              │  - team orchestr.  │  │
│  │    target     │              │  - tool execution  │  │
│  │  - write      │              │  - LLM providers   │  │
│  │    status     │              │  - memory load/    │  │
│  │  - finalize   │              │    save            │  │
│  │    stream     │              │  - stream chunks   │  │
│  └──────────────┘              └─────────┬──────────┘  │
│                                          │              │
└──────────────────────────────────────────┼──────────────┘
                                           │ chunks (ndjson)
                                           ▼
                                    ┌─────────────┐
                                    │ ark-broker   │
                                    │ (streaming)  │
                                    └─────────────┘
```

## A2A Message Contract

The controller sends a thin A2A message. The engine reads CRDs using its own K8s client.

```json
{
  "role": "user",
  "parts": [{ "text": "<user input>" }],
  "metadata": {
    "ark.mckinsey.com/execution-engine": {
      "query": { "name": "q-123", "namespace": "default" },
      "target": {
        "type": "agent|team|model",
        "name": "weather-agent",
        "namespace": "default"
      },
      "eventStreamAddress": "http://ark-broker.ark-system:8080/stream/q-123"
    }
  }
}
```

The engine:
1. Reads the Query CR for overrides, session, memory ref, timeout
2. Reads the target CRD (Agent/Team/Model)
3. Calls `MakeAgent()` / `MakeTeam()` / `LoadModel()` — same code paths as today
4. Creates its own EventStream to ark-broker
5. Executes the turn loop
6. Returns `protocol.Message` with the assistant response

The controller:
1. Receives the A2A response
2. Writes results to Query CR status
3. Sends the final status chunk to ark-broker (with completed Query CR)
4. Calls `NotifyCompletion` + `Close` on the stream

## Module Structure

Same Go module (`ark/`), separate binary:

```
ark/
├── cmd/
│   ├── main.go                      (controller binary)
│   └── query-engine/
│       └── main.go                  (engine binary — A2A server)
│
├── internal/
│   ├── genai/                       (shared by both binaries)
│   ├── common/                      (shared)
│   ├── eventing/                    (shared)
│   ├── telemetry/                   (shared)
│   ├── annotations/                 (shared)
│   ├── controller/                  (controller binary only)
│   └── queryengine/                 (engine binary only)
│       ├── server.go                (A2A server setup, health endpoint)
│       └── handler.go               (message handler — bridges A2A to genai)
│
├── Dockerfile                       (controller)
├── Dockerfile.query-engine          (engine)
└── dist/chart/templates/manager/
    └── manager.yaml                 (adds sidecar container)
```

## Code Movement

### What the engine runs (extracted from controller)

The `internal/genai/` package moves conceptually from "controller library" to "shared library". No file moves needed — both binaries import it.

The engine handler replaces `query_controller.go:performTargetExecution()`:
- `MakeAgent()` + `agent.Execute()` (with `executeLocally()` path)
- `MakeTeam()` + `team.Execute()`
- `LoadModel()` + `model.ChatCompletion()`
- Memory load/save around execution
- EventStream creation and chunk streaming

### What the controller keeps

- `Reconcile()` loop — watch Query CRs, handle lifecycle
- Target resolution — resolve agent/team/model from spec
- A2A SendMessage to engine (replacing direct execution)
- Writing results to Query CR status
- Stream finalization (final status chunk + close)
- TTL, cancellation, finalizers

### What the controller deletes

- Direct calls to `MakeAgent()`, `MakeTeam()`, `LoadModel()`
- Direct calls to `agent.Execute()`, `team.Execute()`, `model.ChatCompletion()`
- Memory client creation for execution
- Tool registry creation
- The `performTargetExecution()` function and its helpers

## Team Orchestration

The engine handles team orchestration internally. For each team member:

- Members **without** an explicit `executionEngine` → execute locally inside the engine
- Members **with** an explicit `executionEngine` → call out via A2A (recursive, possibly back to this engine or a different one)

This matches the current behavior where `Agent.executeAgent()` checks for `ExecutionEngine` before falling back to `executeLocally()`.

## Streaming

The engine creates its own `HTTPEventStream` by reading the `ark-config-streaming` ConfigMap (same as the controller does today). Chunks flow directly from the engine to ark-broker during execution.

Stream lifecycle split:
- **Engine**: `NewEventStreamForQuery()` → `StreamChunk()` during execution
- **Controller**: `finalizeEventStream()` after A2A response (sends completed Query status, calls `NotifyCompletion` + `Close`)

## Memory

The engine handles memory load and save:
1. Reads Memory ref from Query CR
2. Creates memory client (`NewMemoryForQuery()`)
3. Loads initial messages before execution
4. Saves new messages after execution

## Sidecar Deployment

The engine runs as a sidecar container in the controller pod:
- Listens on `localhost:9090` (not exposed outside the pod)
- Shares the controller's ServiceAccount (same RBAC permissions)
- Health endpoint at `/health` for K8s probes

A default ExecutionEngine CR is created in `ark-system` namespace pointing to `http://localhost:9090`.

## A2A Server Implementation

Uses `trpc-a2a-go v0.2.4` server package:
- Exposes `/.well-known/agent-card.json` (agent discovery)
- Handles `SendMessage` JSON-RPC method
- Supports blocking mode (wait for completion, return response)
- Streaming support via `StreamMessage` for progressive output

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Module boundary | Same Go module, separate binary | Avoids `internal/` visibility issues, no import refactoring |
| A2A message content | Thin refs (query + target names) | Engine has K8s client, reads CRDs directly |
| Streaming destination | Engine → ark-broker directly | Same mechanism as today, no proxy needed |
| Stream finalization | Controller finalizes | Controller owns Query CR lifecycle |
| Memory ownership | Engine handles load/save | Clean extraction of full execution context |
| Team member routing | Local by default, A2A only if explicit engine | Avoids infinite recursion, matches existing semantics |
| RBAC | Shared SA (sidecar) | Same trust boundary, least-privilege deferred to Phase 2 |
| Topology | Sidecar in controller pod | Localhost latency, simplest default |
| Language | Go | Same module, extracts existing code |
