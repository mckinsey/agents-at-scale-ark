# Ark Query Engine — Tasks

## Phase 1: Engine Binary

### 1. Scaffold the engine binary
- Create `ark/cmd/query-engine/main.go`
- Initialize K8s client (controller-runtime client)
- Initialize telemetry and eventing providers (noop or OTEL based on config)
- Listen on `localhost:9090`
- Health endpoint at `GET /health`

### 2. Implement A2A server handler
- Create `ark/internal/queryengine/server.go` — A2A server setup using `trpc-a2a-go/server`
- Create `ark/internal/queryengine/handler.go` — message handler
- Expose `/.well-known/agent-card.json`
- Parse `ark.mckinsey.com/execution-engine` metadata from incoming messages
- Extract query ref, target ref, eventStreamAddress

### 3. Implement execution handler
- Read Query CR from K8s using metadata refs
- Read target CRD (Agent/Team/Model) from K8s
- Create memory client from Query's memory ref
- Create EventStream from streaming config (to ark-broker)
- Route to agent/team/model execution (calling existing genai functions)
- Return `protocol.Message` with assistant response
- Return token usage in response metadata

### 4. Dockerfile and build
- Create `Dockerfile.query-engine` (multi-stage Go build)
- Add `make` targets: `query-engine-build`, `query-engine-test`, `query-engine-docker-build`
- Ensure CI builds both binaries

## Phase 2: Controller Refactor

### 5. Add A2A client to controller for engine communication
- In `query_controller.go`, create `ExecutionEngineA2AClient` for the default engine
- Build thin A2A message with query + target refs
- Send via `SendMessage` (blocking mode initially)
- Parse response and extract assistant message + token usage

### 6. Remove direct execution from controller
- Remove `performTargetExecution()` and its helper functions
- Remove direct calls to `MakeAgent()`, `MakeTeam()`, `LoadModel()` for execution
- Remove memory client creation for execution
- Remove tool registry creation
- Keep: target resolution, Query CR status writes, stream finalization

### 7. Update stream finalization
- Controller no longer creates EventStream for execution
- Controller still calls `finalizeEventStream()` after A2A response
- This sends the final completed Query status chunk and closes the stream
- Verify ark-broker receives both engine chunks and controller's final chunk correctly

## Phase 3: Deployment

### 8. Helm chart: sidecar container
- Add query-engine container to `manager.yaml` as sidecar
- Image from `Dockerfile.query-engine`
- Port: 9090 (not exposed via Service — localhost only)
- Liveness/readiness probes on `/health`
- Resource limits (configurable via values.yaml)
- Share controller's ServiceAccount

### 9. Controller routing logic
- Add `--query-engine-addr` flag to controller (default: `http://localhost:9090`)
- When agent/team/model has no explicit `executionEngine`, send A2A message to flag address
- Existing agents with explicit `executionEngine` refs continue to work unchanged
- No default ExecutionEngine CR needed — sidecar address is configuration, not a resource

## Phase 4: Verification

### 11. Unit tests for engine handler
- Test A2A message parsing (metadata extraction)
- Test execution routing (agent/team/model)
- Test error handling (missing CRDs, invalid metadata)
- Test response construction
- Target: 100% coverage on `internal/queryengine/`

### 12. Integration testing
- All existing e2e/chainsaw tests pass without modification
- Verify streaming works end-to-end (engine → ark-broker → client)
- Verify memory load/save works through engine
- Verify team orchestration with mixed execution engines
- Verify tool execution (HTTP, MCP, agent-as-tool, team-as-tool)

### 13. Documentation updates
- Update architecture docs to reflect engine separation
- Document ExecutionEngine CR and default deployment
- Update query execution flow docs
- Add engine configuration reference (port, health endpoint)

## Success Criteria

- [x] Controller has no direct LLM execution — turn loop, provider adapters, and completions logic only run in the engine
- [x] `ark/cmd/query-engine/` exists — own binary, Dockerfile, health endpoint
- [x] Default install deploys the engine — sidecar in controller pod, address via flag
- [x] A2A is the protocol — controller and engine communicate via `protocol.Message` only
- [ ] All existing e2e tests pass — zero user-facing change
- [x] Engine has unit test coverage on `internal/queryengine/` (pure functions covered, K8s-dependent methods require integration tests)
