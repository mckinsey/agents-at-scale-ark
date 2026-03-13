# PR4-v2 Boundary Cleanup Design

## Decision

After PR1-v2 through PR3-v2, handler and controller internals are protocol-native. This PR removes residual OpenAI-shaped helpers and makes the protocol-native path the primary code path.

## Handler Changes

- `executionState.inputMessages` and `memoryMessages` are already `[]ProtocolMessage` (from PR2-v2/PR3-v2).
- Remove `PrepareExecutionMessages` (OpenAI version), `PrepareModelMessages`, `PrepareNewMessagesForMemory`, `ExtractLastAssistantMessageContent`, `ExtractUserMessageContent` — all replaced by protocol equivalents.
- `buildA2AResponse()` takes `[]ProtocolMessage` directly (no more `[]Message` overload).
- `serializeResponseMessages([]Message)` removed; `serializeProtocolResponseMessages` becomes the only path.

## Controller Changes

- `extractEngineResponseMeta()` prefers `responseMessagesV1` (already in place from PR-A). Legacy `messages` fallback retained but marked for removal in PR-C.
- `serializeMessages()` converts protocol messages to `response.raw` compatible JSON using the protocol-to-raw helper from PR-A.

## Streaming Changes

- `finalizeStream()` takes `[]ProtocolMessage` and extracts content via `ProtocolMessageText()`.
- Stream chunk construction uses protocol message content directly.
