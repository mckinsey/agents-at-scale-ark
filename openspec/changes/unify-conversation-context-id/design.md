## Context

The controller communicates with all execution engines (completions and named) exclusively via A2A protocol. However, `conversationId` — the identifier for conversation threading — bypasses A2A entirely. The completions engine reads it directly from the Query CR via K8s API, and named engines have no access to it at all.

The A2A protocol has a first-class `ContextID` field on `Message` designed exactly for this purpose. Meanwhile, a separate `a2a-context-id` annotation exists for sub-agent dispatch, creating two parallel mechanisms for the same concept.

Current flow:
```
Controller → A2A Message (no contextId) → Completions → reads Query CR for conversationId
Controller → A2A Message (no contextId) → Named Engine → no conversation threading available
```

## Goals / Non-Goals

**Goals:**
- Controller sends `conversationId` as A2A `Message.ContextID` to all engines
- Completions engine reads conversation ID from A2A message (fallback to Query CR)
- Python SDK surfaces conversation ID to named engines via `ExecutionEngineRequest`
- Python SDK sets context ID on A2A responses
- Documentation reflects unified model
- Zero breaking changes — existing annotation path and API surface unchanged

**Non-Goals:**
- Collapsing `status.conversationId` and `status.a2a.contextId` into a single field (CRD API change, separate effort)
- Adding memory service support to named engines (engines manage their own state)
- Changing the `a2a-context-id` annotation behavior for sub-agent dispatch (hop 2)
- Modifying the broker/memory service

## Decisions

### 1. Controller maps conversationId → A2A ContextID

In `sendQueryA2A()`, if `query.Spec.ConversationId` is non-empty, use `protocol.NewMessageWithContext()` instead of `protocol.NewMessage()`.

**Why**: This is the minimal change that makes conversationId available to all engines via the standard A2A protocol field. No new metadata keys, no custom extensions.

**Alternative considered**: Sending conversationId as A2A message metadata (custom key). Rejected because ContextID is the standard A2A field for exactly this purpose.

### 2. ConversationId takes precedence (no conflict with annotation)

The `a2a-context-id` annotation operates at a different hop (completions → sub-agents), not at the controller → engine hop. There is no precedence conflict.

```
Hop 1: Controller → Engine     → uses spec.conversationId as A2A contextId
Hop 2: Completions → Sub-agent → uses a2a-context-id annotation as A2A contextId
```

**Why**: These are different dispatch points. The annotation is read by the completions engine for sub-agent calls, not by the controller for engine dispatch.

### 3. Completions engine reads from A2A message, falls back to Query CR

```go
conversationId := message.GetContextID()  // from A2A protocol
if conversationId == "" {
    conversationId = query.Spec.ConversationId  // fallback
}
```

**Why**: The A2A message is the canonical source now that the controller sends it. Fallback preserves backwards compatibility during rollout (if somehow the message arrives without contextId).

**Note**: The completions engine still fetches the Query CR for everything else (target, session ID, memory config, input messages, annotations, telemetry). Only the conversationId source changes.

### 4. Python SDK adds conversation_id to ExecutionEngineRequest

```python
class ExecutionEngineRequest(BaseModel):
    agent: AgentConfig
    userInput: Message
    history: List[Message]
    tools: List[ToolDefinition] = []
    conversation_id: str = ""  # from A2A contextId
```

**Why**: Named engines need the conversation ID to implement their own stateful behavior. Adding it to the existing request type is the minimal change. Default empty string means existing executors don't break.

### 5. Python SDK A2AExecutorAdapter reads/writes context_id

The adapter extracts `context_id` from the incoming A2A message and passes it through. On response, it sets `context_id` on the outgoing A2A message so the controller can extract it.

**Why**: This completes the round-trip. Without the response side, the controller can't store the engine's context ID in `status.conversationId`.

### 6. Return path maps A2A contextId → status.conversationId

The controller's `extractEngineResponseMeta()` already extracts A2A contextId from responses. This value should also be written to `status.conversationId` when present (in addition to `status.a2a.contextId`).

**Why**: Clients expect `status.conversationId` to contain the conversation ID for follow-up queries. If the engine returns it via A2A, both status fields should reflect it.

## Risks / Trade-offs

**[Risk] Completions engine receives contextId it didn't set** → The completions engine currently only gets conversationId from the Query CR. With this change, it also arrives via A2A. If there's a mismatch (e.g., controller sends one value, Query CR has another), the A2A value wins. Mitigation: They should always match since the controller reads from the same Query CR.

**[Risk] Named engines return unexpected contextId** → A named engine might return a different context ID than what was sent (e.g., its own internal session ID). This is actually correct behavior — the engine owns its state. Mitigation: Document that engines may return a different contextId and clients should use the returned value for follow-up.

**[Risk] Python SDK backwards compatibility** → Adding `conversation_id` to `ExecutionEngineRequest` with a default value means existing executors continue to work. Mitigation: Field defaults to empty string, no code changes required in existing engines.

**[Trade-off] Two status fields with same value** → `status.conversationId` and `status.a2a.contextId` may contain the same value at hop 1. This is intentional duplication to maintain backwards compatibility. Collapsing them is a future CRD API change.
