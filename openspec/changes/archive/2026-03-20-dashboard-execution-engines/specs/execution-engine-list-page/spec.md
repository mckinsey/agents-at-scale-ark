## ADDED Requirements

### Requirement: Dashboard lists execution engines in current namespace
The system SHALL display a list of all execution engines in the user's current namespace at the `/execution-engines` route. Each entry SHALL show the engine name, phase status (ready/running/error), resolved address (when available), description (when available), and status message (when in error state).

#### Scenario: Engines exist in namespace
- **WHEN** the user navigates to the Execution Engines page and engines exist in the current namespace
- **THEN** the system displays a card for each engine showing name, phase badge, resolved address, and description

#### Scenario: No engines in namespace
- **WHEN** the user navigates to the Execution Engines page and no engines exist
- **THEN** the system displays an empty state

#### Scenario: Engine in error state
- **WHEN** an execution engine has phase "error"
- **THEN** the card SHALL display the status message from the engine's status field

### Requirement: User can delete execution engines from the list
The system SHALL provide a delete action on each engine card. Deleting an engine SHALL call the generic resource API DELETE endpoint and refresh the list.

#### Scenario: Successful deletion
- **WHEN** the user clicks the delete action on an engine card
- **THEN** the system deletes the engine via the API and removes it from the list

### Requirement: Execution Engines page is gated by experimental flag
The Execution Engines page and its sidebar entry SHALL only be visible when the experimental execution engine feature flag is enabled.

#### Scenario: Flag disabled
- **WHEN** the experimental execution engine flag is off
- **THEN** the Execution Engines entry does not appear in the More popover and the route is not accessible

#### Scenario: Flag enabled
- **WHEN** the experimental execution engine flag is on
- **THEN** the Execution Engines entry appears in the More sidebar popover

### Requirement: Sidebar entry in More popover
The system SHALL add an "Execution Engines" entry to the "More" sidebar popover, positioned alongside Files, A2A Tasks, and Exports.

#### Scenario: Navigation via More popover
- **WHEN** the user clicks "Execution Engines" in the More popover
- **THEN** the system navigates to `/execution-engines`
