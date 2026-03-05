## ADDED Requirements

### Requirement: River worker executes queries
The system SHALL implement a River worker that dequeues `query_execute` jobs and executes them using the exported execution logic from the controller package.

#### Scenario: Successful query execution
- **WHEN** a `query_execute` job is dequeued by a worker
- **THEN** the worker reads the Query resource from the PostgreSQL `resources` table using the namespace and name from the job args
- **AND** the worker calls the exported execution function from the controller package
- **AND** on success, the worker writes `phase: done`, response, token usage, and duration to the Query's status directly in PostgreSQL
- **AND** `resource_version` is incremented atomically on status write
- **AND** the LISTEN/NOTIFY trigger fires, notifying watchers

#### Scenario: Query not found
- **WHEN** a `query_execute` job is dequeued but the Query resource no longer exists in the `resources` table
- **THEN** the worker cancels the job (no retry)

### Requirement: Worker sets initial status before execution
The system SHALL transition the query to `phase: running` with appropriate conditions before beginning execution.

#### Scenario: Status set to running
- **WHEN** a worker begins processing a `query_execute` job
- **THEN** the worker writes `phase: running` and condition `QueryCompleted=False, reason=QueryRunning` to the Query status in PostgreSQL
- **AND** `resource_version` is incremented

### Requirement: Exclusive locking prevents duplicate execution
The system SHALL use River's exclusive locking to ensure only one worker processes a given query at a time.

#### Scenario: Duplicate job prevented
- **WHEN** a `query_execute` job exists for namespace/name "default/my-query"
- **AND** another `query_execute` job is enqueued for the same namespace/name
- **THEN** the duplicate job is not created (River unique constraint)

#### Scenario: Concurrent dequeue prevented
- **WHEN** worker A is processing a `query_execute` job
- **AND** worker B attempts to dequeue the same job
- **THEN** worker B skips the job (`SELECT ... FOR UPDATE SKIP LOCKED`)

### Requirement: Worker handles cancellation
The system SHALL check for query cancellation during execution.

#### Scenario: Query cancelled during execution
- **WHEN** a worker is executing a query
- **AND** the Query resource's `spec.cancel` field is set to `true`
- **THEN** the worker detects the cancellation (by re-reading the Query between execution steps)
- **AND** the worker cancels the execution context
- **AND** the worker writes `phase: canceled` to the Query status
- **AND** the River job is marked as cancelled

### Requirement: Worker constructs QueryReconciler for execution
The system SHALL construct a `QueryReconciler` value with the required dependencies (Client, Scheme, Telemetry, Eventing) to call the exported execution function.

#### Scenario: Worker has access to shared dependencies
- **WHEN** the River worker is initialized
- **THEN** it holds references to the same `client.Client`, `runtime.Scheme`, telemetry provider, and eventing provider used by the controller manager
- **AND** these are injected during River client setup
