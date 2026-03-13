# PR-C Legacy Removal Tasks

## 1. Validation gates

- [ ] 1.1 Confirm all registered execution engines write `responseMessagesV1` under `ExecutionContextExtensionURI`.
- [ ] 1.2 Confirm dashboard chat parity with protocol-native derived `response.raw`.

## 2. Handler removal

- [ ] 2.1 Remove `ArkMetadataKey` dual-write from `buildA2AResponse()`.
- [ ] 2.2 Remove `ArkMetadataKey` fallback from `extractArkMetadata()`.

## 3. Controller removal

- [ ] 3.1 Remove `ArkMetadataKey` dual-write from `executeViaEngine()`.
- [ ] 3.2 Remove `ArkMetadataKey` fallback from `extractEngineResponseMeta()`.

## 4. Type cleanup

- [ ] 4.1 Remove `Messages any` field from `ExecutionResponsePayload`.
- [ ] 4.2 Remove or deprecate `ArkMetadataKey` constant.

## 5. Verification

- [ ] 5.1 Compile all affected packages.
- [ ] 5.2 Run full controller and completions test suite.
- [ ] 5.3 Run integration tests against live cluster to verify no regressions.
