# PR-A Boundary Contract Tasks

## 1. Generic extension helpers

- [x] 1.1 Create `ark/internal/a2a/extensions.go` with `SetExtension`, `SetMetadata`, `GetExtension`, `GetExtensionAs[T]`, `HasExtension`, `GetMetadata`.
- [x] 1.2 Add typed wrappers `SetExecutionContextExtension` and `GetExecutionContextExtension`.
- [x] 1.3 Create `ark/internal/a2a/extensions_test.go` with unit tests for all generic and typed helpers.

## 2. Extension types and constants

- [x] 2.1 Add `ExecutionContextExtensionURI` constant to `ark/internal/a2a/a2a_types.go`.
- [x] 2.2 Add `ExecutionTraceExtensionURI` constant.
- [x] 2.3 Add `ExecutionResponsePayload` struct with `ResponseMessagesV1 json.RawMessage` field.
- [x] 2.4 Add `ResponseTokenUsage` struct.

## 3. Handler response path

- [x] 3.1 Refactor `buildA2AResponse()` to use `SetExecutionContextExtension` for spec-compliant extension.
- [x] 3.2 Refactor `buildA2AResponse()` to use `SetMetadata` for legacy `ArkMetadataKey` (not added to `extensions`).
- [x] 3.3 Serialize `[]protocol.Message` into `responseMessagesV1` under `ExecutionContextExtensionURI` metadata key.
- [x] 3.4 Keep legacy `ArkMetadataKey` metadata with OpenAI-shaped `messages` for backward compatibility.

## 4. Handler extraction path

- [x] 4.1 Refactor `extractArkMetadata()` to use `GetExtension(msg, ExecutionContextExtensionURI)` first, fall back to `GetMetadata(msg, ArkMetadataKey)`.

## 5. Controller request path

- [x] 5.1 Refactor `executeViaEngine()` to use `SetExtension(msg, ExecutionContextExtensionURI, arkMetadata)`.
- [x] 5.2 Refactor `executeViaEngine()` to use `SetMetadata(msg, ArkMetadataKey, arkMetadata)` for legacy compat.

## 6. Controller extraction path

- [x] 6.1 Refactor `extractEngineResponseMeta()` to use `GetExtension` with `GetMetadata` fallback.
- [x] 6.2 `responseMessagesV1` extraction: unmarshal as `[]protocol.Message`, convert to `response.raw` compatible JSON.
- [x] 6.3 Fall back to legacy `messages` when `responseMessagesV1` is absent.
- [x] 6.4 Helper to convert `[]protocol.Message` to dashboard-compatible `response.raw` JSON.

## 7. Verification

- [x] 7.1 Unit tests for extension helpers covering dedup, metadata-only writes, typed round-trips, and `HasExtension` distinction.
- [x] 7.2 Unit tests for `extractEngineResponseMeta()` covering all three extraction branches.
- [x] 7.3 Unit test for protocol-to-raw conversion correctness.
- [x] 7.4 Compile `ark/internal/a2a`, `ark/executors/completions`, and `ark/internal/controller` packages.
- [x] 7.5 Run existing controller and completions tests to verify no regressions.
