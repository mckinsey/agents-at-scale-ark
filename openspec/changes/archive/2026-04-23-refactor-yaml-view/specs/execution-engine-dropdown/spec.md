## ADDED Requirements

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
