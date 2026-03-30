## 1. Query CRD Changes

- [ ] 1.1 Remove `QueryTypeMessages` constant and `type: "messages"` support from `ark/api/v1alpha1/query_types.go`
- [ ] 1.2 Remove `GetInputMessages()` and `SetInputMessages()` methods from Query type
- [ ] 1.3 Update query validation in `ark/internal/validation/` to reject `type: "messages"`
- [ ] 1.4 Add mutating webhook to convert `type: "messages"` queries during deprecation period (extract last user message, add migration warning annotation)
- [ ] 1.5 Regenerate CRDs with `make manifests` and sync to Helm chart
- [ ] 1.6 Update query webhook tests in `ark/internal/webhook/v1/query_webhook_test.go`

## 2. Controller Decoupling

- [ ] 2.1 Remove completions package import from `ark/internal/controller/query_controller.go`
- [ ] 2.2 Rewrite `extractUserInput()` to read `spec.input` as a string directly (with ValueSource resolution)
- [ ] 2.3 Replace `serializeMessages()` with a simple JSON wrapper that doesn't use completions message types
- [ ] 2.4 Update `query_controller_dispatch_test.go` to reflect simplified dispatch
- [ ] 2.5 Update `query_controller_test.go` for new input handling

## 3. ark-api OpenAI Endpoint Translation

- [ ] 3.1 Add memory service client to ark-api for storing messages
- [ ] 3.2 Update `/openai/v1/chat/completions` to extract last user message from `messages[]`
- [ ] 3.3 Update endpoint to store messages in memory service and create `type: "user"` Query with `conversationId`
- [ ] 3.4 Ensure `conversationId` is returned in both streaming and non-streaming responses
- [ ] 3.5 Update `watch_query_completion()` to not depend on original messages array
- [ ] 3.6 Update `services/ark-api/ark-api/tests/api/test_openai.py` for new behavior

## 4. Completions Executor Updates

- [ ] 4.1 Update `PrepareExecutionMessages()` in `message_helpers.go` — input is always single user message, history always from memory
- [ ] 4.2 Remove dual-source message merging logic (no more input messages[] + memory merge)
- [ ] 4.3 Update `handler.go` `setupExecution()` to not read message array from Query spec
- [ ] 4.4 Update `message_helpers_test.go` for simplified message preparation
- [ ] 4.5 Update `handler_test.go` for new ProcessMessage flow
- [ ] 4.6 Update `memory_http_test.go` if memory retrieval interface changes

## 5. Dashboard Changes

- [ ] 5.1 Update `useChatSession` hook to send only current user message + `conversationId`
- [ ] 5.2 Remove client-side message accumulation from `chatHistoryAtom` in `atoms/chat-history.ts`
- [ ] 5.3 Add conversation history fetching from API for message display
- [ ] 5.4 Update `handleStreamChatResponse` to extract and store `conversationId` from responses
- [ ] 5.5 Update dashboard chat service tests

## 6. E2E Tests and Samples

- [ ] 6.1 Update `tests/query-input-type/` chainsaw tests — remove `type: "messages"` test cases, add `conversationId` continuity tests
- [ ] 6.2 Update test manifests in `tests/query-input-type/manifests/`
- [ ] 6.3 Rewrite `samples/queries/query-conversation-messages.yaml` to use `conversationId` pattern
- [ ] 6.4 Remove broken `samples/queries/query-messages-image-url.yaml`
- [ ] 6.5 Verify all 55 e2e test directories still pass with `type: "user"` only

## 7. Documentation

- [ ] 7.1 Update `docs/content/reference/resources/query.mdx` — remove `type: "messages"`, document `conversationId` as sole continuity mechanism
- [ ] 7.2 Update `docs/content/user-guide/queries.mdx` — rewrite "Structured Conversations" section
- [ ] 7.3 Update `docs/content/developer-guide/queries/a2a-queries.mdx` — update stateful messages section
- [ ] 7.4 Update `docs/content/developer-guide/building-execution-engines.mdx` — update conversation threading pattern
- [ ] 7.5 Update `docs/content/reference/ark-apis.mdx` — document ark-api as translation boundary
- [ ] 7.6 Add migration entry to `docs/content/reference/upgrading.mdx`
