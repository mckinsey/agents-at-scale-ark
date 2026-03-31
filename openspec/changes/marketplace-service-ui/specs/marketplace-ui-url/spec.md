## ADDED Requirements

### Requirement: Marketplace manifest declares UI availability
The marketplace manifest `ark` section SHALL support a `ui` object with an `enabled` boolean field. Items with `ark.ui.enabled: true` are treated as having a web UI.

#### Scenario: Item with UI enabled
- **WHEN** a marketplace item has `ark.ui.enabled: true` in its manifest
- **THEN** the dashboard SHALL attempt to resolve a UI URL for that item when it is installed

#### Scenario: Item without UI field
- **WHEN** a marketplace item has no `ark.ui` field or `ark.ui.enabled: false`
- **THEN** the dashboard SHALL NOT display any UI-related controls for that item

### Requirement: UI URL carried as Deployment annotation
The UI URL for an installed marketplace item SHALL be stored as the annotation `ark.mckinsey.com/ui-url` on the Deployment that is labeled with `ark.mckinsey.com/marketplace-item`.

#### Scenario: Deployment has ui-url annotation
- **WHEN** a labeled Deployment has annotation `ark.mckinsey.com/ui-url` with a valid URL
- **THEN** the dashboard SHALL use that URL as the item's UI URL

#### Scenario: Deployment without ui-url annotation
- **WHEN** a labeled Deployment does not have the `ark.mckinsey.com/ui-url` annotation
- **THEN** the dashboard SHALL treat the item as having no configured UI URL

### Requirement: Dashboard reads URL from existing detection query
The dashboard SHALL extract the `ark.mckinsey.com/ui-url` annotation from the Deployment response that is already fetched for installation detection (PR #1440). No additional API calls SHALL be made for URL resolution.

#### Scenario: URL extracted during installation detection
- **WHEN** the marketplace fetcher queries a labeled Deployment for installation status
- **THEN** it SHALL also read the `ark.mckinsey.com/ui-url` annotation from the same response and attach it to the MarketplaceItem as `uiUrl`

### Requirement: MarketplaceItem type extended with uiUrl
The `MarketplaceItem` TypeScript type SHALL include an optional `uiUrl` string field and an optional `uiEnabled` boolean field.

#### Scenario: Item with resolved URL
- **WHEN** a MarketplaceItem has `uiUrl` set
- **THEN** the dashboard SHALL render an "Open" button that opens the URL in a new tab

#### Scenario: Item with UI enabled but no URL
- **WHEN** a MarketplaceItem has `uiEnabled: true` but no `uiUrl`
- **THEN** the dashboard SHALL render port-forward instructions using `ark.k8sServiceName` and `ark.k8sServicePort` from the manifest

### Requirement: Marketplace card renders Open button
The marketplace item card SHALL display an "Open" button for installed items that have a `uiUrl`.

#### Scenario: Installed item with URL on card
- **WHEN** viewing a marketplace card for an installed item with `uiUrl`
- **THEN** the card SHALL show both "Installed" status and an "Open" button
- **AND** clicking "Open" SHALL open the URL in a new browser tab

#### Scenario: Installed item without URL on card
- **WHEN** viewing a marketplace card for an installed item with `uiEnabled: true` but no `uiUrl`
- **THEN** the card SHALL show "Installed" status without an "Open" button

### Requirement: Marketplace detail page renders Open action
The marketplace item detail page SHALL display an "Open" button and port-forward instructions when applicable.

#### Scenario: Detail page with URL
- **WHEN** viewing the detail page for an installed item with `uiUrl`
- **THEN** the page SHALL display a prominent "Open" button that opens the URL in a new tab

#### Scenario: Detail page with UI enabled but no URL
- **WHEN** viewing the detail page for an installed item with `uiEnabled: true` but no `uiUrl`
- **THEN** the page SHALL display port-forward instructions: `kubectl port-forward svc/{k8sServiceName} {k8sServicePort}:{k8sServicePort}`

### Requirement: Post-install hooks set ui-url annotation
Marketplace Helm chart post-install hooks SHALL set the `ark.mckinsey.com/ui-url` annotation on the labeled Deployment when the URL is deterministic from install-time values.

#### Scenario: Hook sets annotation after install
- **WHEN** a marketplace item is installed via Helm and the post-install hook runs
- **THEN** the hook SHALL patch the Deployment to add the `ark.mckinsey.com/ui-url` annotation with the service URL derived from Helm values

#### Scenario: URL not deterministic at install time
- **WHEN** a marketplace item is installed but the external URL cannot be determined at install time (e.g., no Ingress configured yet)
- **THEN** the hook SHALL label the Deployment for detection but MAY omit the `ui-url` annotation
