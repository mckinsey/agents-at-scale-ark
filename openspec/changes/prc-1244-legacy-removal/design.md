# PR-C Legacy Removal Design

## Decision

Remove the legacy `ArkMetadataKey` write and read paths after confirming all engines use `ExecutionContextExtensionURI`.

## Prerequisites

This PR is gated on:
1. Engine conformance: all registered execution engines write `responseMessagesV1` under `ExecutionContextExtensionURI`.
2. Dashboard parity: dashboard chat rendering produces identical output when consuming `response.raw` derived from protocol-native messages vs legacy OpenAI-shaped messages.

## Handler Changes

- `buildA2AResponse()`: Remove `ArkMetadataKey` from `Message.Metadata`. Only write `ExecutionContextExtensionURI`.
- `extractArkMetadata()`: Remove `ArkMetadataKey` fallback. Return error if `ExecutionContextExtensionURI` is missing.

## Controller Changes

- `executeViaEngine()`: Remove `ArkMetadataKey` from outbound `Message.Metadata`.
- `extractEngineResponseMeta()`: Remove `ArkMetadataKey` fallback.

## Type Changes

- Remove `Messages any` field from `ExecutionResponsePayload` (only `ResponseMessagesV1` remains).
- Mark `ArkMetadataKey` constant as deprecated or remove entirely.
