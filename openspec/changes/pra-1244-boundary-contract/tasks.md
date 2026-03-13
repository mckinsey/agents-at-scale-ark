# PR-A Boundary Contract Tasks

## 1. Extension types and constants

- [ ] 1.1 Add `ExecutionContextExtensionURI` constant to `ark/internal/a2a/a2a_types.go`.
- [ ] 1.2 Add `ExecutionResponsePayload` struct with `ResponseMessagesV1 json.RawMessage` field.
- [ ] 1.3 Add `ResponseTokenUsage` struct.

## 2. Handler response path

- [ ] 2.1 Update `buildA2AResponse()` to set `Message.Extensions` with `ExecutionContextExtensionURI`.
- [ ] 2.2 Update `buildA2AResponse()` to serialize `[]protocol.Message` into `responseMessagesV1` under `ExecutionContextExtensionURI` metadata key.
- [ ] 2.3 Keep legacy `ArkMetadataKey` metadata with OpenAI-shaped `messages` for backward compatibility.

## 3. Handler extraction path

- [ ] 3.1 Update `extractArkMetadata()` to check `ExecutionContextExtensionURI` first, fall back to `ArkMetadataKey`.

## 4. Controller request path

- [ ] 4.1 Update `executeViaEngine()` to set `Message.Extensions` with `ExecutionContextExtensionURI`.
- [ ] 4.2 Write execution payload under `ExecutionContextExtensionURI` key alongside `ArkMetadataKey`.

## 5. Controller extraction path

- [ ] 5.1 Update `extractEngineResponseMeta()` to check `ExecutionContextExtensionURI` key first, fall back to `ArkMetadataKey`.
- [ ] 5.2 Add `responseMessagesV1` extraction: unmarshal as `[]protocol.Message`, convert to `response.raw` compatible JSON.
- [ ] 5.3 Fall back to legacy `messages` when `responseMessagesV1` is absent.
- [ ] 5.4 Add helper to convert `[]protocol.Message` to dashboard-compatible `response.raw` JSON.

## 6. Verification

- [ ] 6.1 Add unit tests for `extractEngineResponseMeta()` covering all three extraction branches (protocol-native, legacy, fallback).
- [ ] 6.2 Add unit test for protocol-to-raw conversion correctness.
- [ ] 6.3 Compile `ark/internal/a2a`, `ark/executors/completions`, and `ark/internal/controller` packages.
- [ ] 6.4 Run existing controller and completions tests to verify no regressions.
