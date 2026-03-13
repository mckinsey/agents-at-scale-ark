# PR-C Legacy Removal Design

## Decision

Remove the legacy `ArkMetadataKey` write and read paths after confirming all engines use `ExecutionContextExtensionURI`.

## Prerequisites

This PR is gated on:
1. Engine conformance: all registered execution engines write `responseMessagesV1` under `ExecutionContextExtensionURI`.
2. Dashboard parity: dashboard chat rendering produces identical output when consuming `response.raw` derived from protocol-native messages vs legacy OpenAI-shaped messages.

PR-A established:
- `SetExtension` / `GetExtension` for spec-compliant extensions (URI in both `Message.Extensions` and `Message.Metadata`)
- `SetMetadata` / `GetMetadata` for non-extension metadata (key in `Message.Metadata` only, NOT in `Message.Extensions`)
- `ArkMetadataKey` uses `SetMetadata` (correctly not declared as an extension)

This PR removes all `ArkMetadataKey` usage of `SetMetadata`/`GetMetadata`. The generic helpers themselves remain for future non-extension metadata needs.

## Handler Changes

- `buildA2AResponse()`: Remove `arka2a.SetMetadata(&msg, arka2a.ArkMetadataKey, legacyMeta)`. Only `arka2a.SetExecutionContextExtension(&msg, payload)` remains.
- `extractArkMetadata()`: Remove `arka2a.GetMetadata(msg, arka2a.ArkMetadataKey)` fallback. Return error if `arka2a.GetExtension(msg, arka2a.ExecutionContextExtensionURI)` is missing.

## Controller Changes

- `executeViaEngine()`: Remove `arka2a.SetMetadata(&msg, arka2a.ArkMetadataKey, arkMetadata)`.
- `extractEngineResponseMeta()`: Remove `arka2a.GetMetadata(*msg, arka2a.ArkMetadataKey)` fallback.

## Type Changes

- Remove `Messages any` field from `ExecutionResponsePayload` (only `ResponseMessagesV1` remains).
- Remove `ArkMetadataKey` constant from `a2a_types.go`.
