## Why

The controller's `executeDirectly` path for ExecutionEngine agents (A2A, named engines) passes `nil` for the event stream. This means no streaming chunks reach ark-broker, so the dashboard renders nothing until it polls the final query status. On main, the controller created an event stream and passed it to agent execution, enabling real-time streaming to the dashboard.

## What Changes

- Create an event stream in `executeDirectly` using `NewEventStreamForQuery`
- Pass the event stream to `agent.Execute` so A2A streaming works
- After execution, send a final chunk with the completed query and close the stream
- Match main's `finalizeEventStream` behavior for the direct execution path

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

- `ark/internal/controller/query_controller.go` — `executeDirectly` function
