# PR4-v2 Boundary Cleanup Tasks

## 1. Handler cleanup

- [ ] 1.1 Remove OpenAI-only message helpers from `message_helpers.go`.
- [ ] 1.2 Update `buildA2AResponse()` to accept only `[]ProtocolMessage`.
- [ ] 1.3 Remove `serializeResponseMessages([]Message)`, keep only protocol serialization path.
- [ ] 1.4 Update `finalizeStream()` to use protocol messages directly.

## 2. Controller cleanup

- [ ] 2.1 Update `serializeMessages()` to use protocol-to-raw conversion helper.
- [ ] 2.2 Remove direct OpenAI type references from controller serialization path.

## 3. Verification

- [ ] 3.1 Compile completions and controller packages with tests.
- [ ] 3.2 Run focused handler, controller, and streaming tests.
