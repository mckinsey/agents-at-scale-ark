# Completions Executor Extraction — Tasks

## Phase 1: Extract Shared Infrastructure from genai

### 1. Create `internal/a2a/` package
- Move from `genai/`: `CreateA2AClient()`, `A2AResponse`, `A2AAgentCard`, `ArkMetadataKey`
- Move from `genai/`: `a2a_protocol.go` (phase constants, `ConvertA2AStateToPhase`, `IsTerminalPhase`, `ExecutionEngineA2A`)
- Move from `genai/`: `a2a_types.go` (`UpdateA2ATaskStatus`, `PopulateA2ATaskStatusFromProtocol`, `MergeArtifacts`, `MergeHistory`)
- Update all imports in `controller/query_controller.go`, `controller/a2atask_controller.go`, `controller/a2aserver_controller.go`
- Update imports in `genai/` files that reference these symbols (a2a_execution.go, execution_engine.go, agent.go)
- Run tests: `go test ./internal/a2a/... ./internal/controller/...`

### 2. Create `internal/mcp/` package
- Move from `genai/`: `MCPClient`, `MCPSettings`, `NewMCPClient()`, `BuildMCPServerURL()`, transport creation, retry logic
- Move from `genai/`: `ResolveHeaders()`, `ResolveHeaderValue()` into `internal/resolution/` (or keep with mcp if preferred)
- Update imports in `controller/mcpserver_controller.go`
- Update imports in `genai/` files (agent_tools.go, tools.go)
- Run tests: `go test ./internal/mcp/... ./internal/controller/...`

### 3. Create `internal/resolution/` package
- Move from `genai/`: `overrides.go` (`ResolveHeaders`, `ResolveHeaderValue`, header resolution from secrets/configmaps)
- Update imports in `internal/mcp/`, `controller/mcpserver_controller.go`
- Update imports in genai model/provider files that use header resolution
- Run tests: `go test ./internal/resolution/...`

### 4. Absorb controller-specific remnants
- Move `genai/model_probe.go` (`ProbeModel`, `ProbeResult`) into `internal/controller/` (as `model_probe.go`)
- Move `genai/evaluator.go` (`CallUnifiedEvaluator`, eval types) into `internal/controller/` (as `evaluator.go`)
- Move `genai/context_retrieval_helper.go` (`NewContextHelper`) into `internal/controller/`
- Move provider/tool type constants from `genai/constants.go` into `internal/validation/`
- Update imports in respective controllers
- Run tests: `go test ./internal/controller/... ./internal/validation/...`

## Phase 2: Move Execution Logic to executors/completions/

### 5. Create `ark/executors/completions/` directory with service infrastructure
- Create `executors/completions/` directory
- Create `README.md` with quickstart
- Create `CLAUDE.md` with service-specific guidelines
- Create local `Makefile` (build, dev, test, install, uninstall targets)

### 6. Move query engine files
- Move `internal/queryengine/handler.go` → `executors/completions/handler.go`
- Move `internal/queryengine/server.go` → `executors/completions/server.go`
- Move `internal/queryengine/*_test.go` → `executors/completions/`
- Update package declaration from `queryengine` to `completions`
- Update import in `cmd/query-engine/main.go`
- Delete `internal/queryengine/`

### 7. Move execution logic from genai to executors/completions/
- Move agent files: `agent.go`, `agent_parameters.go`, `agent_tools.go`
- Move team files: `team.go`, `team_graph.go`, `team_selector.go`
- Move model files: `model.go`, `model_azure.go`, `model_bedrock.go`, `model_generic.go`, `model_openai.go`
- Move provider files: `provider_azure.go`, `provider_bedrock.go`, `provider_openai.go`
- Move tool files: `tools.go`, `partial_tool_executor.go`, `jq_filter.go`
- Move memory files: `memory.go`, `memory_http.go`, `memory_noop.go`
- Move streaming files: `streaming.go`, `execution_result.go`
- Move message/type files: `message_helpers.go`, `types.go`
- Move query files: `query.go`, `query_parameters.go`
- Move context files: `context_utils.go`
- Move A2A execution files: `a2a_execution.go`, `execution_engine.go`, `a2a.go` (remaining execution parts)
- Move all corresponding `*_test.go` files
- Update package declarations to `completions`
- Update internal references (genai self-imports become intra-package)
- Update imports from `internal/a2a/`, `internal/mcp/`, `internal/resolution/`

### 8. Update all external imports
- Update `cmd/query-engine/main.go` → import `executors/completions` instead of `internal/queryengine`
- Update `internal/controller/query_controller.go` → any types imported from genai that moved
- Verify no remaining imports of `internal/genai/` anywhere
- Run full test suite: `go test ./...`

### 9. Delete `internal/genai/`
- Verify no remaining references to the package
- Remove the directory
- Run full build: `go build ./...`
- Run full test suite: `go test ./...`

## Phase 3: Rename and Service Infrastructure

### 10. Rename binary and command
- Rename `cmd/query-engine/` → `cmd/completions/`
- Update `main.go` imports
- Update controller flag from `--query-engine-addr` to `--completions-addr`
- Update controller's `QueryEngineAddr` field to `CompletionsAddr`
- Update `cmd/main.go` flag registration and reconciler setup

### 11. Create Dockerfile
- Create `executors/completions/Dockerfile` (multi-stage Go build)
- Build context: `ark/` (needs go.mod at root)
- Binary: `cmd/completions/main.go`
- Remove old `Dockerfile.query-engine`

### 12. Create Helm chart
- Create `executors/completions/chart/Chart.yaml`
- Create `executors/completions/chart/values.yaml`
- Create `executors/completions/chart/templates/deployment.yaml`
- Create `executors/completions/chart/templates/service.yaml`
- Service name: `ark-completions`, namespace: `ark-system`
- Remove old `charts/ark-query-engine-dev/`

### 13. Create build.mk for monorepo integration
- Create `executors/completions/build.mk`
- Targets: `completions-build`, `completions-test`, `completions-install`, `completions-uninstall`, `completions-dev`
- Stamp files in `$(OUT)/completions/`
- Include from root Makefile (update include pattern or add explicit include)
- Remove old query-engine build targets from `ark/Makefile`

### 14. Create devspace.yaml
- Create `executors/completions/devspace.yaml`
- Image definition: `ark-completions`
- Deployment: helm chart from `./chart`
- Dev mode: hot-reload with sync
- Update root `devspace.yaml` to reference as dependency
- Remove old query-engine image/deployment entries

## Phase 4: CI/CD and Verification

### 15. Update CI/CD pipeline
- Update `.github/workflows/cicd.yaml` build-containers matrix: replace `ark-query-engine` with `ark-completions`
- Update Dockerfile path in matrix entry
- Update any test jobs that reference query-engine
- Verify build passes in CI

### 16. Run full verification
- All unit tests pass: `go test ./...`
- All chainsaw/e2e tests pass
- DevSpace deploy works: `devspace dev`
- Helm install works independently
- `make completions-build`, `make completions-test` work
- No remaining references to `genai` or `query-engine` in Go imports
- No remaining references to `query-engine` in Makefile/devspace/CI (except git history)

## Success Criteria

- [x] `internal/genai/` is deleted — no grab-bag package
- [x] `executors/completions/` exists as a composed service unit with README, CLAUDE.md, Makefile, Dockerfile, chart, devspace
- [x] Shared infra lives in focused packages: `internal/a2a/`, `internal/mcp/`, `internal/resolution/`
- [x] Controller-specific code absorbed by owning controllers
- [x] `cmd/completions/` binary builds and runs
- [x] `ark-completions` image builds in CI
- [x] Deploys in `ark-system` namespace as part of default Ark install
- [x] All existing e2e tests pass unchanged
- [x] Dependency graph has no cycles
- [x] Root Makefile builds via `make build-completions`
