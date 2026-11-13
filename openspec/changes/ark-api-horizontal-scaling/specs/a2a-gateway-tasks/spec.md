## ADDED Requirements

### Requirement: message/send returns a task
The A2A gateway SHALL answer `message/send` to `/a2a/agent/{name}` with a `Task`, for blocking and non-blocking calls. The executor SHALL emit a `Task` in the `submitted` state, carrying the user message in its history, before any status update. It SHALL NOT emit standalone `Message` events once the task exists.

#### Scenario: Blocking send
- **WHEN** a client sends `message/send` without `returnImmediately` and the agent answers
- **THEN** the response is a `Task` in state `completed`
- **AND** the agent's answer is the task's status message

#### Scenario: Non-blocking send
- **WHEN** a client sends `message/send` with `returnImmediately: true`
- **THEN** the response is a `Task` in a non-final state
- **AND** a later `tasks/get` for that task returns state `completed` with the agent's answer as the status message

#### Scenario: Query fails or times out
- **WHEN** the Query ends in phase `error`, or doesn't finish within the gateway timeout
- **THEN** the task ends in state `failed`
- **AND** its status message starts with "Task failed:" followed by the error or timeout

### Requirement: Cancel stops the Query
When `tasks/cancel` is called for a running task, the A2A gateway SHALL set `spec.cancel: true` on the Query it created for that task. It SHALL treat Query phase `canceled` as final and end the task in state `canceled`.

#### Scenario: Cancel a running task
- **WHEN** a client calls `tasks/cancel` for a task whose Query is still running
- **THEN** the gateway patches the Query with `spec.cancel: true`
- **AND** the task ends in state `canceled`

#### Scenario: Query cancelled outside the gateway
- **WHEN** the Query for a running task reaches phase `canceled` by another route, such as `PATCH /v1/queries/{name}/cancel`
- **THEN** the gateway stops waiting for it and ends the task in state `canceled`, without waiting for the gateway timeout

#### Scenario: Cancel a finished task
- **WHEN** a client calls `tasks/cancel` for a task in a final state
- **THEN** the gateway returns a "not cancelable" error and doesn't change the Query

### Requirement: Tasks survive agent changes
The A2A gateway SHALL keep each agent's tasks when it rebuilds its agent routes after an agent is added, changed or removed.

#### Scenario: Another agent is added
- **WHEN** a task exists for agent A and agent B is then created
- **THEN** `tasks/get` for the task on agent A still returns it

#### Scenario: Agent is removed
- **WHEN** an agent is deleted
- **THEN** its route and tasks are removed, and the other agents' tasks are unaffected

### Requirement: Finished tasks are evicted
The A2A gateway SHALL evict tasks in a final state (`completed`, `failed`, `canceled`, `rejected`) when either of two limits is reached: `A2A_TASK_TTL_SECONDS` (default 3600) after the task finished, or more than `A2A_TASK_MAX_FINISHED` (default 1000) finished tasks for the same agent, oldest first. It SHALL NOT evict tasks that aren't in a final state. An evicted task SHALL be reported like an unknown task.

#### Scenario: TTL expired
- **WHEN** a task finished more than `A2A_TASK_TTL_SECONDS` ago
- **THEN** `tasks/get` for it returns "Task not found"

#### Scenario: Cap reached
- **WHEN** an agent has `A2A_TASK_MAX_FINISHED` finished tasks and another task finishes
- **THEN** its oldest finished task is evicted

#### Scenario: Running task
- **WHEN** a task is still running past `A2A_TASK_TTL_SECONDS` since it started
- **THEN** it is not evicted
