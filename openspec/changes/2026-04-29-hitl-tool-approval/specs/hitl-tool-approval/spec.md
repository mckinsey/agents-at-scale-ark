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
  - `spec.toolCall.id` containing the tool call ID
  - `spec.toolCall.name` containing the tool name
  - `spec.toolCall.arguments` containing the serialized arguments
  - `spec.timeout` from the tool's approval config
  - `status.phase` set to `pending`

#### Scenario: ToolApprovalRequest transitions to approved

- **WHEN** a ToolApprovalRequest is in `pending` phase
- **AND** an approval decision is submitted with `action: approve`
- **THEN** `status.phase` SHALL be set to `approved`
- **AND** `status.decision.action` SHALL be set to `approved`
- **AND** `status.decision.decidedAt` SHALL be set to the current timestamp

#### Scenario: ToolApprovalRequest transitions to rejected

- **WHEN** a ToolApprovalRequest is in `pending` phase
- **AND** an approval decision is submitted with `action: reject`
- **THEN** `status.phase` SHALL be set to `rejected`
- **AND** `status.decision.action` SHALL be set to `rejected`

#### Scenario: ToolApprovalRequest expires on timeout

- **WHEN** a ToolApprovalRequest is in `pending` phase
- **AND** `spec.timeout` duration elapses without a decision
- **AND** `spec.onTimeout` is `reject`
- **THEN** `status.phase` SHALL be set to `expired`
- **AND** the Query SHALL transition to `error` phase

#### Scenario: ToolApprovalRequest proceeds on timeout

- **WHEN** a ToolApprovalRequest is in `pending` phase
- **AND** `spec.timeout` duration elapses without a decision
- **AND** `spec.onTimeout` is `proceed`
- **THEN** `status.phase` SHALL be set to `approved`
- **AND** the tool SHALL be executed

#### Scenario: ToolApprovalRequest deleted with Query

- **WHEN** a Query is deleted
- **AND** ToolApprovalRequest resources exist with that Query as owner
- **THEN** the ToolApprovalRequest resources SHALL be deleted (via owner reference)

### Requirement: Completions executor checks approval policy

The completions executor SHALL check approval requirements before executing each tool call.

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
- **AND** the executor SHALL return an ApprovalRequiredError
- **AND** the Query SHALL enter `approval-required` phase

#### Scenario: Multiple tools with mixed approval requirements

- **WHEN** the model returns multiple tool calls in one response
- **AND** some tools require approval and some do not
- **THEN** the executor SHALL execute tools that do not require approval
- **AND** the executor SHALL pause for approval on tools that require it

### Requirement: Event streaming emits approval events

The system SHALL emit real-time events when approval is required and when decisions are made.

#### Scenario: Approval request event emitted

- **WHEN** a Query enters `approval-required` phase
- **THEN** a `ToolApprovalRequest` event SHALL be streamed to connected clients
- **AND** the event SHALL contain tool call details (name, arguments, timeout)

#### Scenario: Approval decision event emitted

- **WHEN** a ToolApprovalRequest is approved or rejected
- **THEN** a `ToolApprovalDecision` event SHALL be streamed to connected clients
- **AND** the event SHALL contain the decision and reason

### Requirement: API supports approval submission

The Ark API SHALL provide endpoints for submitting approval decisions.

#### Scenario: Submit approval via API

- **WHEN** a POST request is made to `/api/v1/namespaces/{ns}/queries/{name}/approval`
- **AND** the request body contains `{"toolCallId": "...", "action": "approve"}`
- **AND** the Query is in `approval-required` phase
- **THEN** the ToolApprovalRequest SHALL be updated with the approval
- **AND** the response SHALL contain the updated Query status

#### Scenario: Submit rejection via API

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

### Requirement: A2A protocol supports tool-approval-required state

The A2A protocol SHALL support `tool-approval-required` as a task state for external executor HITL support.

#### Scenario: External executor signals approval required

- **WHEN** an external executor (via A2A) returns task state `tool-approval-required`
- **THEN** the A2ATask status phase SHALL be set to `tool-approval-required`
- **AND** the parent Query phase SHALL be set to `approval-required`

#### Scenario: A2A task resumes after approval

- **WHEN** an A2ATask is in `tool-approval-required` phase
- **AND** approval is submitted
- **THEN** the controller SHALL send approval to the external executor
- **AND** the A2ATask SHALL resume execution

## MODIFIED Requirements

### Requirement: Query phase enum extended

The Query CRD `status.phase` enum SHALL be extended from `pending|running|error|done|canceled` to `pending|running|approval-required|error|done|canceled`.

### Requirement: A2ATask phase enum extended

The A2ATask CRD `status.phase` enum SHALL be extended to include `tool-approval-required` alongside existing `input-required` and `auth-required`.
