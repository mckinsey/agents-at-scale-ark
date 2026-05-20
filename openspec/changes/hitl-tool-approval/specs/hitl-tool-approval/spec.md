## ADDED Requirements

### Requirement: AgentTool supports approval configuration

The `AgentTool` type SHALL support an `approval` block for configuring per-tool approval requirements.

#### Scenario: Agent with approval-required tool accepted

- **WHEN** an Agent is created with a tool containing `approval.required: true`
- **THEN** the webhook SHALL accept the resource

#### Scenario: Approval config with timeout accepted

- **WHEN** an Agent is created with a tool containing `approval.required: true`, `approval.timeout: 5m`
- **THEN** the webhook SHALL accept the resource

#### Scenario: Approval config with onTimeout accepted

- **WHEN** an Agent is created with a tool containing `approval.required: true`, `approval.onTimeout: reject`
- **THEN** the webhook SHALL accept the resource

#### Scenario: Invalid onTimeout value rejected

- **WHEN** an Agent is created with a tool containing `approval.onTimeout: invalid`
- **THEN** the webhook SHALL reject the resource with error "onTimeout must be 'reject' or 'proceed'"

#### Scenario: Default onTimeout is reject

- **WHEN** an Agent is created with a tool containing `approval.required: true` without `onTimeout`
- **THEN** the default value SHALL be "reject"

#### Scenario: Agent without approval config accepted (backwards compatibility)

- **WHEN** an Agent is created with tools that have no `approval` block
- **THEN** the webhook SHALL accept the resource
- **AND** tools SHALL execute immediately without approval

### Requirement: Query supports input-required phase

The Query CRD status phase SHALL support `input-required` as a valid value, indicating the query is paused awaiting human approval for a tool call.

#### Scenario: Query enters input-required phase

- **WHEN** a Query targets an Agent with an approval-required tool
- **AND** the model returns a tool call for that tool
- **THEN** the Query status phase SHALL be set to `input-required`
- **AND** an A2ATask resource SHALL be created with `phase: input-required`

#### Scenario: Query resumes after approval

- **WHEN** a Query is in `input-required` phase
- **AND** the corresponding A2ATask is completed (approved)
- **THEN** the Query status phase SHALL transition to `running`
- **AND** the tool SHALL be executed

#### Scenario: Query fails after rejection

- **WHEN** a Query is in `input-required` phase
- **AND** the corresponding A2ATask is failed (rejected)
- **THEN** the Query status phase SHALL transition to `error`
- **AND** the Query response SHALL indicate the tool call was not executed

### Requirement: A2ATask tracks pending approvals

The system SHALL use the existing `A2ATask` CRD to track pending tool approvals with full audit trail.

#### Scenario: A2ATask created for approval-required tool

- **WHEN** a Query triggers a tool call that requires approval
- **THEN** an A2ATask resource SHALL be created with a unique name containing:
  - `spec.queryRef` referencing the Query
  - `spec.agentRef` referencing the Agent
  - `spec.contextId` referencing the conversation in memory service
  - `spec.parameters.toolCalls` containing tool call details (JSON string)
  - `spec.parameters.timeout` from the tool's approval config
  - `spec.parameters.onTimeout` from the tool's approval config
  - `spec.parameters.pendingToolCallIndex` indicating resume point
  - `spec.parameters.completedToolResults` containing results since last model call
  - `status.phase` set to `input-required`
  - `status.startTime` set to current timestamp

#### Scenario: A2ATask contains tool context for informed decisions

- **WHEN** an A2ATask is created for approval
- **THEN** `spec.parameters.toolCalls` (parsed from JSON) SHALL contain:
  - `id` — the tool call ID
  - `name` — the tool name
  - `type` — the tool type (http, mcp, etc.)
  - `arguments` — serialized arguments
  - `description` — tool description
  - `annotations` — tool annotations (destructiveHint, readOnlyHint, etc.)
  - `agentReasoning` — the model's explanation for the tool call

#### Scenario: A2ATask contains minimal execution context for resume

- **WHEN** an A2ATask is created for approval
- **THEN** `spec.contextId` SHALL reference the conversation ID in memory service
- **AND** `spec.parameters` SHALL contain:
  - `pendingToolCallIndex` — index of first pending tool
  - `completedToolResults` — results of already-executed tools (since last model call)
- **AND** conversation history SHALL be fetched from memory service on resume (NOT stored in CRD)

#### Scenario: A2ATask transitions to completed

- **WHEN** an A2ATask is in `input-required` phase
- **AND** an approval response is submitted
- **THEN** `status.phase` SHALL be set to `completed`
- **AND** `status.completionTime` SHALL be set to the current timestamp
- **AND** approval decision SHALL be recorded in task parameters or status

#### Scenario: A2ATask transitions to rejected

- **WHEN** an A2ATask is in `input-required` phase
- **AND** a rejection response is submitted
- **THEN** `status.phase` SHALL be set to `failed`
- **AND** the Query SHALL transition to `error` phase

#### Scenario: A2ATask expires on timeout with reject policy

- **WHEN** an A2ATask is in `input-required` phase
- **AND** `spec.parameters.timeout` duration elapses without a response
- **AND** `spec.parameters.onTimeout` is `reject`
- **THEN** `status.phase` SHALL be set to `failed`
- **AND** the Query SHALL transition to `error` phase

#### Scenario: A2ATask proceeds on timeout with proceed policy

- **WHEN** an A2ATask is in `input-required` phase
- **AND** `spec.parameters.timeout` duration elapses without a response
- **AND** `spec.parameters.onTimeout` is `proceed`
- **THEN** `status.phase` SHALL be set to `completed`
- **AND** the tool SHALL be executed

#### Scenario: A2ATask deleted with Query

- **WHEN** a Query is deleted
- **AND** A2ATask resources exist with that Query as owner
- **THEN** the A2ATask resources SHALL be deleted (via owner reference)

#### Scenario: Response submitted during timeout expiration (race condition)

- **WHEN** an A2ATask is in `input-required` phase
- **AND** a response is submitted at the same moment timeout expires
- **THEN** the submitted response SHALL take precedence
- **AND** `status.phase` SHALL be set based on the response (not `failed`)

### Requirement: Completions executor checks approval policy with O(1) lookup

The completions executor SHALL check approval requirements before executing each tool call, using pre-computed lookup for performance.

#### Scenario: Tool without approval config executes immediately

- **WHEN** the model returns a tool call for a tool without `approval` config
- **THEN** the executor SHALL execute the tool immediately
- **AND** no A2ATask SHALL be created

#### Scenario: Tool with approval.required: false executes immediately

- **WHEN** the model returns a tool call for a tool with `approval.required: false`
- **THEN** the executor SHALL execute the tool immediately

#### Scenario: Tool with approval.required: true pauses for approval

- **WHEN** the model returns a tool call for a tool with `approval.required: true`
- **THEN** the executor SHALL NOT execute the tool
- **AND** the executor SHALL return an ApprovalRequiredError with minimal execution context
- **AND** the Query SHALL enter `input-required` phase

#### Scenario: Multiple tools with mixed approval requirements

- **WHEN** the model returns multiple tool calls in one response
- **AND** some tools require approval and some do not
- **THEN** the executor SHALL execute tools that do not require approval
- **AND** the executor SHALL pause for approval on tools that require it
- **AND** completed tool results SHALL be stored in execution context

#### Scenario: Approval lookup is O(1)

- **WHEN** the Agent is initialized
- **THEN** approval requirements SHALL be pre-computed into a map
- **AND** checking approval requirements during tool execution SHALL be O(1) lookup

### Requirement: Batch approval for multiple tool calls

The system SHALL support batching multiple approval-required tool calls into a single A2ATask.

#### Scenario: Multiple approval-required tools batched into single task

- **WHEN** the model returns multiple tool calls in one response
- **AND** multiple tools require approval
- **THEN** a single A2ATask SHALL be created
- **AND** `spec.parameters.toolCalls` SHALL contain all approval-required tools

#### Scenario: Batch approval executes all tools

- **WHEN** an A2ATask with multiple tool calls receives an approval
- **THEN** all tools in the batch SHALL be executed

#### Scenario: Batch rejection rejects all tools

- **WHEN** an A2ATask with multiple tool calls receives a rejection
- **THEN** no tools in the batch SHALL be executed
- **AND** rejection message SHALL be returned for all tools

### Requirement: Authorization controls for approval response submission

The system SHALL enforce authorization checks when approval responses are submitted.

#### Scenario: Response by user with RBAC permission succeeds (MVP)

- **WHEN** an A2ATask is in `input-required` phase
- **AND** response is submitted by a user with A2ATask update permission (RBAC)
- **THEN** the response SHALL be accepted

#### Scenario: Response by unauthorized user rejected

- **WHEN** an A2ATask is in `input-required` phase
- **AND** response is submitted by a user WITHOUT A2ATask update permission
- **THEN** the API SHALL return HTTP 403 Forbidden

#### Scenario: Duplicate response submission rejected

- **WHEN** an A2ATask is no longer in `input-required` phase
- **AND** another response is submitted
- **THEN** the API SHALL return HTTP 409 Conflict

**Phase 2 (deferred):**
- Fine-grained authorization (e.g., `spec.approval.approvers`)
- Validation (e.g., `spec.approval.reasonRequired`)

### Requirement: Event streaming emits approval events

The system SHALL emit real-time events when approval is required and when responses are received.

#### Scenario: Approval request event emitted

- **WHEN** a Query enters `input-required` phase
- **THEN** a `ToolApprovalRequest` event SHALL be streamed to connected clients
- **AND** the event SHALL contain tool call details (name, arguments, description, annotations, timeout)

#### Scenario: Approval response event emitted

- **WHEN** an A2ATask receives an approval response
- **THEN** a `ToolApprovalResponse` event SHALL be streamed to connected clients
- **AND** the event SHALL contain the response details and duration

### Requirement: API supports approval response submission with conflict detection

The Ark API SHALL provide endpoints for submitting approval responses with conflict detection.

#### Scenario: Submit approval response via API

- **WHEN** a POST request is made to `/api/v1/namespaces/{namespace}/queries/{name}/approval`
- **AND** the request body contains `{"action": "approved", "toolCallId": "call_xyz"}`
- **AND** the A2ATask is in `input-required` phase
- **THEN** the A2ATask SHALL be updated with the approval response
- **AND** the Query SHALL resume execution
- **AND** the response SHALL contain the updated status

#### Scenario: Submit rejection response via API

- **WHEN** a POST request is made to `/api/v1/namespaces/{namespace}/queries/{name}/approval`
- **AND** the request body contains `{"action": "rejected", "toolCallId": "call_xyz"}`
- **THEN** the A2ATask SHALL be updated with the rejection
- **AND** the Query SHALL transition to `error` phase

#### Scenario: Response for wrong phase rejected

- **WHEN** a POST request is made to `/api/v1/namespaces/{namespace}/queries/{name}/approval`
- **AND** the A2ATask is NOT in `input-required` phase
- **THEN** the API SHALL return HTTP 409 Conflict
- **AND** the response SHALL indicate the task is not awaiting approval

#### Scenario: Duplicate response submission rejected

- **WHEN** a POST request is made to `/api/v1/namespaces/{namespace}/queries/{name}/approval`
- **AND** the A2ATask has already been completed or failed
- **THEN** the API SHALL return HTTP 409 Conflict
- **AND** the response SHALL indicate a response has already been submitted

### Requirement: A2A protocol uses input-required state

The A2A protocol SHALL use `input-required` task state for tool approvals (aligning with A2A standard).

#### Scenario: External executor signals approval required

- **WHEN** an external executor (via A2A) returns task state `input-required` with approval data
- **THEN** the A2ATask status phase SHALL be set to `input-required`
- **AND** the parent Query phase SHALL be set to `input-required`

#### Scenario: A2A approval request includes callback URL

- **WHEN** an external executor signals `input-required` for approval
- **THEN** the A2A message SHALL include a `callbackUrl` for response delivery
- **AND** the message MIME type SHALL be `application/vnd.ark.tool-approval-request+json`

#### Scenario: A2A task resumes after approval via callback

- **WHEN** an A2ATask is in `input-required` phase
- **AND** an approval response is submitted
- **THEN** the controller SHALL POST the response to the executor's `callbackUrl`
- **AND** the executor SHALL fetch conversation history from memory service
- **AND** the A2ATask SHALL resume execution

#### Scenario: A2A callback URL validated for SSRF

- **WHEN** an external executor provides a `callbackUrl`
- **AND** the URL points to a cluster-internal address (10.x, 192.168.x, kubernetes.default)
- **THEN** the controller SHALL reject the callback URL
- **AND** the A2ATask SHALL fail with a security error

### Requirement: Execution context fetched from memory service

The system SHALL fetch conversation history from memory service on resume, not store it in CRD.

#### Scenario: Resume fetches conversation from memory service

- **WHEN** an A2ATask is approved and executor resumes
- **THEN** the executor SHALL call `GET /messages?conversation_id={contextId}` to fetch history
- **AND** the executor SHALL apply `completedToolResults` from A2ATask parameters
- **AND** the executor SHALL continue execution from `pendingToolCallIndex`

#### Scenario: Memory service unavailable on resume

- **WHEN** an A2ATask is approved and executor attempts to resume
- **AND** the memory service is unavailable
- **THEN** the Query SHALL transition to `error` phase
- **AND** the error message SHALL indicate memory service unavailability

## MODIFIED Requirements

### Requirement: Query phase enum extended

The Query CRD `status.phase` enum SHALL be extended from `pending|running|error|done|canceled` to `pending|running|input-required|error|done|canceled`.

### Requirement: A2ATask reused for approval tracking

The existing A2ATask CRD SHALL be used to track tool approvals via `spec.parameters` with no schema changes.

#### Scenario: A2ATask parameters store approval context

- **WHEN** an A2ATask is created for approval
- **THEN** `spec.parameters.toolCalls` SHALL contain tool call details (JSON)
- **AND** `spec.parameters.pendingToolCallIndex` SHALL indicate resume point
- **AND** `spec.parameters.completedToolResults` SHALL contain tool results (JSON)

### Requirement: Completions executor fetches conversation history on resume

The completions executor SHALL fetch conversation history from memory service on resume, not from CRD.

#### Scenario: Executor resume uses memory service

- **WHEN** the executor resumes after approval
- **THEN** it SHALL call memory service `GET /messages?conversation_id={contextId}`
- **AND** it SHALL NOT deserialize conversation history from A2ATask
- **AND** it SHALL apply tool results from `spec.parameters.completedToolResults`
