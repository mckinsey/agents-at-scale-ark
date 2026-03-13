## Why

The handler/controller boundary serializes response messages as OpenAI-shaped JSON in A2A metadata. Non-OpenAI execution engines must emulate OpenAI union shape to participate, blocking mixed-engine execution. The `ArkMetadataKey` is used without `Message.Extensions`, violating A2A extension semantics.

## What Changes

- Add `ExecutionContextExtensionURI` constant and versioned response payload types to `ark/internal/a2a/a2a_types.go`.
- Handler `buildA2AResponse()` populates a protocol-native `responseMessagesV1` field alongside legacy `messages`, declares the extension URI in `Message.Extensions`.
- Handler `extractArkMetadata()` reads from the extension URI key first, falls back to `ArkMetadataKey`.
- Controller `executeViaEngine()` declares the extension URI in outbound `Message.Extensions`.
- Controller `extractEngineResponseMeta()` uses three-tier extraction: protocol-native field first, legacy `messages` second, assistant-text fallback third.
- Controller converts protocol-native messages to `response.raw` compatible JSON for downstream consumers.

## Capabilities

### New Capabilities
- `a2a-boundary-contract`: Versioned protocol-native response payload at the handler/controller A2A boundary with staged fallback for legacy consumers.

### Modified Capabilities

## Impact

- `ark/internal/a2a/a2a_types.go`
- `ark/executors/completions/handler.go`
- `ark/internal/controller/query_controller.go`
- `ark/internal/controller/query_controller_test.go`
