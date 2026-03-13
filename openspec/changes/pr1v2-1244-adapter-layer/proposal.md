## Why

There is no bidirectional conversion layer between `protocol.Message` and OpenAI `ChatCompletionMessageParamUnion`. Each component does ad-hoc conversion, producing inconsistent behavior and duplicated logic.

## What Changes

- Introduce a dedicated adapter module with bidirectional conversion: OpenAI -> ProtocolMessage (after LLM call) and ProtocolMessage -> OpenAI (before LLM call).
- Each OpenAI message type (assistant, tool, system, user) maps to its own `protocol.Message` with appropriate Parts (TextPart for content, DataPart for tool call structure).
- Define DataPart schemas for tool calls and tool results.
- Tests for round-trip fidelity and sequence preservation.

## Prerequisites

- PR-A merged: generic extension helpers (`SetExtension`, `GetExtension`, `SetMetadata`, `GetMetadata`) and extension URI constants available in `ark/internal/a2a/`.
- The adapter uses `arka2a.SetExtension` when attaching execution-context metadata during conversion, ensuring converted messages are spec-compliant from creation.

## Capabilities

### New Capabilities
- `protocol-openai-adapter`: Bidirectional conversion between A2A protocol messages and OpenAI message unions with DataPart schemas for tool structures.

### Modified Capabilities

## Impact

- `ark/executors/completions/protocol_messages.go` (new)
- `ark/executors/completions/protocol_messages_test.go` (new)
- `ark/executors/completions/types.go`
