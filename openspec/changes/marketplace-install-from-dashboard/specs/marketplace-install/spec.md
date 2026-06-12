## ADDED Requirements

### Requirement: Install marketplace items from the dashboard

When direct install is enabled, the dashboard SHALL install a marketplace item end-to-end (`helm upgrade --install`) in response to the Get/Install action, without requiring the user to leave the UI. The item's installation configuration (chart path, release name, namespace, install args) SHALL be resolved from the item's marketplace manifest.

#### Scenario: Install executes when enabled

- **WHEN** direct install is enabled and the user triggers Install for an item that has installation configuration
- **THEN** the dashboard runs the item's `helm upgrade --install` from the dashboard pod and reports the resulting status

#### Scenario: Item lacks installation configuration

- **WHEN** the user triggers Install for an item whose manifest has no chart path or release name
- **THEN** the dashboard reports that the item is not installable and does not invoke helm

#### Scenario: Install execution fails

- **WHEN** direct install is enabled and the helm command exits non-zero or the helm binary is unavailable
- **THEN** the dashboard surfaces a usable error to the user (not a silent failure) and falls back to offering the equivalent command

#### Scenario: Install exceeds the execution timeout

- **WHEN** direct install is enabled and the helm command exceeds the route's execution timeout
- **THEN** the dashboard returns a usable error rather than leaving the client hanging

### Requirement: Surface install and uninstall progress and result

The dashboard SHALL indicate that an install or uninstall is in progress and SHALL show the resulting helm release status on completion, so the user knows when the action finished and whether it succeeded.

#### Scenario: Progress shown while running

- **WHEN** an install or uninstall is executing
- **THEN** the dashboard shows an in-progress state and disables re-triggering the same action

#### Scenario: Result shown on completion

- **WHEN** an install or uninstall completes
- **THEN** the dashboard reflects the outcome (e.g. the card transitions between Get and Installed) and shows whether it succeeded or failed

### Requirement: Uninstall marketplace items from the dashboard

When direct uninstall is enabled, the dashboard SHALL uninstall an installed item via the UI and surface progress and result, rather than executing silently.

#### Scenario: Uninstall executes when enabled

- **WHEN** direct uninstall is enabled and the user triggers Uninstall for an installed item
- **THEN** the dashboard runs `helm uninstall` from the dashboard pod and reports the result

#### Scenario: Uninstall execution fails

- **WHEN** direct uninstall is enabled and the helm command fails
- **THEN** the dashboard surfaces a usable error to the user

### Requirement: Platform-team governance toggle

A cluster-scoped configuration toggle SHALL gate both in-dashboard install and uninstall. The toggle SHALL default to disabled so that the governance posture is preserved on a fresh install or upgrade. Enabling direct install/uninstall SHALL be an explicit platform-team decision (Helm value / pod environment variable).

#### Scenario: Disabled by default

- **WHEN** the dashboard is installed or upgraded without setting the toggle
- **THEN** direct install and uninstall are disabled

#### Scenario: Toggle off never spawns helm

- **WHEN** the toggle is disabled and an install or uninstall is requested
- **THEN** the server does not spawn helm for either action

#### Scenario: Toggle on enables execution

- **WHEN** the platform team enables the toggle
- **THEN** both install and uninstall execute from the dashboard pod

#### Scenario: Legacy client mode is ignored

- **WHEN** the toggle is on and a request carries a legacy `mode` body field
- **THEN** the server ignores the field and executes — the toggle alone decides execution

#### Scenario: Toggle change takes effect on restart

- **WHEN** the platform team changes the toggle value and the dashboard pod is rolled out
- **THEN** the new value takes effect for subsequent install and uninstall requests

### Requirement: Command fallback when direct execution is disabled

When the toggle is disabled, the dashboard SHALL offer the equivalent `helm` command for both install and uninstall, and SHALL clearly signal in the UI that direct install/uninstall is disabled by policy.

#### Scenario: Install fallback to command

- **WHEN** the toggle is disabled and the user opens the Install action
- **THEN** the dashboard presents the copy/paste helm command and indicates direct install is disabled by policy

#### Scenario: Uninstall fallback to command

- **WHEN** the toggle is disabled and the user opens the Uninstall action
- **THEN** the dashboard presents the copy/paste helm uninstall command and does not execute it

### Requirement: Resolve install targets only from governed sources

When direct execution is enabled, the dashboard SHALL resolve the item to install or uninstall solely from the namespace's `marketplace-sources` catalogue (server-side, governed by cluster RBAC). It SHALL NOT honor any client-supplied source when choosing what to install.

#### Scenario: Item resolved from the namespace catalogue

- **WHEN** direct install is enabled and the user installs an item
- **THEN** the item's chart path and install configuration come from the namespace `marketplace-sources` catalogue

#### Scenario: Client-supplied source is not honored

- **WHEN** a request carries a client-supplied source (header or body field) pointing at a chart not present in the namespace catalogue
- **THEN** the server resolves only from the catalogue and does not install the client-supplied chart
