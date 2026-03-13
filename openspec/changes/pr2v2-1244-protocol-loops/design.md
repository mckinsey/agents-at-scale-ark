# PR2-v2 Protocol Loops Design

## Decision

Use protocol messages as the canonical in-memory format for agent/team orchestration. OpenAI unions exist only at the model provider boundary, managed by the PR1-v2 adapter layer.

## Prerequisites

PR-A provides:
- `arka2a.SetExtension(m, uri, payload)` for spec-compliant extension assignment (adds to both `Message.Extensions` and `Message.Metadata`)
- `arka2a.GetExtensionAs[T](m, uri)` for typed extension retrieval
- `arka2a.HasExtension(m, uri)` to check if a message declares an extension
- `ExecutionTraceExtensionURI` for attribution metadata

PR1-v2 provides:
- `ProtocolMessagesFromOpenAI()` / `OpenAIMessagesFromProtocol()` for boundary conversion

## TeamMember Interface Change

```go
type TeamMember interface {
    Execute(ctx context.Context, userInput ProtocolMessage, history []ProtocolMessage, memory MemoryInterface, eventStream EventStreamInterface) (*ExecutionResult, error)
    GetName() string
    GetType() string
    GetDescription() string
}
```

`ExecutionResult.Messages` type changes from `[]Message` to `[]ProtocolMessage`.

## Agent Execution Flow

1. Agent receives `ProtocolMessage` input and `[]ProtocolMessage` history.
2. Convert to OpenAI using `OpenAIMessagesFromProtocol()` at the model call boundary.
3. Model returns OpenAI messages.
4. Convert back to protocol using `ProtocolMessagesFromOpenAI()`.
5. Attach execution-trace extension using `arka2a.SetExtension(&msg, arka2a.ExecutionTraceExtensionURI, tracePayload)` -- this ensures the trace URI appears in `msg.Extensions` per A2A spec Section 4.6.2.
6. Return `[]ProtocolMessage`.

## Team History Accumulation

Teams accumulate `[]ProtocolMessage` from member execution. Each message carries attribution via `ExecutionTraceExtensionURI` metadata, readable with `arka2a.GetExtensionAs`. The selector reads this metadata for prompt history labels, using `arka2a.HasExtension` to check availability before extraction.

## Execution Engine Client

The execution engine client (`execution_engine.go`) sends protocol-native history in the execution context payload. `ExecutionEngineMessage` is removed; history is `[]protocol.Message` directly.
