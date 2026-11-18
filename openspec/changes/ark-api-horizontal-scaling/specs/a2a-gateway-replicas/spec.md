## ADDED Requirements

### Requirement: Selectable task store backend
ark-api SHALL select the A2A gateway's task store from configuration: `memory` (default) or `postgres`. With `memory`, it SHALL need no external service. With `postgres`, it SHALL use a2a-sdk's `VersionedDatabaseTaskStore` and `DatabaseTaskEventStream` against the configured database. It SHALL fail to start if `postgres` is selected without a connection URL.

#### Scenario: Default install
- **WHEN** ark-api is installed without task store settings
- **THEN** the A2A gateway uses the in-memory store and needs no database

#### Scenario: Postgres selected
- **WHEN** `a2a.taskStore.backend` is `postgres` and a connection URL is set
- **THEN** every agent's handler uses the Postgres task store and event stream

#### Scenario: Postgres selected without a URL
- **WHEN** `a2a.taskStore.backend` is `postgres` and no connection URL is set
- **THEN** ark-api fails at startup with an error naming the missing setting

### Requirement: Any replica answers task calls
With the `postgres` backend, any ark-api replica SHALL answer `tasks/get`, `tasks/cancel` and `tasks/subscribe` for a task started on another replica.

#### Scenario: tasks/get on another replica
- **WHEN** a task is started on replica 1 and `tasks/get` for it reaches replica 2
- **THEN** replica 2 returns the task's current state

#### Scenario: tasks/cancel on another replica
- **WHEN** a running task's `tasks/cancel` reaches a replica that isn't running it
- **THEN** that replica records the cancel and patches the Query with `spec.cancel: true`
- **AND** the task ends in state `canceled`

#### Scenario: tasks/subscribe on another replica
- **WHEN** a client subscribes to a running task through a replica that isn't running it
- **THEN** the client receives the task's later status updates

### Requirement: Task scoping is kept across replicas
With the `postgres` backend, the A2A gateway SHALL keep task visibility scoped to the caller, as the in-memory store does (`resolve_user_scope`).

#### Scenario: Another caller asks for a task
- **WHEN** caller B requests a task created by caller A, on any replica
- **THEN** the gateway reports it as not found

### Requirement: Eviction applies to the shared store
With the `postgres` backend, the A2A gateway SHALL apply the same eviction limits as the in-memory store (`A2A_TASK_TTL_SECONDS`, `A2A_TASK_MAX_FINISHED`).

#### Scenario: Expired task in Postgres
- **WHEN** a task finished more than `A2A_TASK_TTL_SECONDS` ago
- **THEN** `tasks/get` for it returns "Task not found" on every replica
