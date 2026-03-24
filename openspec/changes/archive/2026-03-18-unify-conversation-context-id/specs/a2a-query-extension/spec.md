## MODIFIED Requirements

### Requirement: Python SDK resolves QueryRef transparently
The Python SDK `executor_app.py` SHALL extract QueryRef from the A2A extension metadata and resolve the full execution context (agent config, tools) via the K8s API. The SDK SHALL also extract the A2A message's `context_id` and include it as `conversationId` in the `ExecutionEngineRequest`. The `ExecutionEngineRequest` SHALL NOT include a `history` field — engines that need history SHALL use `conversationId` to fetch it from their own storage. The `BaseExecutor.execute_agent()` interface SHALL remain unchanged.

#### Scenario: Named engine receives A2A message with QueryRef and contextId
- **WHEN** an A2A message with the query extension and `context_id: "conv-123"` arrives at an engine built with the Python SDK
- **THEN** the SDK extracts the QueryRef, fetches the Query CRD, derives agent config and tools, sets `conversationId` to `"conv-123"`, and calls `execute_agent()` with a fully populated `ExecutionEngineRequest`

#### Scenario: Named engine receives A2A message with QueryRef but no contextId
- **WHEN** an A2A message with the query extension but no `context_id` arrives
- **THEN** the SDK resolves the query and calls `execute_agent()` with `conversationId` set to empty string

#### Scenario: ExecutionEngineRequest does not include history
- **WHEN** the SDK constructs an `ExecutionEngineRequest`
- **THEN** the request has no `history` field — the `_build_history()` function and `history` field are removed

#### Scenario: Named engine receives A2A message without QueryRef
- **WHEN** an A2A message arrives without the query extension metadata
- **THEN** the SDK raises an error indicating missing query context

### Requirement: Python SDK sets contextId on A2A response
The `A2AExecutorAdapter` SHALL set `context_id` on the outgoing A2A response message. If the executor does not modify the conversation ID, the original value SHALL be returned. If the executor returns a different value, that value SHALL be used.

#### Scenario: Engine returns response with original conversation ID
- **WHEN** a `BaseExecutor.execute_agent()` completes and the conversation ID was not modified
- **THEN** the A2A response message has `context_id` set to the original incoming value

#### Scenario: Engine returns response without conversation ID
- **WHEN** a `BaseExecutor.execute_agent()` completes and no conversation ID was provided or returned
- **THEN** the A2A response message has no `context_id` set
