# Completions Executor

The default execution engine for Ark queries, deployed as a separate service from the controller. Agents without an `executionEngine` field use this. Like all executors, it communicates with the controller via A2A over HTTP. Custom executors implement `BaseExecutor` from the Python SDK.

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

- Does not write to Query CRs — receives context via A2A metadata, executes, returns results. However, the A2A MemoryTaskManager holds conversation history, active tasks, and streaming subscribers in memory, making the process stateful
- The controller is the sole writer to Query CR status
- Traces are linked to the controller's root span via W3C traceparent propagation. Session ID flows via baggage.
- Team execution supports sequential, round-robin, selector, and graph strategies
- Streaming chunks and events are emitted to the Ark Broker

## Scaling

The chart supports multiple replicas (`replicaCount`, or an HPA via `autoscaling.enabled`)
plus a `PodDisruptionBudget` and a bounded graceful-shutdown drain (`terminationGracePeriodSeconds`,
`gracefulShutdown.preStopSleepSeconds`, and the binary's `--shutdown-timeout` flag).

Running N replicas is **safe for the controller's dispatch path**: each Query is sent as a
single blocking A2A request-response (`Blocking: true`) handled start-to-finish by one pod,
`executionState` is request-scoped, and conversation history is stored externally
(`HTTPMemory` → Memory service). Any replica can serve any request; follow-up turns are
matched by `ConversationId` from the external store.

### Shared task state (Redis)

Set `taskManager.backend: redis` (and a `redis.url` or `redis.urlSecretRef`) to use the
`trpc-a2a-go/taskmanager/redis` `TaskManager` instead of the per-process in-memory one. This
makes A2A task state (status/history/artifacts) visible across replicas, so external A2A
clients doing non-blocking `tasks/get` / `tasks/resubscribe` or `message/stream` re-attach
work regardless of which pod serves the follow-up. The backend is chosen in
[`server.go`](server.go) `buildTaskManager` from the `REDIS_URL`/`REDIS_PASSWORD`/
`REDIS_TASK_EXPIRY_SECONDS` env; empty `REDIS_URL` keeps the in-memory manager (correct for
single-pod installs). Use a dedicated Redis logical DB to isolate keys from other Ark
services. `Service.sessionAffinity: ClientIP` (chart `service.sessionAffinity`) is available
as a best-effort routing optimization but is not required for correctness once Redis is on.

### Graceful shutdown

On SIGTERM the server flips its readiness probe (`/ready`) to failing so the pod leaves
Service endpoints before draining, then `http.Server.Shutdown` waits for in-flight requests
bounded by `--shutdown-timeout`. Each request's context is merged with the server lifetime
(`Handler.baseCtx`), so a long-lived stream still running when the drain deadline passes is
cancelled and runs its `finalizeStream` path — closing the stream cleanly — instead of being
severed on process exit. Liveness stays on `/health`; readiness is a separate `/ready`.

## Dependencies

Imports from shared packages:
- `internal/a2a/` — A2A protocol types and client creation
- `internal/mcp/` — MCP client and settings
- `internal/resolution/` — Header value resolution from Secrets/ConfigMaps
- `internal/telemetry/`, `internal/eventing/` — Observability
- `api/v1alpha1/` — CRD types
