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

### Requirement: Query supports interaction-required phase

The Query CRD status phase SHALL support `interaction-required` as a valid value, indicating the query is paused awaiting human interaction (approval, input, selection, or confirmation) for a tool call.

#### Scenario: Query enters interaction-required phase

- **WHEN** a Query targets an Agent with an interaction-required tool
- **AND** the model returns a tool call for that tool
- **THEN** the Query status phase SHALL be set to `interaction-required`
- **AND** a ToolInteraction resource SHALL be created with a unique name (ti-{query-name}-{timestamp})

#### Scenario: Query resumes after approval

- **WHEN** a Query is in `interaction-required` phase
- **AND** the corresponding ToolInteraction is completed (approved/confirmed)
- **THEN** the Query status phase SHALL transition to `running`
- **AND** the tool SHALL be executed

#### Scenario: Query fails after rejection

- **WHEN** a Query is in `interaction-required` phase
- **AND** the corresponding ToolInteraction is rejected
- **THEN** the Query status phase SHALL transition to `error`
- **AND** the Query response SHALL indicate the tool call was rejected

### Requirement: ToolInteraction CRD tracks pending interactions

The system SHALL provide a `ToolInteraction` CRD to track pending human-in-the-loop interactions with full audit trail. ToolInteraction supports four types: approval, input, selection, and confirmation.

#### Scenario: ToolInteraction created for interaction-required tool

- **WHEN** a Query triggers a tool call that requires human interaction
- **THEN** a ToolInteraction resource SHALL be created with a unique name (ti-{query-name}-{timestamp}) containing:
  - `spec.queryRef` referencing the Query
  - `spec.type` indicating the interaction type (approval, input, selection, confirmation)
  - `spec.toolCalls` array containing tool call details
  - `spec.timeout` from the tool's interaction config
  - `spec.approval.approvers` from the tool's approval config (for approval type)
  - `spec.executionContext` containing serialized conversation state
  - `status.phase` set to `pending`
  - `status.requestedAt` set to current timestamp

#### Scenario: ToolInteraction contains tool context for informed decisions

- **WHEN** a ToolInteraction is created
- **THEN** each entry in `spec.toolCalls` SHALL contain:
  - `id` — the tool call ID
  - `name` — the tool name
  - `type` — the tool type (http, mcp, etc.)
  - `arguments` — serialized arguments
  - `description` — tool description
  - `annotations` — tool annotations (destructiveHint, readOnlyHint, etc.)
  - `agentReasoning` — the model's explanation for the tool call

#### Scenario: ToolInteraction contains execution context for resume

- **WHEN** a ToolInteraction is created
- **THEN** `spec.executionContext` SHALL contain:
  - `conversationHistory` — serialized message array
  - `pendingToolCallIndex` — index of first pending tool
  - `completedToolResults` — results of already-executed tools
  - `agentName` and `agentNamespace` — agent identity

#### Scenario: ToolInteraction transitions to completed

- **WHEN** a ToolInteraction is in `pending` phase
- **AND** a response is submitted (approval action, input data, selection, or confirmation)
- **THEN** `status.phase` SHALL be set to `completed`
- **AND** `status.response.respondedAt` SHALL be set to the current timestamp
- **AND** `status.response.respondedBy` SHALL be set to the user identity
- **AND** `status.responseDuration` SHALL be set to the time since `requestedAt`

#### Scenario: ToolInteraction transitions to rejected

- **WHEN** a ToolInteraction is in `pending` phase
- **AND** a rejection response is submitted (action: rejected for approval, confirmed: false for confirmation)
- **THEN** `status.phase` SHALL be set to `rejected`

#### Scenario: ToolInteraction expires on timeout with reject policy

- **WHEN** a ToolInteraction is in `pending` phase
- **AND** `spec.timeout` duration elapses without a response
- **AND** `spec.onTimeout` is `reject`
- **THEN** `status.phase` SHALL be set to `expired`
- **AND** the Query SHALL transition to `error` phase

#### Scenario: ToolInteraction proceeds on timeout with proceed policy

- **WHEN** a ToolInteraction is in `pending` phase
- **AND** `spec.timeout` duration elapses without a response
- **AND** `spec.onTimeout` is `proceed`
- **THEN** `status.phase` SHALL be set to `completed`
- **AND** the tool SHALL be executed

#### Scenario: ToolInteraction deleted with Query

- **WHEN** a Query is deleted
- **AND** ToolInteraction resources exist with that Query as owner
- **THEN** the ToolInteraction resources SHALL be deleted (via owner reference)

#### Scenario: Response submitted during timeout expiration (race condition)

- **WHEN** a ToolInteraction is in `pending` phase
- **AND** a response is submitted at the same moment timeout expires
- **THEN** the submitted response SHALL take precedence
- **AND** `status.phase` SHALL be set based on the response (not `expired`)

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

### Requirement: Authorization controls for interaction response submission

The system SHALL enforce authorization checks when interaction responses are submitted.

#### Scenario: Response by authorized role succeeds

- **WHEN** a ToolInteraction has `spec.approval.approvers: [{role: admin}]`
- **AND** response is submitted by a user with admin role
- **THEN** the response SHALL be accepted

#### Scenario: Response by authorized user succeeds

- **WHEN** a ToolInteraction has `spec.approval.approvers: [{user: ops@example.com}]`
- **AND** response is submitted by ops@example.com
- **THEN** the response SHALL be accepted

#### Scenario: Response by authorized group succeeds

- **WHEN** a ToolInteraction has `spec.approval.approvers: [{group: platform-admins}]`
- **AND** response is submitted by a user in the platform-admins group
- **THEN** the response SHALL be accepted

#### Scenario: Response by unauthorized user rejected

- **WHEN** a ToolInteraction has `spec.approval.approvers: [{role: admin}]`
- **AND** response is submitted by a user WITHOUT admin role
- **THEN** the API SHALL return HTTP 403 Forbidden

#### Scenario: Response without approvers list allows any authorized user

- **WHEN** a ToolInteraction has no `spec.approval.approvers` field
- **AND** response is submitted by a user with ToolInteraction update permission
- **THEN** the response SHALL be accepted

#### Scenario: Rejection without required reason rejected

- **WHEN** a ToolInteraction has `spec.approval.reasonRequired: true`
- **AND** rejection is submitted without a reason
- **THEN** the API SHALL return HTTP 400 Bad Request

#### Scenario: Duplicate response submission rejected

- **WHEN** a ToolInteraction already has a `status.response` set
- **AND** another response is submitted
- **THEN** the API SHALL return HTTP 409 Conflict

### Requirement: Event streaming emits interaction events

The system SHALL emit real-time events when human interaction is required and when responses are received.

#### Scenario: Interaction request event emitted

- **WHEN** a Query enters `interaction-required` phase
- **THEN** a `ToolInteraction` event SHALL be streamed to connected clients
- **AND** the event SHALL contain tool call details (name, arguments, description, annotations, timeout)

#### Scenario: Interaction response event emitted

- **WHEN** a ToolInteraction receives a response (approved, rejected, input provided, etc.)
- **THEN** a `ToolInteractionResponse` event SHALL be streamed to connected clients
- **AND** the event SHALL contain the response details and duration

### Requirement: API supports interaction response submission with conflict detection

The Ark API SHALL provide endpoints for submitting interaction responses with conflict detection.

#### Scenario: Submit approval response via API

- **WHEN** a POST request is made to `/api/v1/tool-approvals/{name}/decision`
- **AND** the request body contains `{"action": "approved"}`
- **AND** the ToolInteraction is in `pending` phase
- **THEN** the ToolInteraction SHALL be updated with the approval response
- **AND** the response SHALL contain the updated status

#### Scenario: Submit rejection response with reason via API

- **WHEN** a POST request is made to `/api/v1/tool-approvals/{name}/decision`
- **AND** the request body contains `{"action": "rejected", "reason": "..."}`
- **THEN** the ToolInteraction SHALL be updated with the rejection
- **AND** the reason SHALL be recorded in `status.response.approval.reason`

#### Scenario: Response for wrong phase rejected

- **WHEN** a POST request is made to `/api/v1/tool-approvals/{name}/decision`
- **AND** the ToolInteraction is NOT in `pending` phase
- **THEN** the API SHALL return HTTP 409 Conflict
- **AND** the response SHALL indicate the interaction is not pending

#### Scenario: Duplicate response submission rejected

- **WHEN** a POST request is made to `/api/v1/tool-approvals/{name}/decision`
- **AND** the ToolInteraction already has a `status.response` set
- **THEN** the API SHALL return HTTP 409 Conflict
- **AND** the response SHALL indicate a response has already been submitted

### Requirement: A2A protocol supports tool-interaction-required state

The A2A protocol SHALL support `tool-interaction-required` as a task state for external executor HITL support.

#### Scenario: External executor signals interaction required

- **WHEN** an external executor (via A2A) returns task state `tool-interaction-required`
- **THEN** the A2ATask status phase SHALL be set to `tool-interaction-required`
- **AND** the parent Query phase SHALL be set to `interaction-required`

#### Scenario: A2A interaction request includes callback URL

- **WHEN** an external executor signals `tool-interaction-required`
- **THEN** the A2A message SHALL include a `callbackUrl` for response delivery

#### Scenario: A2A task resumes after response via callback

- **WHEN** an A2ATask is in `tool-interaction-required` phase
- **AND** a response is submitted
- **THEN** the controller SHALL POST the response to the executor's `callbackUrl`
- **AND** the A2ATask SHALL resume execution

#### Scenario: A2A callback URL validated for SSRF

- **WHEN** an external executor provides a `callbackUrl`
- **AND** the URL points to a cluster-internal address (10.x, 192.168.x, kubernetes.default)
- **THEN** the controller SHALL reject the callback URL
- **AND** the A2ATask SHALL fail with a security error

### Requirement: Execution context size is validated

The system SHALL validate that execution context does not exceed safe storage limits.

#### Scenario: Large execution context rejected

- **WHEN** a ToolInteraction would be created with `executionContext` exceeding size threshold
- **THEN** the system SHALL implement conversation truncation
- **OR** the system SHALL store context reference to external storage
- **AND** the ToolInteraction SHALL not exceed etcd's per-object size limit

## MODIFIED Requirements

### Requirement: Query phase enum extended

The Query CRD `status.phase` enum SHALL be extended from `pending|running|error|done|canceled` to `pending|running|interaction-required|error|done|canceled`.

### Requirement: A2ATask phase enum extended

The A2ATask CRD `status.phase` enum SHALL be extended to include `tool-interaction-required` alongside existing `input-required` and `auth-required`.

### Requirement: Audit trail includes timing and client context

The ToolInteraction status SHALL include audit information beyond basic response data.

#### Scenario: Audit trail includes request timestamp

- **WHEN** a ToolInteraction is created
- **THEN** `status.requestedAt` SHALL be set to the creation timestamp

#### Scenario: Audit trail includes response duration

- **WHEN** a ToolInteraction receives a response
- **THEN** `status.responseDuration` SHALL be set to the time between `requestedAt` and `respondedAt`

#### Scenario: Audit trail includes client context

- **WHEN** an interaction response is submitted
- **THEN** `status.response.clientContext` SHALL include:
  - `ipAddress` — the client IP address
  - `userAgent` — the client user agent string
