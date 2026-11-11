# hitl-approval-cli

## Purpose

Lets users list and respond to pending tool-approval requests from the ark CLI, so terminal-based and scripted workflows can approve or reject sensitive tool calls without opening the dashboard or calling the raw API.

## Requirements

### Requirement: CLI lists pending tool approvals

The ark CLI SHALL provide a command to list tool-approval requests currently awaiting a human decision (queries/tasks in the `input-required` phase) within a namespace.

#### Scenario: List pending approvals

- **WHEN** the user runs the list command and one or more tasks are awaiting approval
- **THEN** the CLI SHALL display each pending approval with its task name, the agent, the tool call(s) awaiting approval, and the approval expiry

#### Scenario: No pending approvals

- **WHEN** the user runs the list command and no tasks are awaiting approval
- **THEN** the CLI SHALL report that there are no pending approvals and exit successfully

### Requirement: CLI approves a pending tool call

The ark CLI SHALL provide a command to approve a pending tool-approval request by task name, submitting an `approved` decision to the approval endpoint.

#### Scenario: Approve a pending request

- **WHEN** the user runs the approve command for a task in the `input-required` phase
- **THEN** the CLI SHALL submit an `approved` decision and report success

#### Scenario: Approve a task not awaiting approval

- **WHEN** the user runs the approve command for a task that is not in the `input-required` phase
- **THEN** the CLI SHALL report that the task is not awaiting approval and exit non-zero

### Requirement: CLI rejects a pending tool call

The ark CLI SHALL provide a command to reject a pending tool-approval request by task name, submitting a `rejected` decision to the approval endpoint.

#### Scenario: Reject a pending request

- **WHEN** the user runs the reject command for a task in the `input-required` phase
- **THEN** the CLI SHALL submit a `rejected` decision and report success

### Requirement: CLI reports approval submission failures

The ark CLI SHALL surface errors from the approval endpoint to the user rather than failing silently.

#### Scenario: Task not found

- **WHEN** the user runs approve or reject for a task name that does not exist
- **THEN** the CLI SHALL report that the task was not found and exit non-zero

#### Scenario: Endpoint returns an error

- **WHEN** the approval endpoint returns an error response
- **THEN** the CLI SHALL display the error and exit non-zero
