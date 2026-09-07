## MODIFIED Requirements

### Requirement: Python SDK resolves QueryRef transparently
The Python SDK `executor_app.py` SHALL extract QueryRef from the A2A extension metadata and resolve the full execution context (agent config, tools, history) via the K8s API. The SDK SHALL derive the `ExecutionEngineRequest`'s `conversation_id` from the QueryRef's `conversationId` when that field is present, and from the A2A message's `context_id` otherwise. The SDK SHALL retrieve conversation history from the memory service using the resolved `conversation_id`, not from the Query spec input. The `BaseExecutor.execute_agent()` interface SHALL remain unchanged.

Only a sub-target dispatch carries `conversationId`, so a top-level call resolves to `context_id` exactly as it did before this change.

#### Scenario: Named engine receives A2A message with QueryRef and contextId
- **WHEN** an A2A message with the query extension, `context_id: "conv-123"`, and no `conversationId` arrives at an engine built with the Python SDK
- **THEN** the SDK extracts the QueryRef, fetches the Query CRD, derives agent config and tools, retrieves conversation history from the memory service using `"conv-123"`, sets `conversation_id` to `"conv-123"`, and calls `execute_agent()` with a fully populated `ExecutionEngineRequest`

#### Scenario: Named engine receives A2A message with QueryRef but no contextId
- **WHEN** the SDK is driven with neither `context_id` nor `conversationId`
- **THEN** it resolves the query and calls `execute_agent()` with `conversation_id` set to empty string and no prior conversation history
- **AND** this does not arise over A2A transport, where the server generates a `context_id` before the SDK sees the message

#### Scenario: Named engine receives A2A message without QueryRef
- **WHEN** an A2A message arrives without the query extension metadata
- **THEN** the SDK raises an error indicating missing query context
