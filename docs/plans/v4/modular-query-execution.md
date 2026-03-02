# Modular Query Execution

## Objective

The Ark controller contains the LLM agent loop — completions, tool calling, response assembly. Adding a new model type means modifying the operator. We extract this into a standalone A2A service so that adding new model support means deploying a new engine — not changing the controller.

## Current State

[#1232](https://github.com/mckinsey/agents-at-scale-ark/issues/1232) unified internal transport to A2A. All message passing now uses `protocol.Message` end-to-end. The controller already routes to external engines via the `ExecutionEngine` CRD. Three execution capabilities exist:

| Capability | When | What happens |
|-----------|------|-------------|
| `a2a-native-local` | No `executionEngine` on agent | Built-in turn loop (what we extract) |
| `a2a-native-a2a-engine` | `executionEngine.name = "a2a"` | Dispatch to A2A Server CRD |
| `a2a-native-external-engine` | Any other name | Dispatch to external ExecutionEngine CRD |

## Agreed Design ([#1219](https://github.com/mckinsey/agents-at-scale-ark/issues/1219))

- Every execution engine is an A2A server. The controller is an A2A client.
- A default engine ships with Ark — works identically out of the box.
- The existing `ExecutionEngine` CRD is a named pointer to a service address.
- Engines call Ark-managed tools (MCP, Tool CRDs) via `input-required` callbacks.
- New engine types deploy independently — no operator changes.

---

## Phase 1: Extract the Ark Query Engine

Move the `a2a-native-local` execution path out of the controller into `services/ark-query-engine/`. The controller's local execution path is replaced by an A2A call to the new service. Default install runs the engine as a sidecar in the controller pod.

```
 ┌─────────────────────────────────────────────────────────┐
 │                CONTROLLER POD (ark-system)               │
 │                                                          │
 │  ┌──────────────┐    A2A (localhost)   ┌──────────────┐ │
 │  │  Ark          │ ◄────────────────► │  Ark Query    │ │
 │  │  Controller   │                     │  Engine       │ │
 │  │               │                     │               │ │
 │  │  routes query │                     │  turn loop    │ │
 │  │  to engine    │                     │  providers    │ │
 │  └──────────────┘                     │  adapters     │ │
 │                                        └──────────────┘ │
 │  ExecutionEngine CR (already exists)                     │
 │  name: ark-default                                       │
 │  address: localhost:PORT                                  │
 └─────────────────────────────────────────────────────────┘
```

### Success Criteria

1. **Controller has no executor** — The turn loop, provider adapters, and completions logic are removed from the controller.
2. **`services/ark-query-engine/` exists** — Own binary, Dockerfile, Go module. 100% unit test coverage enforced in CI. Serves as the reference implementation for all future engines.
3. **A2A is the protocol** — Controller and engine communicate exclusively via A2A `protocol.Message`.
4. **Tool callbacks via `input-required`** — Engine signals the controller for Ark-managed tools. Controller executes and returns results via A2A.
5. **Default install deploys it** — `ExecutionEngine` CR in `ark-system` points to the sidecar. Deleting it disables query execution.
6. **All existing e2e tests pass** — Zero user-facing change.

### Implementation Steps

**Step 1: Create the service**

`services/ark-query-engine/` — a Go A2A server containing:

- The turn loop (from `A2ALocalEngine` / `a2a_local_engine.go`)
- Provider adapters (`OpenAIA2AModelAdapter`, `provider_openai.go`, `provider_azure.go`, `provider_bedrock.go`, etc.)
- Model loading (`model_generic.go`)
- Tool callback client (sends `input-required`, receives results)
- Health endpoint
- Own `main.go`, `Dockerfile`, `Makefile`

**Step 2: Remove execution from the controller**

Delete from the controller:

- `a2a_local_engine.go` and the built-in turn loop
- All `provider_*.go` files
- `OpenAIA2AModelAdapter` and related adapters
- The `a2a-native-local` capability path

The controller retains:

- Query reconciliation and target resolution
- A2A client dispatch to engines
- ToolRegistry and tool execution
- Memory service integration
- Streaming relay
- Team orchestration

**Step 3: Wire the sidecar**

- Add engine container to the controller pod spec (Helm / DevSpace)
- Default `ExecutionEngine` CR in `ark-system` pointing to `localhost:PORT`
- What was `a2a-native-local` now routes through `a2a-native-external-engine` to the sidecar

**Step 4: Test**

- Unit tests in `services/ark-query-engine/` — 100% coverage
- All existing e2e / chainsaw tests pass unchanged
- Standalone engine integration tests deferred

---

## Later Phases

- New engine types (Claude, Responses API) — deploy as separate A2A services
- Namespace-level engine deployment and routing
- Standalone engine integration test suite
- Language rewrites
- Dashboard visibility, capability annotations, session isolation
