## ADDED Requirements

### Requirement: Agent controller checks execution engine dependency
The agent controller SHALL validate that a referenced execution engine exists and is ready, following the same pattern used for model and tool dependencies. When the engine is missing or not ready, the agent's Available condition SHALL reflect this.

#### Scenario: Referenced engine exists and is ready
- **WHEN** an agent references an execution engine that exists with phase "ready"
- **THEN** the agent's Available condition is not affected by the engine check

#### Scenario: Referenced engine does not exist
- **WHEN** an agent references an execution engine that does not exist
- **THEN** the agent's Available condition SHALL be set to False with reason "ExecutionEngineNotFound" and a message identifying the missing engine name and namespace

#### Scenario: Referenced engine exists but is not ready
- **WHEN** an agent references an execution engine with phase "error" or "running"
- **THEN** the agent's Available condition SHALL be set to False with reason "ExecutionEngineNotReady"

#### Scenario: Agent has no execution engine reference
- **WHEN** an agent does not reference an execution engine (field is nil or empty)
- **THEN** the engine dependency check is skipped

### Requirement: Agent controller watches ExecutionEngine resources
The agent controller SHALL watch ExecutionEngine resources and re-reconcile dependent agents when an engine is created, updated, or deleted.

#### Scenario: Execution engine is deleted
- **WHEN** an execution engine is deleted and agents reference it
- **THEN** those agents SHALL be re-reconciled and their Available condition updated to reflect the missing dependency

#### Scenario: Execution engine becomes ready
- **WHEN** an execution engine transitions to phase "ready" and agents reference it
- **THEN** those agents SHALL be re-reconciled and their Available condition updated to reflect the resolved dependency
