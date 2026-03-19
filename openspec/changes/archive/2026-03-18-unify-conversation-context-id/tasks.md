## 1. Controller — Send conversationId as A2A contextId

- [x] 1.1 Update `sendQueryA2A()` in `ark/internal/controller/query_controller.go` to use `protocol.NewMessageWithContext()` when `query.Spec.ConversationId` is non-empty
- [x] 1.2 Update `extractEngineResponseMeta()` to write A2A response contextId into `status.conversationId` in addition to `status.a2a.contextId`
- [x] 1.3 Add/update unit tests in `query_controller_dispatch_test.go` for conversationId → contextId mapping and return path

## 2. Completions Engine — Read conversationId from A2A message

- [x] 2.1 Update `setupExecution()` in `ark/executors/completions/handler.go` to read contextId from incoming A2A message as primary source, fall back to `query.Spec.ConversationId`
- [x] 2.2 Update `ProcessMessage` signature or extract contextId from `protocol.Message` before passing to `setupExecution`
- [x] 2.3 Add unit tests for: A2A message with contextId, without contextId (fallback), neither source has value

## 3. Python SDK — Surface conversationId to named engines

- [x] 3.1 Remove `history` field, add `conversationId: str = ""` field to `ExecutionEngineRequest`, delete `_build_history()`
- [x] 3.2 Update `A2AExecutorAdapter.execute()` in `executor_app.py` to extract `context_id` from incoming A2A message and pass through to `resolve_query()`
- [x] 3.3 Update `resolve_query()` and `_resolve_from_query()` in `extensions/query.py` to accept and pass conversationId into `ExecutionEngineRequest`
- [x] 3.4 Update `A2AExecutorAdapter.execute()` to set `context_id` on the outgoing A2A response message
- [x] 3.5 Add tests for conversationId extraction, passthrough, and response round-trip

## 4. CRD Godoc Comments

- [x] 4.1 Update `QuerySpec.ConversationId` comment in `ark/api/v1alpha1/query_types.go` to state it is sent as A2A ContextID to engines
- [x] 4.2 Update `A2AMetadata.ContextID` comment to clarify it contains the contextId returned by the engine

## 5. Documentation Updates

- [x] 5.1 Update `docs/content/reference/resources/query.mdx` — present conversationId as universal conversation threading sent via A2A
- [x] 5.2 Update `docs/content/developer-guide/queries/a2a-queries.mdx` — conversationId as primary, a2a-context-id annotation as advanced override
- [x] 5.3 Update `docs/content/reference/resources/memory.mdx` — acknowledge conversationId is now universal, not memory-specific
- [x] 5.4 Update `docs/content/reference/ark-apis.mdx` — clarify when to use conversationId vs a2a-context-id annotation
- [x] 5.5 Update `docs/content/developer-guide/queries/streaming.mdx` — show conversationId in streaming response metadata
- [x] 5.6 Add upgrade entry to `docs/content/reference/upgrading.mdx` — conversationId now flows through A2A, named engines can access it
- [x] 5.7 Update executor developer guide `docs/content/developer-guide/building-execution-engines.mdx` — add conversation threading section

## 6. CLI and Tests

- [x] 6.1 Simplify `tools/ark-cli/src/lib/chatClient.ts` — conversationId covers common case, reduce a2aContextId prominence
- [x] 6.2 Update `tests/a2a-message-context/` chainsaw test to verify conversationId flows as A2A contextId
