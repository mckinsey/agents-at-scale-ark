## 1. Query CRD Changes

- [ ] 1.1 Remove `QueryTypeMessages` constant and `type: "messages"` support from `ark/api/v1alpha1/query_types.go`
- [ ] 1.2 Remove `GetInputMessages()`, `SetInputMessages()`, and `GetInputAsGeneric()` methods from Query type
- [ ] 1.3 Remove `openai-go` import from `ark/api/v1alpha1/query_types.go`
- [ ] 1.4 Update query validation in `ark/internal/validation/` to reject `type: "messages"`
- [ ] 1.5 Add mutating webhook to convert `type: "messages"` queries during deprecation period (extract last user message, add migration warning annotation following `model_webhook.go` pattern)
- [ ] 1.6 Regenerate CRDs with `make manifests` and sync to Helm chart
- [ ] 1.7 Update query webhook tests in `ark/internal/webhook/v1/query_webhook_test.go`

## 2. Shared Query Input Resolver

- [ ] 2.1 Create `ark/internal/resolution/query_input.go` with `ResolveQueryInputText(ctx, query, k8sClient) (string, error)` handling string input + Go template parameter expansion
- [ ] 2.2 Implement `ExtractFirstUserText` parsing `json.RawMessage` for user message text without OpenAI types (needed during deprecation for webhook conversion)
- [ ] 2.3 Wire `ResolveQueryInputText` to use existing `resolution.ResolveFromConfigMap` (`headers.go:85`) and `resolution.ResolveFromSecret` (`headers.go:66`)
- [ ] 2.4 Unit tests for `ResolveQueryInputText` covering plain text, template parameters with ConfigMap/Secret refs, and error conditions
- [ ] 2.5 Unit tests for `ExtractFirstUserText` covering string content, array-of-parts content, and missing user messages

## 3. Controller Decoupling

- [ ] 3.1 Remove completions package import from `ark/internal/controller/query_controller.go`
- [ ] 3.2 Rewrite `extractUserInput()` (`query_controller.go:399`) to call `resolution.ResolveQueryInputText` instead of `completions.GetQueryInputMessages` + `completions.ExtractUserMessageContent`
- [ ] 3.3 Replace `serializeMessages()` (`query_controller.go:407`) with `buildFallbackRaw(responseText string) string` using `json.Marshal` on anonymous struct to produce `[{"role":"assistant","content":"..."}]`
- [ ] 3.4 Remove `completions.NewAssistantMessage` usage at line 378
- [ ] 3.5 Unit test for `buildFallbackRaw` covering normal text and empty string
- [ ] 3.6 Update `query_controller_dispatch_test.go` to reflect simplified dispatch
- [ ] 3.7 Update `query_controller_test.go` for new input handling

## 4. Completions Executor Updates

- [ ] 4.1 Deduplicate `resolveConfigMapKeyRef` (`query_parameters.go:72`) and `resolveSecretKeyRef` (`:85`) to delegate to existing `resolution.ResolveFromConfigMap` and `resolution.ResolveFromSecret`
- [ ] 4.2 Audit `handler.go` `buildA2AResponse` / `serializeResponseMessages` to ensure `messages` metadata is always populated under `QueryExtensionMetadataKey` (currently returns empty when responseMessages is nil or marshaling fails)
- [ ] 4.3 Update `PrepareExecutionMessages()` in `message_helpers.go` — input is always single user message, history always from memory
- [ ] 4.4 Remove dual-source message merging logic (no more input messages[] + memory merge)
- [ ] 4.5 Update `handler.go` `setupExecution()` to not read message array from Query spec
- [ ] 4.6 Update `message_helpers_test.go` for simplified message preparation
- [ ] 4.7 Update `handler_test.go` for new ProcessMessage flow
- [ ] 4.8 Update `memory_http_test.go` if memory retrieval interface changes
- [ ] 4.9 Verify `GetQueryInputMessages` still works for engine-internal use (agent prompts, tool bodies)

## 5. ark-api OpenAI Endpoint Translation

- [ ] 5.1 Add memory service client to ark-api for storing messages
- [ ] 5.2 Update `/openai/v1/chat/completions` to extract last user message from `messages[]`
- [ ] 5.3 Update endpoint to store messages in memory service and create `type: "user"` Query with `conversationId`
- [ ] 5.4 Ensure `conversationId` is returned in both streaming and non-streaming responses
- [ ] 5.5 Update `watch_query_completion()` to not depend on original messages array
- [ ] 5.6 Update `services/ark-api/ark-api/tests/api/test_openai.py` for new behavior

## 6. Dashboard Changes

- [ ] 6.1 Update `useChatSession` hook to send only current user message + `conversationId`
- [ ] 6.2 Remove client-side message accumulation from `chatHistoryAtom` in `atoms/chat-history.ts`
- [ ] 6.3 Add conversation history fetching from API for message display
- [ ] 6.4 Update `handleStreamChatResponse` to extract and store `conversationId` from responses
- [ ] 6.5 Update dashboard chat service tests

## 7. E2E Tests and Samples

- [ ] 7.1 Update `tests/query-input-type/` chainsaw tests — remove `type: "messages"` test cases, add `conversationId` continuity tests
- [ ] 7.2 Update test manifests in `tests/query-input-type/manifests/`
- [ ] 7.3 Rewrite `samples/queries/query-conversation-messages.yaml` to use `conversationId` pattern
- [ ] 7.4 Remove broken `samples/queries/query-messages-image-url.yaml`
- [ ] 7.5 Verify all 55 e2e test directories still pass with `type: "user"` only

## 8. Documentation

- [ ] 8.1 Update `docs/content/reference/resources/query.mdx` — remove `type: "messages"`, document `conversationId` as sole continuity mechanism
- [ ] 8.2 Update `docs/content/user-guide/queries.mdx` — rewrite "Structured Conversations" section
- [ ] 8.3 Update `docs/content/developer-guide/queries/a2a-queries.mdx` — update stateful messages section
- [ ] 8.4 Update `docs/content/developer-guide/building-execution-engines.mdx` — update conversation threading pattern
- [ ] 8.5 Update `docs/content/reference/ark-apis.mdx` — document ark-api as translation boundary
- [ ] 8.6 Add migration entry to `docs/content/reference/upgrading.mdx`
