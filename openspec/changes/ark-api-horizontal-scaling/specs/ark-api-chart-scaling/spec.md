## ADDED Requirements

### Requirement: Replica count or HPA
The ark-api chart SHALL set the Deployment's replica count from `replicaCount`. When `autoscaling.enabled` is true, it SHALL render a HorizontalPodAutoscaler from `autoscaling.minReplicas`, `autoscaling.maxReplicas` and a CPU target, and SHALL omit `replicas` from the Deployment. `autoscaling.enabled` SHALL default to false.

#### Scenario: Fixed replicas
- **WHEN** the chart is rendered with `replicaCount: 3` and autoscaling off
- **THEN** the Deployment has `replicas: 3` and no HPA is rendered

#### Scenario: Autoscaling on
- **WHEN** the chart is rendered with `autoscaling.enabled: true`
- **THEN** an HPA targeting the ark-api Deployment is rendered
- **AND** the Deployment has no `replicas` field

### Requirement: Disruption budget and spreading
The ark-api chart SHALL render a PodDisruptionBudget when `podDisruptionBudget.enabled` is true (default false). It SHALL render `topologySpreadConstraints` when they are set in the values.

#### Scenario: PDB enabled
- **WHEN** the chart is rendered with `podDisruptionBudget.enabled: true` and `minAvailable: 1`
- **THEN** a PodDisruptionBudget selecting the ark-api pods with `minAvailable: 1` is rendered

#### Scenario: Defaults
- **WHEN** the chart is rendered with default values
- **THEN** no PodDisruptionBudget and no HPA are rendered

### Requirement: Graceful shutdown
The ark-api pod SHALL get time to finish in-flight requests when it stops. The chart SHALL set `terminationGracePeriodSeconds` and a `preStop` sleep, and the server SHALL be started with a graceful-shutdown timeout below that grace period.

#### Scenario: Pod terminated during a request
- **WHEN** an ark-api pod receives SIGTERM while serving a request shorter than the shutdown timeout
- **THEN** the request completes before the process exits

### Requirement: Docs match the chart
`docs/content/reference/scalability.mdx` SHALL describe only scaling settings the ark-api chart supports, and SHALL state that the A2A gateway needs the `postgres` task store to run on more than one replica.

#### Scenario: Reader follows the docs
- **WHEN** a reader sets the replica value named in `scalability.mdx`
- **THEN** the chart renders that many ark-api replicas
