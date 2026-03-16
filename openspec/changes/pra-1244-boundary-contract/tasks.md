# PR-A Boundary Contract Tasks

## 1. Generic extension helpers

- [x] 1.1 Create `ark/internal/a2a/extensions.go` with `SetExtension`, `SetMetadata`, `GetExtension`, `GetExtensionAs[T]`, `HasExtension`, `GetMetadata`.
- [x] 1.2 Add typed wrappers `SetExecutionContextExtension` and `GetExecutionContextExtension`.
- [x] 1.3 Create `ark/internal/a2a/extensions_test.go` with unit tests for all generic and typed helpers.

## 2. DataPart helpers

- [x] 2.1 Add `ExtractDataParts(parts)` to extract DataParts from mixed Part slices.
- [x] 2.2 Add `DataPartType(dp)`, `DataPartField(dp, key)`, `DataPartMap(dp, key)` for inspecting DataPart payloads.
- [x] 2.3 Unit tests for all DataPart helpers.

## 3. Extension types and constants

- [x] 3.1 Add `ExecutionContextExtensionURI` constant to `ark/internal/a2a/a2a_types.go`.
- [x] 3.2 Add `ExecutionTraceExtensionURI` constant.
- [x] 3.3 Add `ExecutionResponsePayload` struct with `ResponseMessagesV1 json.RawMessage` field.
- [x] 3.4 Add `ResponseTokenUsage` struct.

## 4. Handler response path

- [x] 4.1 Refactor `buildA2AResponse()` to use `SetExecutionContextExtension` for spec-compliant extension.
- [x] 4.2 Refactor `buildA2AResponse()` to use `SetMetadata` for legacy `ArkMetadataKey` (not added to `extensions`).
- [x] 4.3 Serialize `[]protocol.Message` into `responseMessagesV1` under `ExecutionContextExtensionURI` metadata key.
- [x] 4.4 Keep legacy `ArkMetadataKey` metadata with OpenAI-shaped `messages` for backward compatibility.

## 5. Full-fidelity protocol conversion

- [x] 5.1 Rewrite `openAIToProtocolResponseMessages()` to use DataParts for tool calls (`tool_call` type with ID, function name, arguments).
- [x] 5.2 Map `OfTool` messages to DataParts with `tool_result` type preserving `tool_call_id`.
- [x] 5.3 Map `OfSystem` messages to DataParts with `system` type (no longer dropped).
- [x] 5.4 Map `OfFunction` messages to DataParts with `function_result` type preserving function name.
- [x] 5.5 Unit tests for all message type conversions including mixed sequences.

## 6. Handler extraction path

- [x] 6.1 Refactor `extractArkMetadata()` to use `GetExtension(msg, ExecutionContextExtensionURI)` first, fall back to `GetMetadata(msg, ArkMetadataKey)`.

## 7. Controller request path

- [x] 7.1 Refactor `executeViaEngine()` to use `SetExtension(msg, ExecutionContextExtensionURI, arkMetadata)`.
- [x] 7.2 Refactor `executeViaEngine()` to use `SetMetadata(msg, ArkMetadataKey, arkMetadata)` for legacy compat.

## 8. Controller response path independence

- [x] 8.1 Refactor `extractEngineResponseMeta()` with `extractArkPayloadMap` merging both metadata keys.
- [x] 8.2 Rewrite `extractResponseMessages()` to pass through `messages` as opaque bytes for `response.raw`, track `responseMessagesV1` presence via `ProtocolNative` flag.
- [x] 8.3 Remove `protocolMessagesToRawJSON()` and all 6 compat helpers from controller — reconstruction was wrong-direction coupling.
- [x] 8.4 Replace `serializeMessages` with `buildFallbackRaw` — no `completions.Message` type dependency.
- [x] 8.5 Remove `openai` and `completions` imports from controller test serialization tests.

## 9. Verification

- [x] 9.1 Unit tests for extension helpers covering dedup, metadata-only writes, typed round-trips, and `HasExtension` distinction.
- [x] 9.2 Unit tests for DataPart helpers covering extraction, type inspection, field access, map access.
- [x] 9.3 Unit tests for `openAIToProtocolResponseMessages()` covering all message types and mixed sequences.
- [x] 9.4 Unit tests for `extractEngineResponseMeta()` covering pass-through behavior, metadata merge, and protocol presence tracking.
- [x] 9.5 Unit tests for `buildFallbackRaw()` covering valid JSON output without OpenAI types.
- [x] 9.6 Compile `ark/internal/a2a`, `ark/executors/completions`, and `ark/internal/controller` packages.
- [x] 9.7 Run existing controller and completions tests to verify no regressions.
- [x] 9.8 Zero lint issues (`make lint`).
