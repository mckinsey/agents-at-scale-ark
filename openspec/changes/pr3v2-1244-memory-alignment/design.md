# PR3-v2 Memory Alignment Design

## Decision

Use protocol messages for memory interface contracts. Convert to OpenAI only at the HTTP transport boundary for backward compatibility with the postgres-memory service wire format.

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

## Handler Integration

Handler `executionState` stores `inputMessages` and `memoryMessages` as `[]ProtocolMessage`. Memory load/save paths use protocol types directly without intermediate conversion.

## Noop Memory

Noop implementation stores `[]ProtocolMessage` in-memory (no conversion needed).
