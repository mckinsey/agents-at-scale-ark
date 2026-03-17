# Controller Response Boundary Tasks

## 1. Remove OpenAI reconstruction from controller

- [ ] 1.1 Remove `protocolMessagesToRawJSON` and related helper functions from `query_controller.go`
- [ ] 1.2 Remove OpenAI type imports from response processing path
- [ ] 1.3 Verify no remaining OpenAI type usage in controller response handling

## 2. Opaque response pass-through

- [ ] 2.1 Rewrite `extractResponseMessages` to read `messages` from A2A metadata as `json.RawMessage`
- [ ] 2.2 Implement `buildFallbackRaw` for cases where executor does not provide `messages` metadata
- [ ] 2.3 Track `responseMessagesV1` presence in response without converting its contents

## 3. Handler-side conversion

- [ ] 3.1 Implement `openAIToProtocolResponseMessages` in `completions/handler.go` for full-fidelity conversion
- [ ] 3.2 Update `buildA2AResponse` to dual-write both `responseMessagesV1` and `messages` metadata
- [ ] 3.3 Use DataParts for tool calls and structured content in protocol messages

## 4. Metadata merge

- [ ] 4.1 Implement `extractArkPayloadMap` merging both `QueryExtensionMetadataKey` and `ExecutionContextExtensionURI`
- [ ] 4.2 Add generic extension helpers to `ark/internal/a2a/extensions.go`

## 5. Testing

- [ ] 5.1 Unit tests for `extractResponseMessages` with both legacy and protocol-native responses
- [ ] 5.2 Unit tests for `buildFallbackRaw` covering text-only and missing content cases
- [ ] 5.3 Unit tests for metadata merge with overlapping and disjoint sources
- [ ] 5.4 E2E verification that `response.raw` and `responseMessagesV1` are both populated correctly
