# Completions Executor Extraction — Design

## Target Architecture

```
ark/
├── executors/
│   └── completions/                  ← first-class service unit
│       ├── README.md
│       ├── CLAUDE.md
│       ├── Makefile                  ← local convenience targets
│       ├── Dockerfile                ← multi-stage build (context: ark/)
│       ├── build.mk                 ← monorepo integration
│       ├── devspace.yaml             ← standalone devspace config
│       ├── chart/
│       │   ├── Chart.yaml
│       │   ├── values.yaml
│       │   └── templates/
│       │       ├── deployment.yaml
│       │       └── service.yaml
│       │
│       │  ── execution layer (from genai + queryengine) ──
│       ├── handler.go                ← ProcessMessage (A2A TaskHandler)
│       ├── server.go                 ← HTTP/A2A server, health endpoint
│       ├── agent.go                  ← Agent struct, Execute(), MakeAgent()
│       ├── agent_parameters.go       ← parameter resolution
│       ├── agent_tools.go            ← tool executor factories
│       ├── a2a_execution.go          ← A2AExecutionEngine, ExecutionEngineA2AClient
│       ├── execution_engine.go       ← named execution engine client
│       ├── team.go                   ← Team struct, Execute(), MakeTeam()
│       ├── team_graph.go             ← graph-based execution
│       ├── team_selector.go          ← selector-based execution
│       ├── model.go                  ← LoadModel(), ResolveModelSpec()
│       ├── model_azure.go
│       ├── model_bedrock.go
│       ├── model_generic.go
│       ├── model_openai.go
│       ├── provider_azure.go
│       ├── provider_bedrock.go
│       ├── provider_openai.go
│       ├── tools.go                  ← ToolRegistry, ToolExecutor, HTTPExecutor
│       ├── partial_tool_executor.go  ← streaming tool execution
│       ├── jq_filter.go              ← JQ filtering on tool results
│       ├── memory.go                 ← MemoryInterface, factories
│       ├── memory_http.go            ← HTTPMemory implementation
│       ├── memory_noop.go            ← NoopMemory for testing
│       ├── streaming.go              ← EventStreamInterface, HTTPEventStream, chunks
│       ├── messages.go               ← Message type, Prepare*, Extract* helpers
│       ├── types.go                  ← TeamMember, ExecutionResult, ToolCall
│       ├── query.go                  ← MakeQuery, query parsing, MCP settings
│       ├── context.go                ← execution context injection
│       └── *_test.go                 ← all tests move with their files
│
├── cmd/
│   ├── main.go                       ← ark-controller binary
│   └── completions/main.go           ← completions executor binary
│
├── internal/
│   ├── a2a/                          ← shared A2A protocol + client
│   │   ├── client.go                 ← CreateA2AClient()
│   │   ├── types.go                  ← A2AResponse, A2AAgentCard, ArkMetadataKey
│   │   ├── protocol.go               ← phase constants, ConvertA2AStateToPhase,
│   │   │                                IsTerminalPhase, ExecutionEngineA2A
│   │   └── status.go                 ← UpdateA2ATaskStatus, MergeArtifacts,
│   │                                    MergeHistory
│   │
│   ├── mcp/                          ← shared MCP client
│   │   ├── client.go                 ← MCPClient, transport, retry
│   │   ├── settings.go               ← MCPSettings
│   │   └── url.go                    ← BuildMCPServerURL
│   │
│   ├── resolution/                   ← shared value resolution
│   │   └── headers.go                ← ResolveHeaders, ResolveHeaderValue
│   │
│   ├── controller/
│   │   ├── query_controller.go       ← imports a2a/, completions types
│   │   ├── a2atask_controller.go     ← imports a2a/ (status, phases)
│   │   ├── a2aserver_controller.go   ← imports a2a/ (discovery, types)
│   │   ├── mcpserver_controller.go   ← imports mcp/
│   │   ├── model_controller.go       ← absorbs model_probe.go
│   │   └── evaluation_controller.go  ← absorbs evaluator.go,
│   │                                    context_retrieval_helper.go
│   │
│   ├── validation/                   ← absorbs genai constants.go
│   ├── telemetry/                    ← unchanged
│   ├── eventing/                     ← unchanged
│   ├── common/                       ← unchanged
│   ├── annotations/                  ← unchanged
│   │
│   └── genai/                        ← DELETED
│
├── api/v1alpha1/                     ← unchanged
└── go.mod                            ← single module
```

## Dependency Graph

```
  api/v1alpha1                 ← CRD types (leaf dependency)
       ▲
       │
  internal/a2a    internal/mcp    internal/resolution
       ▲               ▲                ▲
       │               │                │
  ┌────┴───────────────┴────────────────┴────┐
  │                                          │
  executors/completions/   internal/controller/
  (execution layer)        (orchestration layer)
```

No cycles. Each package has a single clear purpose.

## Package Roles

| Package | Role | Imports |
|---------|------|---------|
| `executors/completions/` | Execute queries against agents, teams, models, tools | `a2a/`, `mcp/`, `resolution/`, `telemetry/`, `eventing/`, `api/v1alpha1` |
| `internal/a2a/` | A2A protocol types, client creation, status management | `api/v1alpha1`, `resolution/` |
| `internal/mcp/` | MCP client, transport, server URL building | `resolution/` |
| `internal/resolution/` | Resolve values from K8s secrets, configmaps, overrides | `api/v1alpha1` |
| `internal/controller/` | K8s reconciliation, target resolution, status writes | `a2a/`, `mcp/`, `completions/` types, `telemetry/`, `eventing/` |

## A2A Symbol Placement

A2A splits across three consumers:

```
internal/a2a/ (shared)               executors/completions/ (execution)
─────────────────────                 ──────────────────────────────────
CreateA2AClient()                     A2AExecutionEngine
A2AResponse                           ExecutionEngineA2AClient
ArkMetadataKey                        ExecuteA2AAgent
A2AAgentCard                          ExtractTextFromParts
ExecutionEngineA2A (const)
Phase* constants
ConvertA2AStateToPhase()
IsTerminalPhase()
UpdateA2ATaskStatus()

        ▲                                      ▲
        │                                      │
   controller/                            executors/
   ├── query_controller (client)          completions/
   ├── a2atask_controller (status)        (execution engines)
   └── a2aserver_controller (discovery)
```

## MCP Symbol Placement

```
internal/mcp/ (shared)               executors/completions/ (execution)
──────────────────────                ──────────────────────────────────
MCPClient                             MCPExecutor (tool execution wrapper)
MCPSettings                           MCPClientPool
BuildMCPServerURL()                   createMCPExecutor()
NewMCPClient()

        ▲                                      ▲
        │                                      │
   controller/                            executors/
   mcpserver_controller                   completions/
   (validation, tool listing)             (tool execution at runtime)
```

## Controller Absorptions

Symbols too small for their own package — absorbed by their sole consumer:

| Symbol | Source | Destination | Rationale |
|--------|--------|-------------|-----------|
| `ProbeModel()`, `ProbeResult` | `genai/model_probe.go` | `controller/model_controller.go` (or `controller/model_probe.go`) | Only used by model controller for health checks |
| `CallUnifiedEvaluator()`, eval types | `genai/evaluator.go` | `controller/evaluation_controller.go` (or `controller/evaluator.go`) | Only used by eval controller |
| `NewContextHelper()` | `genai/context_retrieval_helper.go` | `controller/` | Only used by eval controller |
| Provider/tool type constants | `genai/constants.go` | `internal/validation/` | Used by validation webhooks |

## Go Module Boundary

Same Go module (`ark/go.mod`). The `executors/` directory is NOT under `internal/` — it's a top-level directory in the module, making it importable. This is intentional: future tooling or test harnesses may need to import executor types.

The `cmd/completions/main.go` binary builds from the module root:
```
go build -o bin/completions cmd/completions/main.go
```

## Dockerfile

Lives at `executors/completions/Dockerfile`, built with context `ark/` (needs `go.mod` at root):

```dockerfile
FROM golang:1.24 AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o completions cmd/completions/main.go

FROM gcr.io/distroless/static:nonroot
COPY --from=builder /app/completions /completions
ENTRYPOINT ["/completions"]
```

Build invocation from CI/devspace: `docker build -f executors/completions/Dockerfile .` (from `ark/`).

## Service Identity

| Attribute | Old | New |
|-----------|-----|-----|
| Binary name | `query-engine` | `completions` |
| Image name | `ark-query-engine` | `ark-completions` |
| Helm release | `ark-query-engine-dev` | `ark-completions` |
| Namespace | `ark-system` | `ark-system` |
| Port | `9090` | `9090` |
| Controller flag | `--query-engine-addr` | `--completions-addr` |
| DevSpace image key | `ark-query-engine` | `ark-completions` |

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Directory name | `executors/` not `engines/` | Describes what they do (execute), not what they are |
| Top-level vs internal | `ark/executors/` (not `internal/`) | First-class service, importable by tests/tooling |
| Go module | Same module (`ark/go.mod`) | Heavy dependency on CRD types, telemetry, eventing |
| genai fate | Dissolved entirely | Remnants too small for a coherent package |
| Shared A2A/MCP | Own packages under `internal/` | Genuinely used by both executor and controllers |
| Small remnants | Absorbed by owning controllers | No single-file packages |
| Naming convention | `completions` | Internal message format is completions-based |
| Future executors | `executors/responses/`, `executors/langchain/` | Pattern established, slots in naturally |
