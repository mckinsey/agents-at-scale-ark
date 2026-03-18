## Why

The current streaming path uses `ChunkWithMetadata` which wraps `openai.ChatCompletionChunk`. The controller must understand this OpenAI-specific shape to process stream events. For the controller to be engine-agnostic, the stream contract needs a protocol-native event type that carries A2A content without requiring OpenAI type knowledge.

## What Changes

- Define `ProtocolStreamEvent` — a protocol-native streaming event type that carries A2A content parts, metadata, and status signals
- Update `streamContentChunk` and related functions in `a2a_execution.go` to emit `ProtocolStreamEvent` alongside `ChunkWithMetadata`
- Add a stream adapter in the handler that converts `ChunkWithMetadata` to `ProtocolStreamEvent` at the engine boundary
- Update the controller's stream consumer to accept `ProtocolStreamEvent` when available, falling back to `ChunkWithMetadata` for backward compatibility
- Add deterministic pair correlation metadata for dual-emitted legacy/protocol events
- Keep stream semantics native-first: no stream-specific extension is introduced unless parity gaps cannot be expressed with protocol events + existing attribution extension
- Require parity checks to validate extension-scoped attribution semantics across paired events

## Non-goals

- Removing `ChunkWithMetadata` (still required for legacy consumers and A2A execution's internal use)
- Changing the SSE wire format between executor and controller
- Implementing full bidirectional streaming

## Compatibility Contract

- `ChunkWithMetadata` continues to be emitted for existing consumers
- `ProtocolStreamEvent` is emitted in parallel as an additional stream type
- Controllers that do not understand `ProtocolStreamEvent` continue to work with `ChunkWithMetadata`
- The SSE wire format is extended (new event type), not modified
- Mixed deployments with older controllers or executors are unaffected
- Event pairs can be validated one-to-one without relying on timing alone
- Missing attribution extension declaration is surfaced as telemetry while stream processing continues in compatibility mode

## Impact

- `ark/executors/completions/streaming.go` (new `ProtocolStreamEvent` type)
- `ark/executors/completions/a2a_execution.go` (dual-emit logic)
- `ark/executors/completions/handler.go` (stream adapter at engine boundary)
- `ark/internal/controller/query_controller.go` (stream consumer update)
