## Why

The controller now communicates exclusively via A2A protocol, but `conversationId` (the conversation threading identifier) is never sent through A2A. Instead, the completions engine reads it directly from the Query CR via K8s API. Named execution engines have no access to conversation threading at all. Meanwhile, `a2a-context-id` annotation exists as a separate, parallel mechanism for A2A conversation state. These two concepts are semantically identical — "which conversation does this message belong to?" — but travel different paths and serve different scopes. Unifying them simplifies the model, gives named engines conversation threading for free, and aligns with A2A protocol semantics.

## What Changes

- Controller sends `spec.conversationId` as A2A `Message.ContextID` when dispatching to any engine
- Completions engine reads conversation ID from incoming A2A message instead of fetching it from Query CR
- Python SDK (`ExecutionEngineRequest`) gains a `conversationId` field
- Python SDK (`A2AExecutorAdapter`) extracts `context_id` from A2A message and sets it on response
- Python SDK removes dead `history` field from `ExecutionEngineRequest` — `_build_history()` always returns `[]` and was never wired up
- `a2a-context-id` annotation remains functional but becomes the advanced override for sub-agent dispatch (hop 2), not the primary conversation threading mechanism
- Documentation restructured: `conversationId` elevated to universal conversation concept, `a2a-context-id` annotation demoted to advanced use case

## Capabilities

### New Capabilities
- `a2a-conversation-threading`: Controller sends conversationId as A2A contextId and engines receive it via protocol message

### Modified Capabilities
- `a2a-query-extension`: Python SDK executor types gain conversationId field; A2AExecutorAdapter reads/writes context_id on A2A messages
- `executor-developer-guide`: Guide updated to explain conversation threading for named engines

## Impact

- **Controller** (`ark/internal/controller/query_controller.go`): `sendQueryA2A()` uses `NewMessageWithContext` when conversationId present
- **Completions engine** (`ark/executors/completions/handler.go`): `setupExecution()` reads conversationId from A2A message, falls back to Query CR
- **Python SDK** (`lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/`): `executor.py`, `executor_app.py`, `extensions/query.py` updated
- **Docs**: `query.mdx`, `a2a-queries.mdx`, `memory.mdx`, `ark-apis.mdx`, `streaming.mdx`, `upgrading.mdx`
- **CLI**: `tools/ark-cli/src/lib/chatClient.ts` may simplify now that conversationId covers the common case
- **Tests**: `tests/a2a-message-context/` updated, new tests for conversationId-as-contextId flow
- **CRD godoc**: Field comments updated to reflect unified semantics
- **No CRD schema changes** — existing fields used, just wired differently
- **No breaking API changes** — annotation path still works, conversationId field unchanged
