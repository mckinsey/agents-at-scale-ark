# Completions Executor

The built-in default execution engine for Ark queries. One of potentially many executors — agents without an `executionEngine` field use this. Custom executors are deployed separately and implement `BaseExecutor` from the Python SDK.

Receives A2A messages from the controller and executes the full turn loop: agent/team orchestration, tool execution, LLM provider calls, memory management, and streaming.

## Build

```bash
cd ark/
make build-completions        # Build binary
make build-completions-container  # Build Docker image
go test ./executors/completions/...  # Run tests
```

## Architecture

- `handler.go` — A2A message handler (ProcessMessage), routes to agent/team/model/tool execution
- `server.go` — HTTP/A2A server setup, health endpoint
- `agent.go`, `team.go`, `model.go`, `tools.go` — Execution logic for each target type
- `memory.go`, `streaming.go` — Memory and event stream management
- `types.go` — Shared types (Message, TeamMember, ExecutionResult)

## Key Patterns

- Stateless from Query CR perspective — receives context via A2A metadata, executes, returns results
- The controller is the sole writer to Query CR status
- Traces are linked to the controller's root span via W3C traceparent propagation. Session ID flows via baggage.
- Team execution supports sequential, round-robin, selector, and graph strategies
- Streaming chunks and events are emitted to the Ark Broker

## Dependencies

Imports from shared packages:
- `internal/a2a/` — A2A protocol types and client creation
- `internal/mcp/` — MCP client and settings
- `internal/resolution/` — Header value resolution from Secrets/ConfigMaps
- `internal/telemetry/`, `internal/eventing/` — Observability
- `api/v1alpha1/` — CRD types
