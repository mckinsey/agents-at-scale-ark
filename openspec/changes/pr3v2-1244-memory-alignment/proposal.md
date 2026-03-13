## Why

The memory interface contracts use OpenAI message unions as their storage type. This ties state persistence to provider-specific message shape and loses DataPart and extension metadata during storage.

## What Changes

- Convert `MemoryInterface` contracts (`AddMessages`, `GetMessages`) to `[]ProtocolMessage`.
- Update HTTP memory implementation to convert at the HTTP transport boundary only.
- Update noop memory implementation to match the new interface.
- Handler memory load/save paths use protocol messages directly.

## Capabilities

### New Capabilities
- `protocol-native-memory`: Memory interface stores and retrieves protocol-native messages preserving DataParts and extension metadata.

### Modified Capabilities

## Impact

- `ark/executors/completions/memory.go`
- `ark/executors/completions/memory_http.go`
- `ark/executors/completions/memory_noop.go`
- `ark/executors/completions/memory_http_test.go`
- `ark/executors/completions/handler.go`
