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

#### Scenario: Approval config with approvers accepted

- **WHEN** an Agent is created with a tool containing `approval.approvers: [{role: admin}, {user: ops@example.com}]`
- **THEN** the webhook SHALL accept the resource

#### Scenario: Approval config with reasonRequired accepted

- **WHEN** an Agent is created with a tool containing `approval.reasonRequired: true`
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

### Requirement: Query supports approval-required phase

The Query CRD status phase SHALL support `approval-required` as a valid value, indicating the query is paused awaiting human approval for a tool call.

#### Scenario: Query enters approval-required phase

- **WHEN** a Query targets an Agent with an approval-required tool
- **AND** the model returns a tool call for that tool
- **THEN** the Query status phase SHALL be set to `approval-required`
- **AND** a ToolApprovalRequest resource SHALL be created

#### Scenario: Query resumes after approval

- **WHEN** a Query is in `approval-required` phase
- **AND** the corresponding ToolApprovalRequest is approved
- **THEN** the Query status phase SHALL transition to `running`
- **AND** the tool SHALL be executed

#### Scenario: Query fails after rejection

- **WHEN** a Query is in `approval-required` phase
- **AND** the corresponding ToolApprovalRequest is rejected
- **THEN** the Query status phase SHALL transition to `error`
- **AND** the Query response SHALL indicate the tool call was rejected

### Requirement: ToolApprovalRequest CRD tracks pending approvals

The system SHALL provide a `ToolApprovalRequest` CRD to track pending tool call approvals with full audit trail.

#### Scenario: ToolApprovalRequest created for approval-required tool

- **WHEN** a Query triggers a tool call that requires approval
- **THEN** a ToolApprovalRequest resource SHALL be created with:
  - `spec.queryRef` referencing the Query
  - `spec.toolCalls` array containing tool call details
  - `spec.timeout` from the tool's approval config
  - `spec.approvers` from the tool's approval config
  - `spec.executionContext` containing serialized conversation state
  - `status.phase` set to `pending`
  - `status.requestedAt` set to current timestamp

#### Scenario: ToolApprovalRequest contains tool context for informed decisions

- **WHEN** a ToolApprovalRequest is created
- **THEN** each entry in `spec.toolCalls` SHALL contain:
  - `id` — the tool call ID
  - `name` — the tool name
  - `type` — the tool type (http, mcp, etc.)
  - `arguments` — serialized arguments
  - `description` — tool description
  - `annotations` — tool annotations (destructiveHint, readOnlyHint, etc.)
  - `agentReasoning` — the model's explanation for the tool call

#### Scenario: ToolApprovalRequest contains execution context for resume

- **WHEN** a ToolApprovalRequest is created
- **THEN** `spec.executionContext` SHALL contain:
  - `conversationHistory` — serialized message array
  - `pendingToolCallIndex` — index of first pending tool
  - `completedToolResults` — results of already-executed tools
  - `agentName` and `agentNamespace` — agent identity

#### Scenario: ToolApprovalRequest transitions to approved

- **WHEN** a ToolApprovalRequest is in `pending` phase
- **AND** an approval decision is submitted with `action: approve`
- **THEN** `status.phase` SHALL be set to `approved`
- **AND** `status.decision.action` SHALL be set to `approved`
- **AND** `status.decision.decidedAt` SHALL be set to the current timestamp
- **AND** `status.approvalDuration` SHALL be set to the time since `requestedAt`

#### Scenario: ToolApprovalRequest transitions to rejected

- **WHEN** a ToolApprovalRequest is in `pending` phase
- **AND** an approval decision is submitted with `action: reject`
- **THEN** `status.phase` SHALL be set to `rejected`
- **AND** `status.decision.action` SHALL be set to `rejected`

#### Scenario: ToolApprovalRequest expires on timeout with reject policy

- **WHEN** a ToolApprovalRequest is in `pending` phase
- **AND** `spec.timeout` duration elapses without a decision
- **AND** `spec.onTimeout` is `reject`
- **THEN** `status.phase` SHALL be set to `expired`
- **AND** the Query SHALL transition to `error` phase

#### Scenario: ToolApprovalRequest proceeds on timeout with proceed policy

- **WHEN** a ToolApprovalRequest is in `pending` phase
- **AND** `spec.timeout` duration elapses without a decision
- **AND** `spec.onTimeout` is `proceed`
- **THEN** `status.phase` SHALL be set to `approved`
- **AND** the tool SHALL be executed

#### Scenario: ToolApprovalRequest deleted with Query

- **WHEN** a Query is deleted
- **AND** ToolApprovalRequest resources exist with that Query as owner
- **THEN** the ToolApprovalRequest resources SHALL be deleted (via owner reference)

#### Scenario: Approval submitted during timeout expiration (race condition)

- **WHEN** a ToolApprovalRequest is in `pending` phase
- **AND** approval is submitted at the same moment timeout expires
- **THEN** the approval decision SHALL take precedence
- **AND** `status.phase` SHALL be set to `approved` (not `expired`)

### Requirement: Completions executor checks approval policy with O(1) lookup

The completions executor SHALL check approval requirements before executing each tool call, using pre-computed lookup for performance.

#### Scenario: Tool without approval config executes immediately

- **WHEN** the model returns a tool call for a tool without `approval` config
- **THEN** the executor SHALL execute the tool immediately
- **AND** no ToolApprovalRequest SHALL be created

#### Scenario: Tool with approval.required: false executes immediately

- **WHEN** the model returns a tool call for a tool with `approval.required: false`
- **THEN** the executor SHALL execute the tool immediately

#### Scenario: Tool with approval.required: true pauses for approval

- **WHEN** the model returns a tool call for a tool with `approval.required: true`
- **THEN** the executor SHALL NOT execute the tool
- **AND** the executor SHALL return an ApprovalRequiredError with full execution context
- **AND** the Query SHALL enter `approval-required` phase

#### Scenario: Multiple tools with mixed approval requirements

- **WHEN** the model returns multiple tool calls in one response
- **AND** some tools require approval and some do not
- **THEN** the executor SHALL execute tools that do not require approval
- **AND** the executor SHALL pause for approval on tools that require it
- **AND** completed tool results SHALL be stored in execution context

#### Scenario: Approval lookup is O(1)

- **WHEN** the Agent is initialized
- **THEN** approval requirements SHALL be pre-computed into a map
- **AND** checking approval during tool execution SHALL be O(1) lookup

### Requirement: Batch approval for multiple tool calls

The system SHALL support batching multiple approval-required tool calls into a single ToolApprovalRequest.

#### Scenario: Multiple approval-required tools batched into single request

- **WHEN** the model returns multiple tool calls in one response
- **AND** multiple tools require approval
- **THEN** a single ToolApprovalRequest SHALL be created
- **AND** `spec.toolCalls` SHALL contain all approval-required tools

#### Scenario: Batch approval approves all tools

- **WHEN** a ToolApprovalRequest with multiple `toolCalls` is approved
- **THEN** all tools in the batch SHALL be executed

#### Scenario: Batch rejection rejects all tools

- **WHEN** a ToolApprovalRequest with multiple `toolCalls` is rejected
- **THEN** no tools in the batch SHALL be executed
- **AND** rejection message SHALL be returned for all tools

### Requirement: Authorization controls for approval submission

The system SHALL enforce authorization checks when approval decisions are submitted.

#### Scenario: Approval by authorized role succeeds

- **WHEN** a ToolApprovalRequest has `spec.approvers: [{role: admin}]`
- **AND** approval is submitted by a user with admin role
- **THEN** the approval SHALL be accepted

#### Scenario: Approval by authorized user succeeds

- **WHEN** a ToolApprovalRequest has `spec.approvers: [{user: ops@example.com}]`
- **AND** approval is submitted by ops@example.com
- **THEN** the approval SHALL be accepted

#### Scenario: Approval by authorized group succeeds

- **WHEN** a ToolApprovalRequest has `spec.approvers: [{group: platform-admins}]`
- **AND** approval is submitted by a user in the platform-admins group
- **THEN** the approval SHALL be accepted

#### Scenario: Approval by unauthorized user rejected

- **WHEN** a ToolApprovalRequest has `spec.approvers: [{role: admin}]`
- **AND** approval is submitted by a user WITHOUT admin role
- **THEN** the API SHALL return HTTP 403 Forbidden

#### Scenario: Approval without approvers list allows any authorized user

- **WHEN** a ToolApprovalRequest has no `spec.approvers` field
- **AND** approval is submitted by a user with ToolApprovalRequest update permission
- **THEN** the approval SHALL be accepted

#### Scenario: Rejection without required reason rejected

- **WHEN** a ToolApprovalRequest has `spec.reasonRequired: true`
- **AND** rejection is submitted without a reason
- **THEN** the API SHALL return HTTP 400 Bad Request

### Requirement: Event streaming emits approval events

The system SHALL emit real-time events when approval is required and when decisions are made.

#### Scenario: Approval request event emitted

- **WHEN** a Query enters `approval-required` phase
- **THEN** a `ToolApprovalRequest` event SHALL be streamed to connected clients
- **AND** the event SHALL contain tool call details (name, arguments, description, annotations, timeout)

#### Scenario: Approval decision event emitted

- **WHEN** a ToolApprovalRequest is approved or rejected
- **THEN** a `ToolApprovalDecision` event SHALL be streamed to connected clients
- **AND** the event SHALL contain the decision, reason, and duration

### Requirement: API supports approval submission with optimistic locking

The Ark API SHALL provide endpoints for submitting approval decisions with conflict detection.

#### Scenario: Submit approval via API

- **WHEN** a POST request is made to `/api/v1/namespaces/{ns}/queries/{name}/approval`
- **AND** the request body contains `{"toolCallId": "...", "action": "approve"}`
- **AND** the Query is in `approval-required` phase
- **THEN** the ToolApprovalRequest SHALL be updated with the approval
- **AND** the response SHALL contain the updated Query status

#### Scenario: Submit batch approval via API

- **WHEN** a POST request is made to `/api/v1/namespaces/{ns}/queries/{name}/approval`
- **AND** the request body contains `{"toolCallIds": ["id1", "id2"], "action": "approve"}`
- **THEN** all specified tool calls SHALL be approved

#### Scenario: Submit rejection with reason via API

- **WHEN** a POST request is made to `/api/v1/namespaces/{ns}/queries/{name}/approval`
- **AND** the request body contains `{"toolCallId": "...", "action": "reject", "reason": "..."}`
- **THEN** the ToolApprovalRequest SHALL be updated with the rejection
- **AND** the reason SHALL be recorded in `status.decision.reason`

#### Scenario: Approval for wrong phase rejected

- **WHEN** a POST request is made to `/api/v1/namespaces/{ns}/queries/{name}/approval`
- **AND** the Query is NOT in `approval-required` phase
- **THEN** the API SHALL return HTTP 409 Conflict
- **AND** the response SHALL indicate the query is not awaiting approval

#### Scenario: Approval for unknown tool call rejected

- **WHEN** a POST request is made to `/api/v1/namespaces/{ns}/queries/{name}/approval`
- **AND** the `toolCallId` does not match any pending ToolApprovalRequest
- **THEN** the API SHALL return HTTP 404 Not Found

#### Scenario: Approval with stale generation rejected (optimistic locking)

- **WHEN** a POST request is made to `/api/v1/namespaces/{ns}/queries/{name}/approval`
- **AND** the ToolApprovalRequest has been modified since the client read it
- **THEN** the API SHALL return HTTP 409 Conflict
- **AND** the response SHALL indicate a generation mismatch

### Requirement: A2A protocol supports tool-approval-required state

The A2A protocol SHALL support `tool-approval-required` as a task state for external executor HITL support.

#### Scenario: External executor signals approval required

- **WHEN** an external executor (via A2A) returns task state `tool-approval-required`
- **THEN** the A2ATask status phase SHALL be set to `tool-approval-required`
- **AND** the parent Query phase SHALL be set to `approval-required`

#### Scenario: A2A approval request includes callback URL

- **WHEN** an external executor signals `tool-approval-required`
- **THEN** the A2A message SHALL include a `callbackUrl` for approval delivery

#### Scenario: A2A task resumes after approval via callback

- **WHEN** an A2ATask is in `tool-approval-required` phase
- **AND** approval is submitted
- **THEN** the controller SHALL POST the approval decision to the executor's `callbackUrl`
- **AND** the A2ATask SHALL resume execution

#### Scenario: A2A callback URL validated for SSRF

- **WHEN** an external executor provides a `callbackUrl`
- **AND** the URL points to a cluster-internal address (10.x, 192.168.x, kubernetes.default)
- **THEN** the controller SHALL reject the callback URL
- **AND** the A2ATask SHALL fail with a security error

### Requirement: Execution context size is validated

The system SHALL validate that execution context does not exceed safe storage limits.

#### Scenario: Large execution context rejected

- **WHEN** a ToolApprovalRequest would be created with `executionContext` exceeding size threshold
- **THEN** the system SHALL implement conversation truncation
- **OR** the system SHALL store context reference to external storage
- **AND** the ToolApprovalRequest SHALL not exceed etcd's per-object size limit

## MODIFIED Requirements

### Requirement: Query phase enum extended

The Query CRD `status.phase` enum SHALL be extended from `pending|running|error|done|canceled` to `pending|running|approval-required|error|done|canceled`.

### Requirement: A2ATask phase enum extended

The A2ATask CRD `status.phase` enum SHALL be extended to include `tool-approval-required` alongside existing `input-required` and `auth-required`.

### Requirement: Audit trail includes timing and client context

The ToolApprovalRequest status SHALL include audit information beyond basic decision data.

#### Scenario: Audit trail includes request timestamp

- **WHEN** a ToolApprovalRequest is created
- **THEN** `status.requestedAt` SHALL be set to the creation timestamp

#### Scenario: Audit trail includes approval duration

- **WHEN** a ToolApprovalRequest is approved or rejected
- **THEN** `status.approvalDuration` SHALL be set to the time between `requestedAt` and `decidedAt`

#### Scenario: Audit trail includes client context

- **WHEN** an approval decision is submitted
- **THEN** `status.decision.clientContext` SHALL include:
  - `ipAddress` — the client IP address
  - `userAgent` — the client user agent string
