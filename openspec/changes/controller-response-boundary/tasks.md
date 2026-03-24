# Controller Response Boundary Tasks

## 1. Remove OpenAI reconstruction from controller

- [ ] 1.1 Remove `serializeMessages` (at `query_controller.go:407`) and its `completions.Message` type switching
- [ ] 1.2 Remove `completions.NewAssistantMessage` usage at line 378
- [ ] 1.3 Remove `completions` import from controller response processing path

## 2. Implement provider-independent fallback

- [ ] 2.1 Implement `buildFallbackRaw(responseText string) string` using `json.Marshal` on an anonymous struct to produce `[{"role":"assistant","content":"..."}]`
- [ ] 2.2 Replace the fallback at lines 376-379 to call `buildFallbackRaw(responseText)` instead of constructing `completions.Message` and calling `serializeMessages`

## 3. Handler reliability

- [ ] 3.1 Audit `completions/handler.go` `buildA2AResponse` to confirm it always populates `messages` in A2A metadata under `QueryExtensionMetadataKey`
- [ ] 3.2 Add `messages` metadata to any code paths in the handler that currently omit it (e.g., error responses, empty results)

## 4. Testing

- [ ] 4.1 Unit test for `buildFallbackRaw` covering normal text and empty string
- [ ] 4.2 Unit test verifying `extractEngineResponseMeta` correctly reads `MessagesRaw` from `QueryExtensionMetadataKey` metadata (existing behavior, add coverage if missing)
- [ ] 4.3 Integration test verifying `response.raw` is populated correctly for both metadata-present and fallback paths
- [ ] 4.4 Run existing controller and completions tests to verify no regressions
