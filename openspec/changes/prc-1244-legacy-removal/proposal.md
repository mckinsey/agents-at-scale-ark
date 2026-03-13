## Why

After protocol-native execution is validated end-to-end, the legacy `ArkMetadataKey` write path and OpenAI-shaped `messages` field are dead code that increases surface area and maintenance burden.

## What Changes

- Remove `ArkMetadataKey` dual-write from handler `buildA2AResponse()`.
- Remove `ArkMetadataKey` dual-write from controller `executeViaEngine()`.
- Remove legacy `messages` field from `ExecutionResponsePayload`.
- Remove `ArkMetadataKey` fallback from `extractArkMetadata()` and `extractEngineResponseMeta()`.
- **BREAKING**: Engines that only write `ArkMetadataKey` will no longer be read by the controller.

## Capabilities

### New Capabilities

### Modified Capabilities
- `a2a-boundary-contract`: Legacy fallback paths are removed; `ExecutionContextExtensionURI` is the only supported metadata key.

## Impact

- `ark/internal/a2a/a2a.go`
- `ark/internal/a2a/a2a_types.go`
- `ark/executors/completions/handler.go`
- `ark/internal/controller/query_controller.go`
- `ark/internal/controller/query_controller_test.go`
