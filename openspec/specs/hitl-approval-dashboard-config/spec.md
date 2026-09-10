# hitl-approval-dashboard-config

## Purpose

Lets users configure per-tool approval requirements directly from the dashboard agent editor, instead of hand-editing YAML, so deciding which tools need human approval happens in the same UI used to build the agent.

## Requirements

### Requirement: Agent editor displays approval configuration per tool

The dashboard agent editor SHALL display an approval configuration control for each tool attached to the agent, reflecting the tool's current `AgentTool.approval` values.

#### Scenario: Tool with no approval config

- **WHEN** the agent editor opens for an agent whose tool has no `approval` block
- **THEN** the tool SHALL show approval as not required, with no timeout or onTimeout selected

#### Scenario: Tool with existing approval config

- **WHEN** the agent editor opens for an agent whose tool has `approval.required: true`, `approval.timeout: 5m`, `approval.onTimeout: reject`
- **THEN** the tool SHALL show approval required, timeout `5m`, and onTimeout `reject`

### Requirement: User can set approval required per tool

The agent editor SHALL let the user toggle whether each tool requires human approval, and SHALL persist the choice to that tool's `approval.required` field when the agent is saved.

#### Scenario: Enable approval for a tool

- **WHEN** the user enables approval for a tool and saves the agent
- **THEN** the saved Agent's corresponding `AgentTool` SHALL have `approval.required: true`

#### Scenario: Disable approval for a tool

- **WHEN** the user disables approval for a tool that previously required it and saves the agent
- **THEN** the saved Agent's corresponding `AgentTool` SHALL have `approval.required: false` or no approval block

### Requirement: User can set approval timeout and onTimeout

When approval is required for a tool, the agent editor SHALL let the user set the approval `timeout` (a duration) and `onTimeout` behavior (`reject` or `proceed`), and SHALL persist them to the tool's `approval.timeout` and `approval.onTimeout` fields.

#### Scenario: Set timeout and onTimeout

- **WHEN** the user sets timeout `10m` and onTimeout `proceed` for an approval-required tool and saves
- **THEN** the saved `AgentTool.approval` SHALL have `timeout: 10m` and `onTimeout: proceed`

#### Scenario: onTimeout limited to valid values

- **WHEN** the user selects an onTimeout value
- **THEN** the editor SHALL only allow `reject` or `proceed`

### Requirement: Approval fields are disabled when approval is not required

The agent editor SHALL only accept timeout and onTimeout input when approval is required for the tool, preventing configuration that the backend would ignore.

#### Scenario: Timeout hidden or disabled without approval

- **WHEN** approval is not required for a tool
- **THEN** the timeout and onTimeout controls for that tool SHALL be hidden or disabled
