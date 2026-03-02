# Ark Query Engine Specification

## Objective

Extract the LLM execution loop from the Ark controller into a standalone A2A service (`services/ark-query-engine/`). The controller becomes a query router. Adding new model support means deploying a new engine, not changing the controller.

Builds on [#1219](https://github.com/mckinsey/agents-at-scale-ark/issues/1219) (architecture agreement) and [#1232](https://github.com/mckinsey/agents-at-scale-ark/issues/1232) (A2A as internal transport).

---

## Flows

### 1. Query Execution (Happy Path)

<!-- TODO: Excalidraw diagram -->

```
User creates Query CR
        │
        ▼
Ark Controller
  ├─ Resolve target (agent / team / model)
  ├─ Look up ExecutionEngine CR
  ├─ Read status.lastResolvedAddress
  │
  ▼
A2A SendMessage ──────────────────────► Ark Query Engine
  protocol.Message                        │
  (agent spec, prompt, history,           ├─ Build prompt
   tools, config)                         ├─ Call LLM provider
                                          ├─ Parse response
                                          ├─ Return result
                                          │
A2A Response ◄────────────────────────────┘
  protocol.Message
  (assistant response, token usage)
        │
        ▼
Controller writes result to Query CR status
```

**E2e coverage:**
- `tests/queries/` — agent + query, validates `Query.status.conditions[Completed]=True`
- `tests/llm-tests/queries/` — multi-provider, validates `phase: done` with substantive response
- `tests/query-input-type/` — multiple input formats (default, user, messages), all validate `phase: done`

### 2. Tool Callback (`input-required`)

<!-- TODO: Excalidraw diagram -->

```
Ark Query Engine                          Ark Controller
  │                                          │
  ├─ LLM returns tool_call                   │
  │                                          │
  ├─ A2A StatusUpdate ──────────────────────►│
  │   state: input-required                  │
  │   tool_call: {name, args}                │
  │                                          ├─ ToolRegistry executes tool
  │                                          │   (MCP server / Tool CRD / HTTP)
  │                                          │
  │◄──────────────────── A2A SendMessage ────┤
  │   tool_result: {output}                  │
  │                                          │
  ├─ Feed result back to LLM                 │
  ├─ Continue turn loop                      │
  │   (may trigger more tool calls)          │
```

**E2e coverage:**
- `tests/weather-chicago/` — creates HTTP tools (`get-coordinates`, `get-forecast`), agent executes tools via LLM, validates query completes with tool-derived response
- `tests/agent-tools/` — weather tool + agent, validates tool invocation and query completion
- `tests/agent-partial-tool/` — tool with partial parameter binding, validates agent handles tool availability

### 3. Error / Rejection

<!-- TODO: Excalidraw diagram -->

```
Controller ── A2A SendMessage ──► Engine
                                    │
                                    ├─ Can't handle query
                                    │   (unsupported model, bad config, etc.)
                                    │
Controller ◄── A2A Error ──────────┘
  │             (error code + message)
  ▼
Query CR status: Failed
  reason: engine error message
```

**E2e coverage:**
- `tests/a2a-blocking-task-failed/` — invalid input to agent, validates `phase: error` with error message
- `tests/query-input-type/` — invalid input scenarios (`*-invalid-input` steps), validates `phase: error`
- `tests/admission-failures/` — ~30 validation scenarios for malformed Query/Agent/Tool specs (admission-level, not engine-level)

### 4. Streaming

<!-- TODO: Excalidraw diagram -->

```
Controller ── A2A SendMessage/Subscribe ──► Engine
                                              │
Controller ◄── A2A StatusUpdate (working) ────┤  partial text
Controller ◄── A2A StatusUpdate (working) ────┤  more text
Controller ◄── A2A StatusUpdate (working) ────┤  tool_call (input-required)
   ... tool callback round-trip ...           │
Controller ◄── A2A StatusUpdate (completed) ──┘  final response
```

**E2e coverage: gap.** No dedicated streaming chainsaw tests exist. Streaming is validated via the dashboard/broker integration but not at the engine level. Consider adding a streaming-specific e2e test.

---

## Engine Contract

An execution engine is an A2A server. It must:

1. **Accept `protocol.Message`** containing:
   - Agent spec (prompt, model reference, annotations)
   - Conversation history
   - Available tools (names, schemas)
   - Engine config (`map[string]string` from ExecutionEngine CR `spec.config`)

2. **Execute the LLM turn loop:**
   - Build the prompt from agent spec + history
   - Call the LLM provider
   - If LLM returns tool calls → signal `input-required` and wait for results
   - Repeat until LLM returns a final response or max turns reached

3. **Return `protocol.Message`** containing:
   - Assistant response (text, structured data)
   - Token usage
   - Any artifacts

4. **Signal `input-required`** for tools it cannot execute itself. The controller handles Ark-managed tools (MCP, Tool CRDs) and returns results via A2A.

5. **Report errors** via A2A error responses with machine-readable codes and human-readable messages.

6. **Support streaming** via A2A `StatusUpdate` events (`working` → `working` → `completed`).

7. **Expose a health endpoint** for Kubernetes liveness/readiness probes.

---

## Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Protocol | A2A | Already the internal transport (#1232). No new protocol needed. |
| Topology | Sidecar in controller pod | Simplest default. No new Deployments or Services. Localhost latency. |
| Language | Go | Codebase compatibility. Extracts existing Go code directly. |
| Coverage | 100% unit test | Reference implementation — future engines are tested against this contract. |
| CRD | Existing `ExecutionEngine` | Already exists. Just create a default instance in `ark-system`. |
| Tool callbacks | `input-required` | Keeps ToolRegistry in the controller. Any engine can use Ark tools. |

---

## What Moves Where

| Component | From | To |
|-----------|------|----|
| Turn loop (`A2ALocalEngine`) | Controller | `services/ark-query-engine/` |
| Provider adapters (`OpenAIA2AModelAdapter`) | Controller | `services/ark-query-engine/` |
| Provider implementations (`provider_*.go`) | Controller | `services/ark-query-engine/` |
| Model loading (`model_generic.go`) | Controller | `services/ark-query-engine/` |
| A2A message types | Controller | Shared module |
| Query reconciler | Controller | Stays |
| ToolRegistry | Controller | Stays |
| Memory service | Controller | Stays |
| Streaming relay | Controller | Stays |
| Team orchestration | Controller | Stays |

---

## Phase 1 Success Criteria

1. **Controller has no executor** — Turn loop, provider adapters, and completions logic removed.
2. **`services/ark-query-engine/` exists** — Own binary, Dockerfile, Go module. 100% unit test coverage in CI.
3. **A2A is the protocol** — Controller and engine communicate via `protocol.Message` only.
4. **Tool callbacks work** — Engine signals `input-required`, controller executes tools, returns results.
5. **Default install deploys it** — `ExecutionEngine` CR in `ark-system` points to sidecar.
6. **All existing e2e tests pass** — Zero user-facing change.

---

## Implementation Steps

1. **Create `services/ark-query-engine/`** — A2A server with turn loop, provider adapters, tool callback client, health endpoint. Own `main.go`, `Dockerfile`, `Makefile`.
2. **Remove execution from controller** — Delete `a2a_local_engine.go`, `provider_*.go`, adapters, `a2a-native-local` path.
3. **Wire the sidecar** — Add engine container to controller pod spec. Default `ExecutionEngine` CR in `ark-system` at `localhost:PORT`.
4. **Test** — 100% unit coverage on new module. All existing e2e/chainsaw tests pass.

---

## Later Phases

- New engine types (Claude, Responses API) as separate A2A services
- Namespace-level engine deployment and routing
- Standalone engine integration test suite
- Streaming e2e test coverage
- Language rewrites
- Dashboard visibility, capability annotations, session isolation
