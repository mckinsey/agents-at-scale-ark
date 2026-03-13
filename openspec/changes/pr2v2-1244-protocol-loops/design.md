# PR2-v2 Protocol Loops Design

## Decision

Use protocol messages as the canonical in-memory format for agent/team orchestration. OpenAI unions exist only at the model provider boundary, managed by the PR1-v2 adapter layer.

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
5. Attach execution-trace extension metadata (agent name, step type) to each output message.
6. Return `[]ProtocolMessage`.

## Team History Accumulation

Teams accumulate `[]ProtocolMessage` from member execution. Each message carries attribution via `ExecutionTraceExtensionURI` metadata. The selector reads this metadata for prompt history labels.

## Execution Engine Client

The execution engine client (`execution_engine.go`) sends protocol-native history in the execution context payload. `ExecutionEngineMessage` is removed; history is `[]protocol.Message` directly.
