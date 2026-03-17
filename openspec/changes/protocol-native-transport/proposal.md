## Why

The completions execution engine uses `completions.Message` (alias for `openai.ChatCompletionMessageParamUnion`) as its internal transport. This type flows through agent execution, team orchestration, memory persistence, streaming, and handler response building. The controller has already been decoupled (#1396 input path, #1379 response path), but everything inside the engine boundary still operates on OpenAI shapes.

Non-OpenAI execution engines must emulate OpenAI union shapes to participate. Internal components that should be engine-agnostic are locked to one provider's type system.

## What Changes

Migrate internal transport to `protocol.Message` through independently mergeable steps:

- Normalize query input API to engine-neutral accessors alongside existing OpenAI-typed ones
- Split streaming contract into protocol-native events with compatibility adapter for legacy consumers
- Convert agent/team execution interfaces to protocol-typed signatures with adapter fallback
- Migrate memory interface to protocol messages with conversion at HTTP wire boundary
- Invert handler boundary to accept protocol messages directly, deriving legacy format for backward compatibility
- Establish compatibility lifecycle governance for all adapters introduced during migration

Each step adds new protocol-native paths alongside existing ones. Legacy paths are maintained as long-lived compatibility code, not temporary scaffolding.

## Non-goals

- Changing the A2A extension schema or QueryRef contract
- Modifying controller dispatch or address resolution (already A2A-native)
- Adopting gRPC, protobuf, or alternative wire formats
- Removing legacy compatibility paths (tracked separately as future retirement gates)
- Changes to dashboard, CLI, or external consumer APIs

## Compatibility Contract

Every step introduces adapters that bridge protocol-native and legacy paths. These adapters are maintained as first-class code:

- Legacy paths receive parity and safety fixes only; new features target protocol-native paths
- Mixed-deployment support (new controller + old engine, old controller + new engine) is a hard requirement
- Retirement of any adapter requires adoption evidence and is proposed as a standalone work item

## Impact

- `ark/executors/completions/types.go` — `Message` type alias
- `ark/executors/completions/agent.go` — execution interfaces
- `ark/executors/completions/team.go`, `team_graph.go`, `team_selector.go` — team orchestration
- `ark/executors/completions/memory.go`, `memory_http.go`, `memory_noop.go` — memory contracts
- `ark/executors/completions/streaming.go`, `a2a_execution.go` — streaming envelope
- `ark/executors/completions/handler.go` — response boundary
- `ark/executors/completions/message_helpers.go` — query input types
