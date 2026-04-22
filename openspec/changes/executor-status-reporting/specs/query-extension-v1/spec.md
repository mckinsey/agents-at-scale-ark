## ADDED Requirements

### Requirement: Status metadata key for executor-to-operator flow
The Query Extension (`query/v1`) SHALL define a new metadata key `{QueryExtensionURI}/status` for executors to report state back to the operator via A2A Task metadata. The existing `{QueryExtensionURI}/ref` key SHALL remain unchanged.

#### Scenario: Executor sets status metadata on Task
- **WHEN** an executor calls `report_status()` during execution
- **THEN** the A2A Task status metadata SHALL contain `{QueryExtensionURI}/status` with a JSON object containing `state` (string from ExecutorState enum) and `message` (freeform string)

#### Scenario: Operator reads status metadata from Task
- **WHEN** the operator receives a Task response (from `SendMessage` or `GetTask`) containing `{QueryExtensionURI}/status` in the Task status metadata
- **THEN** the operator SHALL extract the status object and write it to `Query.status.executorStatus`

#### Scenario: Task has no status metadata
- **WHEN** the operator receives a Task response without `{QueryExtensionURI}/status` in metadata
- **THEN** the operator SHALL not modify `Query.status.executorStatus`

### Requirement: Status schema definition
The Query Extension SHALL include a `status-schema.json` defining the status metadata structure: `state` (string, required) and `message` (string, optional).

#### Scenario: Status metadata validates against schema
- **WHEN** an executor sets `{QueryExtensionURI}/status` to `{"state": "initializing", "message": "Initializing session"}`
- **THEN** the value SHALL validate against `status-schema.json`

#### Scenario: Status metadata with missing state field
- **WHEN** a status metadata object is missing the `state` field
- **THEN** the value SHALL NOT validate against `status-schema.json`

### Requirement: Extension README documents bidirectional flow
The Query Extension README SHALL document both metadata keys (`/ref` for operator→executor, `/status` for executor→operator) and the bidirectional flow pattern including wire format examples for the status response.

#### Scenario: Executor implementer reads extension docs
- **WHEN** a developer reads `ark/api/extensions/query/v1/README.md`
- **THEN** they SHALL find documentation for both the `/ref` metadata key (request direction) and the `/status` metadata key (response direction) with wire format examples
