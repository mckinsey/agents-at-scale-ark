## Why

`MemoryInterface.AddMessages` and `GetMessages` operate on `[]Message` (OpenAI-typed). The HTTP memory implementation serializes these to JSON for wire transport and deserializes on return. Since the wire format is already JSON, the memory service does not inherently require OpenAI types — it stores and retrieves message blobs. Protocol-typed methods allow engines to store and retrieve A2A messages without type coupling.

## What Changes

- Add `AddProtocolMessages(ctx, queryID string, messages []protocol.Message) error` to `MemoryInterface`
- Add `GetProtocolMessages(ctx) ([]protocol.Message, error)` to `MemoryInterface`
- Implement these methods in `memory_http.go` with conversion at the HTTP boundary (serialize protocol messages to the existing wire format for storage, deserialize on retrieval)
- Implement these methods in `memory_noop.go` as no-ops
- Add adapter methods that allow existing `AddMessages`/`GetMessages` callers to work unchanged
- Define required-lossless conversion semantics for role, DataParts, and extension-scoped attribution
- Apply native-first extension scope: history behavior remains on core A2A task/message semantics; no dedicated history extension for current scope
- Preserve minimum extension inventory semantics (`query/v1`, `team-attribution/v1`) where present across memory boundaries

## Non-goals

- Changing the memory service's storage format or API
- Removing `AddMessages` / `GetMessages` from the interface
- Modifying the postgres-memory service

## Compatibility Contract

- Existing `AddMessages` / `GetMessages` continue to work unchanged on all implementations
- Protocol-typed methods serialize to the same wire format as the existing methods
- Messages stored via `AddProtocolMessages` are retrievable via `GetMessages` (and vice versa), enabling mixed callers
- The memory service API (HTTP endpoints, request/response schemas) is unchanged
- Mixed deployments with engines using either method set are fully supported
- Conversion matrix documents required-lossless versus compatibility-only lossy mappings
- Missing extension declaration evidence is surfaced via `soft_fail_warn` telemetry in compatibility governance paths

## Impact

- `ark/executors/completions/memory.go` (interface extension)
- `ark/executors/completions/memory_http.go` (protocol method implementation)
- `ark/executors/completions/memory_noop.go` (no-op implementation)
