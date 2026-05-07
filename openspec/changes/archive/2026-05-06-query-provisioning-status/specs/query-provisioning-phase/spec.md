## ADDED Requirements

### Requirement: Query phase includes provisioning state
The Query CRD phase enum SHALL include `provisioning` as a valid value. The full phase progression SHALL be: `pending → provisioning → running → done / error / canceled`. The `provisioning` phase indicates that the executor is preparing infrastructure required to execute the query.

#### Scenario: Executor signals provisioning
- **WHEN** an executor receives an A2A request and needs to provision infrastructure before execution
- **THEN** the executor SHALL patch the Query status to `phase: provisioning` with condition `Completed=False`, `reason: ExecutorProvisioning`, and a freeform `message` describing what is being provisioned

#### Scenario: Executor signals ready to execute
- **WHEN** the executor has finished provisioning and begins executing the agent
- **THEN** the executor SHALL patch the Query status to `phase: running` with condition `Completed=False`, `reason: QueryRunning`

#### Scenario: Executor does not need provisioning
- **WHEN** an executor receives an A2A request and can execute immediately
- **THEN** the Query SHALL remain at the phase set by the controller and proceed to terminal state as today

#### Scenario: Controller sets terminal phase during provisioning
- **WHEN** the controller receives a response or error while the Query is still in `provisioning` phase
- **THEN** the controller SHALL set the terminal phase (`done`, `error`, or `canceled`) — skipping `running` is acceptable
