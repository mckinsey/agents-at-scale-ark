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

The controller sends the same fat metadata contract used by external execution engines (Python SDK's `BaseExecutor`, etc.), extended with a query reference. This keeps one contract for all engines — external engines use the metadata directly, the built-in engine uses its K8s client for anything the metadata doesn't cover.

```json
{
  "role": "user",
  "parts": [{ "text": "<user input>" }],
  "metadata": {
    "ark.mckinsey.com/execution-engine": {
      "agent": {
        "name": "weather-agent",
        "namespace": "default",
        "prompt": "You are a weather assistant...",
        "description": "...",
        "parameters": [{"name": "city", "value": "Boston"}],
        "model": {
          "name": "gpt-4",
          "type": "openai",
          "config": { "openai": { ... } }
        },
        "outputSchema": { ... },
        "labels": {}
      },
      "tools": [
        { "name": "get_weather", "description": "...", "parameters": { ... } }
      ],
      "history": [
        {"role": "user", "content": "..."},
        {"role": "assistant", "content": "..."}
      ],
      "query": { "name": "q-123", "namespace": "default" }
    }
  }
}
```

The `agent`, `tools`, and `history` fields match the existing `ExecutionEngineA2AClient` contract. The `query` field is the only addition — it lets the built-in engine read the Query CR for runtime context.

**What the fat metadata provides** (sufficient for external engines):
- Agent config (resolved prompt, parameters, model + provider config, output schema)
- Tool schemas (name, description, parameters)
- Conversation history
- User input (the A2A message text)

**What the built-in engine resolves via K8s** (beyond the metadata):
- Tool execution (HTTP endpoints, MCP connections, agent/team-as-tool)
- MCP tool discovery (connects to MCP servers at runtime)
- Memory load/save (reads Memory ref from Query CR)
- Streaming config (reads `ark-config-streaming` ConfigMap, streams to ark-broker)
- Model/MCP headers (resolves overrides from Query + Agent CRDs)
- Team member loading (recursive agent/team resolution)

The engine:
1. Parses fat metadata for agent config and tool schemas
2. Reads the Query CR (from `query` ref) for overrides, session, memory ref, timeout
3. Uses K8s client for tool executors, MCP discovery, memory, streaming
4. Executes the turn loop
5. Returns `protocol.Message` with the assistant response

The controller:
1. Receives the A2A response
2. Writes results to Query CR status
3. Sends the final status chunk to ark-broker (with completed Query CR)
4. Calls `NotifyCompletion` + `Close` on the stream

## Query CR Ownership

The controller is the sole writer to the Query CR. The engine never writes to it.

```
Controller                          Engine
    │                                  │
    ├── pending → running              │
    ├── write conversationId           │
    ├── A2A SendMessage ──────────────►│
    │                                  ├── execute (agent/team/model)
    │                                  ├── stream chunks → ark-broker
    │   A2A Response ◄─────────────────┤
    ├── write response to status       │
    ├── write token usage              │
    ├── running → done/error           │
    ├── finalize stream                │
    └── write duration                 │
```

The split is: the engine handles **intermediate** state (streaming chunks to ark-broker, executing tools, running the turn loop), while the controller handles **terminal** state (writing response, setting done/error, finalizing the stream, recording duration).

The engine is stateless from the Query CR perspective — it receives context via A2A metadata, executes, and returns results. If the engine crashes mid-execution, the controller's existing `spec.timeout` handles marking the query as error.

This avoids write conflicts (two writers on the same CR) and keeps the engine focused on execution without needing write RBAC for Query resources.

**Future direction:** The query engine should eventually own all query and associated resource updates, including terminal state. This Phase 1 split is a stepping stone — once the engine is stable, moving terminal state ownership to the engine simplifies the controller further and enables richer progress reporting during execution.

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

The controller knows the sidecar address via a flag/env var (default: `http://localhost:9090`). No ExecutionEngine CR is needed for the built-in engine — the CRD pattern is for user-deployed external engines that need address resolution and health tracking. A co-located sidecar at a known address doesn't benefit from that machinery.

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
| A2A message content | Fat metadata + query ref | Same contract as external engines (Python SDK), engine uses K8s for tool execution, MCP, memory, streaming |
| Streaming destination | Engine → ark-broker directly | Same mechanism as today, no proxy needed |
| Query CR ownership | Controller is sole writer | No write conflicts, engine stays stateless, timeout handles crashes |
| Stream finalization | Controller finalizes | Controller owns Query CR lifecycle |
| Memory ownership | Engine handles load/save | Clean extraction of full execution context |
| Team member routing | Local by default, A2A only if explicit engine | Avoids infinite recursion, matches existing semantics |
| RBAC | Shared SA (sidecar) | Same trust boundary, least-privilege deferred to Phase 2 |
| Engine address | Flag/env var, no default ExecutionEngine CR | Sidecar is always localhost, CRD pattern is for external engines |
| Topology | Sidecar in controller pod | Localhost latency, simplest default |
| Language | Go | Same module, extracts existing code |
