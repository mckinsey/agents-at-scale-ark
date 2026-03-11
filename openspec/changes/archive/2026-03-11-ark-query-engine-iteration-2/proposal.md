## Why

Phase 1 of the query engine extraction introduced several bugs and gaps found during integration testing. The engine streams chunks to ark-broker but never closes the connection, while the controller opens a second stream for finalization — causing the dashboard to lose previous messages. Telemetry spans are disconnected between controller and engine. Token usage and conversation IDs are not propagated back. DevSpace dev mode runs both processes in one container, preventing independent restarts.

## What Changes

- Fix streaming: engine owns full EventStream lifecycle (create, stream, finalize, close). Remove controller's stream finalization.
- Move OTEL telemetry for query execution entirely to the engine. Remove telemetry recorder calls from controller's `executeQueryAsync`.
- Engine returns token usage and conversation ID in A2A response metadata so controller can write them to Query CR status.
- DevSpace dev mode deploys engine as a separate pod with its own sync and restart, instead of double `go run` in one container.
- Engine handles `tool` target type (already partially implemented, needs stream cleanup).

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

- `ark/internal/queryengine/handler.go` — add stream finalization, token usage and conversationId in response metadata
- `ark/internal/controller/query_controller.go` — remove stream finalization and telemetry recorder calls, read token usage and conversationId from A2A response
- `ark/devspace.yaml` — separate pod for query engine with independent sync
- `ark/internal/genai/execution_result.go` — may need token usage field or engine returns it via A2A metadata
