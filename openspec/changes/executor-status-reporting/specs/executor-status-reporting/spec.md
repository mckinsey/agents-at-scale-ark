## ADDED Requirements

### Requirement: Standardized executor state vocabulary
The Ark SDK SHALL define an `ExecutorState` enum with the following values: `initializing`, `working`, `completed`, `failed`, `canceled`. All executors reporting status MUST use these enum values in the `state` field. The `message` field SHALL be freeform text for human-readable display.

#### Scenario: Executor reports initializing state
- **WHEN** an executor begins provisioning session infrastructure
- **THEN** the executor SHALL call `report_status(ExecutorState.INITIALIZING, "Initializing session")` which sets the A2A Task status metadata with the standardized state value

#### Scenario: Executor reports working state
- **WHEN** session infrastructure is ready and agent execution begins
- **THEN** the executor SHALL call `report_status(ExecutorState.WORKING, "Processing")` to update the A2A Task status metadata

#### Scenario: Executor uses non-standard state value
- **WHEN** an executor passes a string not in the `ExecutorState` enum to `report_status()`
- **THEN** the SDK SHALL raise a `ValueError`

### Requirement: BaseExecutor report_status method
The Ark SDK `BaseExecutor` class SHALL expose a `report_status(state, message)` method. `ExecutorApp` SHALL inject the mechanism to propagate status into A2A Task metadata before calling `execute_agent()`. Executors call `report_status()` during execution to signal state transitions.

#### Scenario: Executor calls report_status during execution
- **WHEN** an executor calls `self.report_status(ExecutorState.INITIALIZING, "Initializing session")` inside `execute_agent()`
- **THEN** the A2A Task status metadata at key `{QueryExtensionURI}/status` SHALL be updated with `{"state": "initializing", "message": "Initializing session"}`

#### Scenario: Executor does not call report_status
- **WHEN** an executor completes `execute_agent()` without calling `report_status()`
- **THEN** no `{QueryExtensionURI}/status` metadata SHALL be set and the Query CR SHALL have no `executorStatus` field

### Requirement: Query CRD executorStatus field
The Query CRD `QueryStatus` SHALL include an `executorStatus` field with `state` (string), `message` (string), and `updatedAt` (timestamp). This field SHALL only be populated when the executor reports status via the A2A Query Extension.

#### Scenario: Operator receives executor status from A2A Task
- **WHEN** the operator polls `GetTask` and the Task metadata contains `{QueryExtensionURI}/status`
- **THEN** the operator SHALL write the status to `Query.status.executorStatus` with the current timestamp in `updatedAt`

#### Scenario: Query reaches terminal phase
- **WHEN** a Query transitions to `done`, `error`, or `canceled`
- **THEN** the last `executorStatus` SHALL be preserved on the Query CR for post-mortem inspection

### Requirement: Non-blocking A2A dispatch with task polling
The operator SHALL send `SendMessage` with `blocking: false` to external execution engines. The operator SHALL poll `GetTask` at regular intervals (3-5 seconds) until the Task reaches a terminal state (`completed` or `failed`). On each poll, the operator SHALL extract executor status from Task metadata and update the Query CR.

#### Scenario: Executor returns non-terminal Task
- **WHEN** `SendMessage(blocking: false)` returns a Task with `state: working`
- **THEN** the operator SHALL extract executor status from Task metadata, write it to the Query CR, and requeue for polling after 3-5 seconds

#### Scenario: Task reaches completed state
- **WHEN** `GetTask` returns a Task with `state: completed`
- **THEN** the operator SHALL extract the response from Task history, write `Query.status.response`, and set `Query.status.phase = done`

#### Scenario: Task reaches failed state
- **WHEN** `GetTask` returns a Task with `state: failed`
- **THEN** the operator SHALL extract the error from Task status message, write it to `Query.status.response`, and set `Query.status.phase = error`

#### Scenario: GetTask poll fails transiently
- **WHEN** a `GetTask` HTTP call fails due to a transient error (timeout, connection reset)
- **THEN** the operator SHALL retry on the next requeue interval without marking the Query as errored

### Requirement: Dashboard displays executor status
The dashboard SHALL display the executor status message as a subtitle under the phase badge when `executorStatus.state` is present and the Query phase is `running`.

#### Scenario: Query is running with initializing executor status
- **WHEN** a Query has `phase: running` and `executorStatus.state: initializing`
- **THEN** the dashboard SHALL display "Initializing session..." (or the executor's message) below the "Running" phase badge

#### Scenario: Query is running with no executor status
- **WHEN** a Query has `phase: running` and no `executorStatus` field
- **THEN** the dashboard SHALL display the "Running" phase badge with no subtitle (current behavior)

### Requirement: Ark CLI displays executor status
The Ark CLI SHALL display the executor status message as a status line during query polling, before the response is available.

#### Scenario: CLI polls query with initializing executor status
- **WHEN** the CLI polls a Query with `executorStatus.state: initializing`
- **THEN** the CLI SHALL display the executor status message (e.g., "Initializing session...")

### Requirement: Fark CLI displays executor status
The Fark CLI query watcher SHALL include the executor status message in its spinner text, with an elapsed timer.

#### Scenario: Fark watches query with initializing executor status
- **WHEN** the Fark query watcher observes `executorStatus.state: initializing`
- **THEN** the spinner text SHALL display the executor status message with elapsed time (e.g., "Initializing session... (12s)")

### Requirement: REST API exposes executor status
The REST API SHALL include `executorStatus` in query status responses when present.

#### Scenario: API returns query with executor status
- **WHEN** a client requests a Query that has `executorStatus` set
- **THEN** the API response SHALL include `executorStatus` with `state`, `message`, and `updatedAt` fields in the query status object
