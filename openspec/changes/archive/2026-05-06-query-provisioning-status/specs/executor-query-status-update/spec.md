## ADDED Requirements

### Requirement: SDK provides query status update utility
The `ark-sdk` SHALL provide a `QueryStatusUpdater` class that allows executors to patch the Query status subresource via the K8s API. The updater SHALL be injected into the executor context by `A2AExecutorAdapter`, following the same pattern as `broker_client`.

#### Scenario: Executor updates query phase
- **WHEN** an executor calls `update_query_phase(phase, reason, message)` on the status updater
- **THEN** the updater SHALL PATCH the Query's `status.phase` and the `Completed` condition with the provided reason and message
- **AND** the updater SHALL use the query name and namespace extracted from the A2A message metadata

#### Scenario: Query ref not available
- **WHEN** the A2A message does not contain a query ref in its metadata
- **THEN** the updater SHALL log a warning and skip the status update without raising an error

#### Scenario: K8s API patch fails
- **WHEN** the K8s API PATCH fails (query deleted, network error, RBAC denied)
- **THEN** the updater SHALL log the error and skip the status update without raising an error

### Requirement: Status updater is optional
Executors SHALL NOT be required to use the status updater. Executors that do not call it SHALL behave identically to today. The updater SHALL be available on the executor context but SHALL NOT be invoked automatically.

#### Scenario: Executor ignores status updater
- **WHEN** an executor does not call any methods on the status updater
- **THEN** the Query lifecycle SHALL proceed exactly as it does today with no changes to phase transitions or conditions
