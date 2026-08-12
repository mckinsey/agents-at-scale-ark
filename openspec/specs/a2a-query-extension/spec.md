## MODIFIED Requirements

### Requirement: Completions engine forwards QueryRef extension to named engines
The completions engine SHALL forward the QueryRef extension when sending A2A messages to named execution engines. It SHALL NOT send the agent config, tools, or history as metadata. The engine SHALL NOT read a message array from the Query spec input — conversation history is retrieved from the memory service using the conversation ID.

#### Scenario: Completions engine routes to named execution engine
- **WHEN** an agent with an `ExecutionEngine` ref is executed
- **THEN** the A2A message to the named engine contains only the QueryRef extension, not the full agent/tools/history blob

#### Scenario: Named engine retrieves conversation history
- **WHEN** a named engine receives a QueryRef and resolves the Query CR
- **THEN** it retrieves conversation history from the memory service using the conversation ID, not from the Query spec input

### Requirement: Python SDK resolves QueryRef transparently
The Python SDK `executor_app.py` SHALL extract QueryRef from the A2A extension metadata and resolve the full execution context (agent config, tools, history) via the K8s API. The SDK SHALL also extract the A2A message's `context_id` and include it as `conversation_id` in the `ExecutionEngineRequest`. The SDK SHALL retrieve conversation history from the memory service using the `conversation_id`, not from the Query spec input. The `BaseExecutor.execute_agent()` interface SHALL remain unchanged.

#### Scenario: Named engine receives A2A message with QueryRef and contextId
- **WHEN** an A2A message with the query extension and `context_id: "conv-123"` arrives at an engine built with the Python SDK
- **THEN** the SDK extracts the QueryRef, fetches the Query CRD, derives agent config and tools, retrieves conversation history from the memory service using `"conv-123"`, sets `conversation_id` to `"conv-123"`, and calls `execute_agent()` with a fully populated `ExecutionEngineRequest`

#### Scenario: Named engine receives A2A message with QueryRef but no contextId
- **WHEN** an A2A message with the query extension but no `context_id` arrives
- **THEN** the SDK resolves the query and calls `execute_agent()` with `conversation_id` set to empty string and no prior conversation history

#### Scenario: Named engine receives A2A message without QueryRef
- **WHEN** an A2A message arrives without the query extension metadata
- **THEN** the SDK raises an error indicating missing query context
