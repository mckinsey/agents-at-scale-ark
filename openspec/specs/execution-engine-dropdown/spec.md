## ADDED Requirements

### Requirement: Agent Studio uses dropdown for execution engine selection
The Agent Studio form SHALL replace the free-text execution engine input with a dropdown selector that lists all execution engines from the current namespace. The dropdown SHALL include a "None (Unset)" option as default.

#### Scenario: User selects an engine from dropdown
- **WHEN** the user opens the execution engine dropdown in Agent Studio
- **THEN** the system displays all execution engines from the current namespace with their phase status

#### Scenario: No engines available
- **WHEN** no execution engines exist in the current namespace
- **THEN** the dropdown shows only the "None (Unset)" option

#### Scenario: Agent has existing engine reference
- **WHEN** the user edits an agent that already has an execution engine set
- **THEN** the dropdown pre-selects that engine

### Requirement: Dropdown shows engine phase status
Each engine option in the dropdown SHALL display a phase indicator: green for ready, yellow for running, red for error.

#### Scenario: Engine in ready state
- **WHEN** an engine with phase "ready" appears in the dropdown
- **THEN** it displays with a green status indicator

#### Scenario: Engine in error state
- **WHEN** an engine with phase "error" appears in the dropdown
- **THEN** it displays with a red status indicator

### Requirement: Dropdown is gated by experimental flag
The execution engine dropdown SHALL only appear when the experimental execution engine feature flag is enabled, matching current behavior.

#### Scenario: Flag controls visibility
- **WHEN** the experimental execution engine flag is off
- **THEN** the execution engine field is not shown in Agent Studio

### Requirement: Execution engine reference appears in Agent Studio YAML view
The Agent Studio YAML view SHALL display the `executionEngine` field when an execution engine is configured for the agent, regardless of whether the experimental execution engine feature flag is enabled.

#### Scenario: Agent with execution engine shows it in YAML
- **WHEN** an agent has an execution engine reference set
- **AND** the user toggles the YAML view in Agent Studio
- **THEN** the YAML output includes `executionEngine` with `name` (and `namespace` if set)

#### Scenario: Agent without execution engine omits it from YAML
- **WHEN** an agent does not have an execution engine reference
- **AND** the user toggles the YAML view in Agent Studio
- **THEN** the YAML output does not include an `executionEngine` field
