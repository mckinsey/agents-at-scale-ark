## ADDED Requirements

### Requirement: River client initialization
The system SHALL initialize a River client with a `pgxpool.Pool` connection when the storage backend is PostgreSQL. The River client SHALL be added to the controller manager as a runnable and started alongside the embedded API server.

#### Scenario: River client starts in PostgreSQL mode
- **WHEN** `ARK_STORAGE_BACKEND` is set to a value other than "" or "etcd"
- **THEN** a River client is created with a `pgxpool.Pool` using the same PostgreSQL connection parameters as the embedded API server
- **AND** the River client is added to the manager via `mgr.Add()`
- **AND** River's migration tables (`river_job`, `river_leader`, etc.) are created if they don't exist

#### Scenario: River client does not start in etcd mode
- **WHEN** `ARK_STORAGE_BACKEND` is "" or "etcd"
- **THEN** no River client is created
- **AND** the query reconciler operates as before

### Requirement: Transactional job enqueue on Query CREATE
The system SHALL enqueue a River job in the same database transaction as the Query resource INSERT when the storage backend is PostgreSQL.

#### Scenario: Query creation enqueues execution job
- **WHEN** a Query resource is created via the embedded API server
- **THEN** a River job of type `query_execute` is inserted in the same transaction as the resource INSERT
- **AND** the job args contain the query's namespace and name
- **AND** the job has a unique constraint on (namespace, name) to prevent duplicate jobs

#### Scenario: Failed job enqueue rolls back query creation
- **WHEN** a Query resource INSERT succeeds but the River job INSERT fails
- **THEN** the entire transaction is rolled back
- **AND** the Query resource is not persisted

### Requirement: Configurable worker concurrency
The system SHALL support configuring the maximum number of concurrent River workers.

#### Scenario: Default worker concurrency
- **WHEN** no worker concurrency is configured
- **THEN** River starts with a default of 10 workers

#### Scenario: Custom worker concurrency via environment variable
- **WHEN** `ARK_QUERY_WORKERS` is set to a positive integer
- **THEN** River starts with that number of max workers

### Requirement: Query reconciler disabled in PostgreSQL mode
The system SHALL skip registration of the `QueryReconciler` controller when the storage backend is PostgreSQL.

#### Scenario: Query reconciler not registered
- **WHEN** `ARK_STORAGE_BACKEND` is set to a value other than "" or "etcd"
- **THEN** the `QueryReconciler` is not added to the controller manager
- **AND** all other reconcilers (Agent, Model, Team, etc.) are registered normally
