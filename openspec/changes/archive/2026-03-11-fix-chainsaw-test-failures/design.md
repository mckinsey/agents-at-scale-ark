## Context

The query engine extraction (commit `f95ac5a8`) moved all query execution from the controller into a sidecar service communicating via A2A protocol. The controller now always calls `executeViaEngine()`, which sends an A2A message to the sidecar.

This broke 6 chainsaw tests across 3 root causes:

1. **A2A/ExecutionEngine agents** (3 tests): The sidecar doesn't set up context values (`WithQueryContext`, `WithA2AContextID`) that the A2A execution path reads. These agents are just proxying to external services — the sidecar adds an unnecessary hop.

2. **Selector queries** (1 test): The controller resolves `spec.selector` → target, but only sends the query name to the engine. The engine reads `query.Spec.Target` which is nil for selector queries.

3. **Mock-LLM config** (2 tests): Commit `237cd6d7` added `config.rules` with only `/v1/models`, which replaced mock-llm's default rules (including the `/v1/chat/completions` echo handler) via JavaScript spread operator. On main, the test passed because the controller's `createErrorResponse` populated `response.target.name` even on failure. On the engine branch, failures leave `response` nil.

## Goals / Non-Goals

**Goals:**
- Fix all 6 failing chainsaw tests
- Establish clean execution boundary: controller handles external dispatch (A2A, named engines), sidecar handles built-in compute (LLM calls, tool loops)
- Match main branch behavior for error responses

**Non-Goals:**
- Adding context setup to the engine handler for teams containing A2A members (deferred — no failing tests)
- Changing the engine sidecar's internal execution logic
- Modifying how named ExecutionEngine CRDs work

## Decisions

### 1. Controller direct execution for all ExecutionEngine agents

**Decision**: If the target agent has `spec.executionEngine` set (any value — "a2a", "langchain", etc.), the controller executes directly via `MakeAgent` + `agent.Execute()` instead of routing through the sidecar.

**Rationale**: ExecutionEngine agents proxy to external services. The sidecar exists for compute-heavy built-in execution. Double-hopping (controller → sidecar → external) adds latency and forces the sidecar to maintain context it shouldn't need. The agent's internal `executeWithExecutionEngineRouter()` already handles A2A vs named engine dispatch.

**Alternative considered**: Fix the engine handler to set up context and propagate A2A responses. Rejected because it puts controller-level concerns (annotations, K8s resource creation) into the engine and keeps the unnecessary double hop.

### 2. Detection at dispatch time via agent CRD lookup

**Decision**: Before calling `executeViaEngine`, the controller checks if `target.Type == "agent"`, fetches the Agent CRD, and inspects `spec.executionEngine`. Only agents with an execution engine go direct; everything else (built-in agents, teams, models, tools) goes through the sidecar.

**Rationale**: The Agent CRD fetch is cheap (one K8s GET) and gives a definitive answer. The controller already has the impersonated client from `getClientForQuery`.

### 3. Restore context setup and response handling from main

**Decision**: Port the relevant parts of main's `performTargetExecution` and `executeTarget` into a new `executeDirectly` function: context setup (`WithQueryContext`, `WithA2AContextID`, `WithExecutionMetadata`), `MakeAgent` + `Execute`, success/error response creation, and `response.A2A` from `ExecutionResult.A2AResponse`.

**Rationale**: This code was removed during the engine extraction but is still needed for the direct path. A2A agents don't use memory (the external server manages state via contextId), so the memory setup can be simplified.

### 4. Pass resolved target in engine metadata

**Decision**: Add `"target": {"type": "agent", "name": "..."}` to the A2A metadata sent to the engine. Engine reads from metadata first, falls back to `query.Spec.Target`.

**Rationale**: For selector queries, the controller resolves the selector but the query CRD still has `spec.target = nil`. The engine needs the resolved target to dispatch execution. This is the right boundary — controller resolves, engine executes.

### 5. Error response parity for engine path

**Decision**: When `executeViaEngine` returns an error, create an error response with `Target` and `Content` set (matching main's `createErrorResponse`), rather than leaving `response` nil.

**Rationale**: Main's behavior ensures `status.response` is always populated, which tests (and likely consumers) depend on. The engine branch leaving `response` nil is a regression.

### 6. Fix mock-LLM configs

**Decision**: Add `/v1/chat/completions` catch-all rule to both `agent-partial-tool` and `agent-partial-tool-valuefrom` mock-llm-values.yaml files.

**Rationale**: Mock-llm's `{...defaultConfig, ...loadedConfig}` replaces the rules array entirely. Custom `config.rules` must include the chat completions handler. The echo response (`content: "The coordinates are 40.71, -74.01"`) is sufficient for these tests.

## Risks / Trade-offs

- **Two execution paths in controller** → Mitigated by the clear boundary: ExecutionEngine agents go direct, everything else goes through sidecar. The detection is a single CRD lookup.
- **Teams with A2A members still use engine path without context** → Deferred. No failing tests exercise this. Can add engine-side context setup later if needed.
- **Telemetry added back to QueryReconciler** → Minor struct change. `telemetryProvider` already exists in `main.go`, just needs wiring.
