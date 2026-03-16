## Why

The handler/controller boundary serializes response messages as OpenAI-shaped JSON in A2A metadata. Non-OpenAI execution engines must emulate OpenAI union shape to participate, blocking mixed-engine execution. The `ArkMetadataKey` is used without `Message.Extensions`, violating A2A extension semantics (Section 4.6.2). Extension handling is hardcoded inline with no reusable API, preventing Ark from supporting multiple extensions (its own or third-party).

## What Changes

- Add generic multi-extension helpers (`SetExtension`, `SetMetadata`, `GetExtension`, `GetExtensionAs[T]`, `HasExtension`, `GetMetadata`) in `ark/internal/a2a/extensions.go` implementing A2A spec Section 4.6.2.
- Add DataPart extraction helpers (`ExtractDataParts`, `DataPartType`, `DataPartField`, `DataPartMap`) for consuming structured protocol data.
- Add typed wrappers (`SetExecutionContextExtension`, `GetExecutionContextExtension`) for Ark's execution-context extension.
- Add `ExecutionContextExtensionURI` and `ExecutionTraceExtensionURI` constants with versioned URIs per spec Section 4.6.3.
- Add `ExecutionResponsePayload` and `ResponseTokenUsage` types.
- Refactor handler `buildA2AResponse()` to use `SetExecutionContextExtension` for the spec-compliant extension and `SetMetadata` for legacy `ArkMetadataKey`.
- Refactor handler `extractArkMetadata()` to use `GetExtension` with `GetMetadata` fallback.
- Rewrite handler `openAIToProtocolResponseMessages()` to produce full-fidelity `protocol.Message` with DataParts for tool calls, tool results, system messages, and function messages.
- Refactor controller `executeViaEngine()` to use `SetExtension` and `SetMetadata`.
- Refactor controller `extractEngineResponseMeta()` with `extractArkPayloadMap` merging both metadata keys (legacy base, extension overlay).
- Remove `protocolMessagesToRawJSON()` and all OpenAI compat helpers from controller — reconstruction was wrong-direction coupling.
- Controller `extractResponseMessages()` passes through executor-produced `messages` as opaque bytes for `response.raw`, tracks `responseMessagesV1` presence via `ProtocolNative` flag.
- Replace `serializeMessages` with `buildFallbackRaw` — no `completions.Message` type dependency on response path.
- Handler populates protocol-native `responseMessagesV1` alongside legacy `messages`. Controller passes through legacy path opaquely.

## Capabilities

### New Capabilities
- `a2a-multi-extension-support`: Generic, spec-compliant extension API enabling Ark to support many A2A extensions (its own and third-party) via `SetExtension`/`GetExtension`.
- `a2a-boundary-contract`: Full-fidelity protocol-native response payload at the handler/controller A2A boundary. DataParts preserve tool call structure, system messages, and function results. Controller passes through executor-produced content for `response.raw` with zero OpenAI coupling.
- `a2a-datapart-helpers`: Reusable helpers for extracting and inspecting DataParts from protocol messages.

### Modified Capabilities

## Impact

- `ark/internal/a2a/extensions.go` (new)
- `ark/internal/a2a/extensions_test.go` (new)
- `ark/internal/a2a/a2a_types.go`
- `ark/executors/completions/handler.go`
- `ark/internal/controller/query_controller.go`
- `ark/internal/controller/query_controller_test.go`
