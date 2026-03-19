## ADDED Requirements

### Requirement: Query extension schema definition
The system SHALL define a JSON Schema at `ark/api/extensions/query/v1/schema.json` as the single source of truth for the query extension contract. The schema SHALL define a QueryRef object with required `name` (string) and `namespace` (string) fields. The schema `$id` SHALL be `https://github.com/mckinsey/agents-at-scale-ark/tree/main/ark/api/extensions/query/v1`.

#### Scenario: Schema file exists and is valid
- **WHEN** a developer reads `ark/api/extensions/query/v1/schema.json`
- **THEN** the file contains a valid JSON Schema with `$id` matching the extension URI, and defines `name` and `namespace` as required string properties

### Requirement: Controller sends QueryRef extension
The controller `executeViaEngine` SHALL attach the query extension to A2A messages using the A2A v0.3.0 extension mechanism. The metadata key SHALL be `{extension-uri}/ref` containing `{ "name": <query-name>, "namespace": <query-namespace> }`. The `X-A2A-Extensions` header SHALL include the extension URI.

#### Scenario: Controller sends query to remote completions engine
- **WHEN** the controller dispatches a query via `executeViaEngine`
- **THEN** the A2A message includes the `X-A2A-Extensions` header with the query extension URI and metadata containing the QueryRef with the query's name and namespace

#### Scenario: Controller sends query via executeDirectly
- **WHEN** the controller dispatches a query via `executeDirectly` (in-process)
- **THEN** no A2A message is sent — the query is available directly via Go context

### Requirement: Completions engine forwards QueryRef extension to named engines
The completions engine SHALL forward the QueryRef extension when sending A2A messages to named execution engines. It SHALL NOT send the agent config, tools, or history as metadata.

#### Scenario: Completions engine routes to named execution engine
- **WHEN** an agent with an `ExecutionEngine` ref is executed
- **THEN** the A2A message to the named engine contains only the QueryRef extension, not the full agent/tools/history blob

### Requirement: Completions engine optionally attaches QueryRef to A2A agents
The completions engine MAY attach the QueryRef extension when sending messages to external A2A agents. The extension SHALL be marked `required: false` in the agent card.

#### Scenario: Completions engine calls external A2A agent
- **WHEN** an A2A agent is invoked by the completions engine
- **THEN** the A2A message includes the QueryRef extension metadata if the agent's card declares support for the extension

### Requirement: Python SDK resolves QueryRef transparently
The Python SDK `executor_app.py` SHALL extract QueryRef from the A2A extension metadata and resolve the full execution context (agent config, tools, history) via the K8s API. The SDK SHALL also extract the A2A message's `context_id` and include it as `conversation_id` in the `ExecutionEngineRequest`. The `BaseExecutor.execute_agent()` interface SHALL remain unchanged.

#### Scenario: Named engine receives A2A message with QueryRef and contextId
- **WHEN** an A2A message with the query extension and `context_id: "conv-123"` arrives at an engine built with the Python SDK
- **THEN** the SDK extracts the QueryRef, fetches the Query CRD, derives agent config, tools, and history, sets `conversation_id` to `"conv-123"`, and calls `execute_agent()` with a fully populated `ExecutionEngineRequest`

#### Scenario: Named engine receives A2A message with QueryRef but no contextId
- **WHEN** an A2A message with the query extension but no `context_id` arrives
- **THEN** the SDK resolves the query and calls `execute_agent()` with `conversation_id` set to empty string

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

### Requirement: SDK declares extension in agent card
The `ExecutorApp` SHALL declare the query extension in the agent card's `capabilities.extensions` array with `required: false`.

#### Scenario: Engine starts and serves agent card
- **WHEN** an engine built with `ExecutorApp` starts
- **THEN** the agent card at `/.well-known/agent-card.json` includes the query extension in `capabilities.extensions` with the correct URI

### Requirement: All implementation files reference the schema
Every file that constructs or parses the query extension metadata SHALL include a reference (comment or docstring) to `ark/api/extensions/query/v1/` as the authoritative spec.

#### Scenario: Developer reads Go metadata construction code
- **WHEN** a developer reads `execution_engine.go` or `query_controller.go`
- **THEN** a comment references `ark/api/extensions/query/v1/` as the extension spec

#### Scenario: Developer reads Python SDK extension code
- **WHEN** a developer reads `extensions/query.py` or `executor_app.py`
- **THEN** a docstring or comment references `ark/api/extensions/query/v1/` as the extension spec

### Requirement: Old metadata key removed
The `ark.mckinsey.com/execution-engine` metadata key SHALL be removed from all message construction and parsing code. No backwards-compatibility fallback SHALL exist.

#### Scenario: Search for old metadata key
- **WHEN** searching the codebase for `ark.mckinsey.com/execution-engine`
- **THEN** no references exist in production code (test fixtures may reference it for migration validation)
