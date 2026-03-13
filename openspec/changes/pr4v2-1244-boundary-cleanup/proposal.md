## Why

After protocol-native loops and memory alignment, the handler and controller still contain OpenAI-shaped helpers, execution state types, and legacy serialization paths. These need cleanup before the legacy metadata path can be removed.

## What Changes

- Convert handler execution state and dispatch paths to protocol-native message arrays throughout.
- Remove OpenAI-only message helpers that are replaced by adapter layer functions.
- Streaming path maps ProtocolMessages to A2A events.
- Controller success serialization uses protocol-native extraction exclusively (legacy `messages` read path retained for backward compatibility but no longer primary).

## Prerequisites

- PR-A merged: extension helpers (`SetExtension`, `SetMetadata`, `GetExtension`, `GetMetadata`, `HasExtension`) used throughout handler and controller for all metadata operations.
- PR1-v2 through PR3-v2 merged: protocol-native adapter, loops, and memory.
- All extension attachment and retrieval must use PR-A helpers -- no inline `Message.Metadata[key]` or `Message.Extensions = append(...)` patterns.

## Capabilities

### New Capabilities
- `handler-controller-cleanup`: Handler and controller orchestration state is fully protocol-native with OpenAI conversion only at provider and serialization boundaries.

### Modified Capabilities

## Impact

- `ark/executors/completions/handler.go`
- `ark/executors/completions/message_helpers.go`
- `ark/internal/controller/query_controller.go`
- `ark/internal/controller/query_controller_test.go`
