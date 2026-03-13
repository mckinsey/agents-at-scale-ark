# PR4-v2 Boundary Cleanup Design

## Decision

After PR1-v2 through PR3-v2, handler and controller internals are protocol-native. This PR removes residual OpenAI-shaped helpers and makes the protocol-native path the primary code path.

## Prerequisites

PR-A provides:
- `arka2a.SetExecutionContextExtension(&msg, payload)` for typed extension assignment (wraps `SetExtension`)
- `arka2a.SetMetadata(&msg, key, value)` for legacy `ArkMetadataKey` (metadata-only, not in `Message.Extensions`)
- `arka2a.GetExtension(msg, uri)` / `arka2a.GetMetadata(msg, key)` for retrieval with correct semantics
- `arka2a.HasExtension(msg, uri)` to check `Message.Extensions` before attempting extraction

All handler and controller code must use these helpers exclusively. Direct `Message.Metadata` or `Message.Extensions` manipulation is prohibited after this PR.

## Handler Changes

- `executionState.inputMessages` and `memoryMessages` are already `[]ProtocolMessage` (from PR2-v2/PR3-v2).
- Remove `PrepareExecutionMessages` (OpenAI version), `PrepareModelMessages`, `PrepareNewMessagesForMemory`, `ExtractLastAssistantMessageContent`, `ExtractUserMessageContent` -- all replaced by protocol equivalents.
- `buildA2AResponse()` takes `[]ProtocolMessage` directly (no more `[]Message` overload).
- `buildA2AResponse()` uses `arka2a.SetExecutionContextExtension` and `arka2a.SetMetadata` (already in place from PR-A).
- `serializeResponseMessages([]Message)` removed; `serializeProtocolResponseMessages` becomes the only path.

## Controller Changes

- `extractEngineResponseMeta()` uses `arka2a.GetExtension` then `arka2a.GetMetadata` fallback (already in place from PR-A). Legacy `messages` fallback retained but marked for removal in PR-C.
- `serializeMessages()` converts protocol messages to `response.raw` compatible JSON using the protocol-to-raw helper.

## Streaming Changes

- `finalizeStream()` takes `[]ProtocolMessage` and extracts content via `ProtocolMessageText()`.
- Stream chunk construction uses protocol message content directly.
