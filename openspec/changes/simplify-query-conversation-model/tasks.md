## 1. Query CRD Changes

- [x] 1.1 Remove `QueryTypeMessages` constant and `type: "messages"` support from `ark/api/v1alpha1/query_types.go`
- [x] 1.2 Remove `GetInputMessages()`, `SetInputMessages()`, and `GetInputAsGeneric()` methods from Query type
- [x] 1.3 Remove `openai-go` import from `ark/api/v1alpha1/query_types.go`
- [x] 1.4 Update query validation in `ark/internal/validation/` to reject `type: "messages"`
- [x] 1.5 Add mutating webhook to convert `type: "messages"` queries during deprecation period (extract last user message, add migration warning annotation following `model_webhook.go` pattern)
- [x] 1.6 Regenerate CRDs with `make manifests` and sync to Helm chart
- [x] 1.7 Update query webhook tests in `ark/internal/webhook/v1/query_webhook_test.go`

## 2. Shared Query Input Resolver

- [x] 2.1 Create `ark/internal/resolution/query_input.go` with `ResolveQueryInputText(ctx, query, k8sClient) (string, error)` handling string input + Go template parameter expansion
- [x] 2.2 Implement `ExtractFirstUserText` parsing `json.RawMessage` for user message text without OpenAI types (needed during deprecation for webhook conversion)
- [x] 2.3 Wire `ResolveQueryInputText` to use existing `resolution.ResolveFromConfigMap` (`headers.go:85`) and `resolution.ResolveFromSecret` (`headers.go:66`)
- [x] 2.4 Unit tests for `ResolveQueryInputText` covering plain text, template parameters with ConfigMap/Secret refs, and error conditions
- [x] 2.5 Unit tests for `ExtractFirstUserText` covering string content, array-of-parts content, and missing user messages

## 3. Controller Decoupling

- [x] 3.1 Remove completions package import from `ark/internal/controller/query_controller.go`
- [x] 3.2 Rewrite `extractUserInput()` (`query_controller.go:399`) to call `resolution.ResolveQueryInputText` instead of `completions.GetQueryInputMessages` + `completions.ExtractUserMessageContent`
- [x] 3.3 Replace `serializeMessages()` (`query_controller.go:407`) with `buildFallbackRaw(responseText string) string` using `json.Marshal` on anonymous struct to produce `[{"role":"assistant","content":"..."}]`
- [x] 3.4 Remove `completions.NewAssistantMessage` usage at line 378
- [x] 3.5 Unit test for `buildFallbackRaw` covering normal text and empty string
- [x] 3.6 Update `query_controller_dispatch_test.go` to reflect simplified dispatch
- [x] 3.7 Update `query_controller_test.go` for new input handling

## 4. Completions Executor Updates

- [x] 4.1 Deduplicate `resolveConfigMapKeyRef` (`query_parameters.go:72`) and `resolveSecretKeyRef` (`:85`) to delegate to existing `resolution.ResolveFromConfigMap` and `resolution.ResolveFromSecret`
- [x] 4.2 Audit `handler.go` `buildA2AResponse` / `serializeResponseMessages` to ensure `messages` metadata is always populated under `QueryExtensionMetadataKey`
- [x] 4.3 Update `PrepareExecutionMessages()` in `message_helpers.go` — input is always single user message, history always from memory
- [x] 4.4 Remove dual-source message merging logic (no more input messages[] + memory merge)
- [x] 4.5 Update `handler.go` `setupExecution()` to not read message array from Query spec
- [x] 4.6 Update `message_helpers_test.go` for simplified message preparation
- [x] 4.7 Update `handler_test.go` for new ProcessMessage flow
- [x] 4.8 Update `memory_http_test.go` if memory retrieval interface changes
- [x] 4.9 Verify `GetQueryInputMessages` still works for engine-internal use (agent prompts, tool bodies)

## 5. Remove OpenAI Endpoints from ark-api

- [x] 5.1 Remove `openai.py` route handler (`/openai/v1/chat/completions` and `/openai/v1/models`)
- [x] 5.2 Remove `ChatCompletionRequest` model and OpenAI response types
- [x] 5.3 Remove `proxy_streaming_response` function (if not reused by broker proxy)
- [x] 5.4 Remove `/openai/v1/chat/completions` from ReadOnlyMiddleware whitelist (`middleware.py:14`)
- [x] 5.5 Remove openai router registration from app setup
- [x] 5.6 Remove `services/ark-api/ark-api/tests/api/test_openai.py`
- [x] 5.7 Update `services/ark-api/ark-api/tests/test_read_only_middleware.py` to remove OpenAI endpoint test
- [x] 5.8 Update `services/ark-api/ark-api/src/ark_api/models/queries.py` if `ArkOpenAICompletionsMetadata` is only used by the removed endpoint

## 6. Dashboard Migration

- [x] 6.1 Rewrite `streamChatResponse()` in `chat.ts` to create query via `/api/v1/queries/` with streaming annotation, then stream from `/api/v1/broker/chunks?watch=true&query-id={name}`
- [x] 6.2 Update `useChatSession` hook to send only current user message + `conversationId` via query API
- [x] 6.3 Remove client-side message accumulation from `chatHistoryAtom` in `atoms/chat-history.ts`
- [x] 6.4 Add conversation history fetching from API for message display
- [x] 6.5 Update `handleStreamChatResponse` to extract and store `conversationId` from query response
- [x] 6.6 Remove `ChatCompletionMessageParam` imports from `chat.ts`, `use-chat-session.ts`, `chat-message.ts`, `chat-message-list.tsx`
- [x] 6.7 Rewrite `agents-api-dialog.tsx` to show query API endpoint instead of OpenAI endpoint
- [x] 6.8 Rewrite code snippets: `python-snippet.ts`, `go-snippet.ts`, `bash-snippet.ts`
- [x] 6.9 Remove `/openai/v1/chat/completions` and `/openai/v1/models` from generated types in `types.ts` (regenerate)
- [x] 6.10 Update dashboard streaming tests (`__tests__/unit/services/chat.test.ts`)
- [x] 6.11 Update dashboard API dialog tests (`__tests__/unit/components/dialogs/agents-api-dialog.test.tsx`)
- [x] 6.12 Update dashboard middleware test (`__tests__/unit/middleware.test.ts:164`)

## 7. CLI Migration

- [x] 7.1 Rewrite `arkApiClient.ts` to use query API instead of OpenAI SDK wrapper
- [x] 7.2 Update `chatClient.ts` to create queries via API and stream via broker proxy
- [x] 7.3 Remove `openai` package dependency from ark-cli if no longer needed
- [x] 7.4 Update CLI tests for new query creation path

## 8. CI/CD Updates

- [x] 8.1 Update health check in `.github/workflows/cicd.yaml:482` from `/openai/v1/models` to a different endpoint
- [x] 8.2 Verify `tests/run-multi-provider.sh` E2E base URL config is unaffected (this is for model providers, not ark-api)

## 9. E2E Tests and Samples

- [x] 9.1 Update `tests/query-input-type/` chainsaw tests — remove `type: "messages"` test cases, add `conversationId` continuity tests
- [x] 9.2 Update test manifests in `tests/query-input-type/manifests/`
- [x] 9.3 Rewrite `samples/queries/query-conversation-messages.yaml` to use `conversationId` pattern
- [x] 9.4 Remove broken `samples/queries/query-messages-image-url.yaml`
- [x] 9.5 Verify all e2e test directories still pass with `type: "user"` only

## 10. Documentation

- [x] 10.1 Remove "OpenAI-Compatible APIs" section from `docs/content/reference/ark-apis.mdx` (lines 81-296)
- [x] 10.2 Remove "Using OpenAI-Compatible Endpoints" section from `docs/content/user-guide/queries.mdx` (lines 126-242)
- [x] 10.3 Update `docs/content/developer-guide/queries/streaming.mdx` to show query API + broker proxy pattern
- [x] 10.4 Update `docs/content/developer-guide/services/ark-api.mdx` to remove OpenAI routes (lines 64-65)
- [x] 10.5 Update `docs/content/reference/resources/query.mdx` — remove `type: "messages"`, document `conversationId` as sole continuity mechanism
- [x] 10.6 Update `docs/content/user-guide/queries.mdx` — rewrite "Structured Conversations" section
- [x] 10.7 Update `docs/content/developer-guide/queries/a2a-queries.mdx` — update stateful messages section
- [x] 10.8 Update `docs/content/developer-guide/building-execution-engines.mdx` — update conversation threading pattern
- [x] 10.9 Add migration entry to `docs/content/reference/upgrading.mdx` covering both endpoint removal and `type: "messages"` removal
- [x] 10.10 Add migration guide for external OpenAI SDK users with equivalent query API examples
