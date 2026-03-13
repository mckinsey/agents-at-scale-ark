## Why

After protocol-native execution is validated end-to-end, the legacy `ArkMetadataKey` write path and OpenAI-shaped `messages` field are dead code that increases surface area and maintenance burden.

## What Changes

- Remove `arka2a.SetMetadata(&msg, arka2a.ArkMetadataKey, ...)` calls from handler `buildA2AResponse()` and controller `executeViaEngine()`.
- Remove `arka2a.GetMetadata(msg, arka2a.ArkMetadataKey)` fallback from `extractArkMetadata()` and `extractEngineResponseMeta()`.
- Remove legacy `Messages any` field from `ExecutionResponsePayload`.
- Remove or deprecate `ArkMetadataKey` constant from `a2a_types.go`.
- The generic `SetMetadata` and `GetMetadata` helpers in `ark/internal/a2a/extensions.go` are retained -- they serve non-extension metadata needs. Only the specific `ArkMetadataKey` usage is removed.
- **BREAKING**: Engines that only write `ArkMetadataKey` will no longer be read by the controller.

## Prerequisites

- PR-A through PR4-v2 merged: all runtime code uses `SetExtension`/`GetExtension` for the primary path and `SetMetadata`/`GetMetadata` only for the `ArkMetadataKey` legacy fallback.
- Engine conformance: all registered execution engines write `responseMessagesV1` under `ExecutionContextExtensionURI`.
- Dashboard parity: dashboard chat rendering produces identical output when consuming `response.raw` derived from protocol-native messages vs legacy OpenAI-shaped messages.

## Capabilities

### New Capabilities

### Modified Capabilities
- `a2a-boundary-contract`: Legacy fallback paths are removed; `ExecutionContextExtensionURI` via `SetExtension`/`GetExtension` is the only supported metadata path.

## Impact

- `ark/internal/a2a/a2a_types.go`
- `ark/executors/completions/handler.go`
- `ark/internal/controller/query_controller.go`
- `ark/internal/controller/query_controller_test.go`
