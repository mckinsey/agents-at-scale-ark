# PR3-v2 Memory Alignment Design

## Decision

Use protocol messages for memory interface contracts. Convert to OpenAI only at the HTTP transport boundary for backward compatibility with the postgres-memory service wire format.

## Prerequisites

PR-A provides:
- Extension data attached via `SetExtension` is stored in `Message.Metadata` keyed by URI, and `Message.Extensions` lists the URI. Both fields are standard `protocol.Message` fields that serialize to JSON naturally.
- Non-extension metadata attached via `SetMetadata` is stored in `Message.Metadata` without `Extensions` declaration.
- When protocol messages round-trip through JSON (as in memory storage), extension and metadata fields are preserved without special handling.

PR1-v2/PR2-v2 provide:
- `ProtocolMessagesFromOpenAI()` / `OpenAIMessagesFromProtocol()` for boundary conversion.
- All execution output as `[]ProtocolMessage` with extension attribution.

## Interface Change

```go
type MemoryInterface interface {
    AddMessages(ctx context.Context, queryName string, messages []ProtocolMessage) error
    GetMessages(ctx context.Context, queryName string) ([]ProtocolMessage, error)
}
```

## Memory Flow

- **Add messages**: `[]ProtocolMessage` -> `OpenAIMessagesFromProtocol()` -> HTTP JSON payload.
- **Get messages**: HTTP JSON payload -> OpenAI decode -> `ProtocolMessagesFromOpenAI()` -> `[]ProtocolMessage`.

Extension metadata is lost during OpenAI conversion (expected). The HTTP memory service stores the provider-compatible shape. Extension metadata lives in the execution response, not in memory replay.

## Handler Integration

Handler `executionState` stores `inputMessages` and `memoryMessages` as `[]ProtocolMessage`. Memory load/save paths use protocol types directly without intermediate conversion.

## Noop Memory

Noop implementation stores `[]ProtocolMessage` in-memory (no conversion needed).
