## ADDED Requirements

### Requirement: Marketplace item declares external UI URL via Service annotation
A Helm chart that is a marketplace item MAY annotate its Kubernetes Service with `ark.mckinsey.com/marketplace-item-ui-url` to declare the URL of its web UI. The annotation value SHALL be a complete URL reachable from the user's browser. An optional annotation `ark.mckinsey.com/marketplace-item-ui-label` provides a human-readable button label; it defaults to "Open" if absent.

#### Scenario: Installed item with ui-url annotation surfaces link on card
- **WHEN** a marketplace item is installed and its Kubernetes Service has `ark.mckinsey.com/marketplace-item-ui-url` set
- **THEN** the marketplace item card SHALL display a button with the annotation's label that opens the URL in a new tab

#### Scenario: Installed item with ui-url annotation surfaces link on detail page
- **WHEN** a marketplace item is installed and its Kubernetes Service has `ark.mckinsey.com/marketplace-item-ui-url` set
- **THEN** the marketplace detail page sidebar SHALL display a link button that opens the URL in a new tab

#### Scenario: Item without annotation shows no UI link
- **WHEN** a marketplace item is installed and its Kubernetes Service has no `ark.mckinsey.com/marketplace-item-ui-url` annotation
- **THEN** no UI link SHALL be displayed on the card or detail page

### Requirement: Marketplace item declares embedded UI via Service annotation
A Helm chart MAY additionally annotate its Kubernetes Service with `ark.mckinsey.com/marketplace-item-ui-embedded: "true"` to indicate that the UI SHALL be rendered inside the Ark dashboard as an embedded iframe rather than opened externally.

#### Scenario: Installed item with embedded annotation shows UI tab
- **WHEN** a marketplace item is installed, its Service has `ark.mckinsey.com/marketplace-item-ui-url` set, and `ark.mckinsey.com/marketplace-item-ui-embedded` is `"true"`
- **THEN** the marketplace detail page SHALL display a "UI" tab that renders the URL in a sandboxed iframe

#### Scenario: Embedded iframe is sandboxed
- **WHEN** the embedded UI tab is active
- **THEN** the iframe SHALL use `sandbox="allow-scripts allow-forms allow-same-origin"` and SHALL NOT grant `allow-top-navigation` or `allow-popups-to-escape-sandbox`

#### Scenario: Embedded iframe load failure shows fallback
- **WHEN** the embedded iframe fails to load (e.g., X-Frame-Options blocks embedding)
- **THEN** the UI tab SHALL display a fallback message and a button to open the URL in a new tab

#### Scenario: Item with embedded flag but no URL shows nothing
- **WHEN** `ark.mckinsey.com/marketplace-item-ui-embedded` is `"true"` but `ark.mckinsey.com/marketplace-item-ui-url` is absent
- **THEN** no UI tab SHALL be displayed

### Requirement: Marketplace manifest declares UI metadata for pre-install documentation
The `marketplace.json` manifest MAY include a `uis` array on an item. Each entry SHALL have a `label` field (string) and an optional `description` field (string). This field is for documentation only and SHALL NOT be used as a URL source.

#### Scenario: Item with manifest uis shows documentation before install
- **WHEN** a marketplace item is not installed and its `marketplace.json` entry has a non-empty `uis` array
- **THEN** the marketplace detail page overview tab SHALL display the UI names/descriptions to inform users that this item exposes a UI once installed

#### Scenario: Post-install uis are driven by live annotations, not manifest
- **WHEN** a marketplace item is installed
- **THEN** the UI links displayed SHALL be sourced from Kubernetes Service annotations, not from the `marketplace.json` `uis` array

### Requirement: URL discovery batch-fetches Services for all installed items
The dashboard SHALL discover UI URLs for all installed marketplace items in a single Kubernetes API call, not one call per item, to avoid excessive API server load.

#### Scenario: Single batch call for UI URL discovery
- **WHEN** the marketplace page loads and there are N installed items
- **THEN** UI URL discovery SHALL use at most one Kubernetes Services list call with a `labelSelector` covering all installed releases

### Requirement: Services navigation page is removed
The standalone `/services` page SHALL be removed from the dashboard. Its functionality (surfacing Helm-released services with HTTP routes) is replaced by the enhanced marketplace page.

#### Scenario: Navigating to /services redirects or 404s
- **WHEN** a user navigates to the `/services` route
- **THEN** the dashboard SHALL return a 404 or redirect to `/marketplace`
