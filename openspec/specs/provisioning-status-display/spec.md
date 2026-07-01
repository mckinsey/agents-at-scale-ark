# provisioning-status-display Specification

## Purpose
Dashboard and CLI display of Query provisioning state.

## Requirements
### Requirement: Dashboard displays provisioning state
The dashboard SHALL display a distinct visual indicator when a Query is in the `provisioning` phase. The StatusDot component SHALL render an amber/yellow dot for `provisioning`, distinguishable from the blue dot used for `running`.

#### Scenario: Query enters provisioning phase
- **WHEN** a Query's `status.phase` is `provisioning`
- **THEN** the dashboard SHALL display an amber/yellow StatusDot
- **AND** the dashboard SHALL display the condition message as supplementary text

#### Scenario: Query transitions from provisioning to running
- **WHEN** a Query's `status.phase` changes from `provisioning` to `running`
- **THEN** the dashboard SHALL update the StatusDot to blue and show the "Cancel" action as it does today

### Requirement: Fark CLI displays provisioning state
The fark CLI SHALL display provisioning-specific text when a Query enters the `provisioning` phase.

#### Scenario: Query enters provisioning phase during watch
- **WHEN** the QueryWatcher detects `status.phase = "provisioning"`
- **THEN** the CLI SHALL update the spinner text to indicate provisioning is in progress
- **AND** the CLI SHALL display the condition message if available

#### Scenario: Query transitions from provisioning to running
- **WHEN** the QueryWatcher detects `status.phase` changed from `provisioning` to `running`
- **THEN** the CLI SHALL resume the standard running spinner behavior
