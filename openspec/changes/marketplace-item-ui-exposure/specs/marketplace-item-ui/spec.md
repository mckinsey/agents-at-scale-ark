## ADDED Requirements

### Requirement: Marketplace item declares UI via K8s Service annotation
A marketplace item author SHALL declare a UI URL by setting `ark.mckinsey.com/marketplace-item-ui-url` on the Kubernetes Service resource deployed by their Helm chart. An optional `ark.mckinsey.com/marketplace-item-ui-label` annotation sets the button label; the default label is "Open".

#### Scenario: Item with UI annotation appears with "Open UI" button
- **WHEN** a marketplace item is installed and its K8s Service has `ark.mckinsey.com/marketplace-item-ui-url` set
- **THEN** the marketplace item card and detail page SHALL display a button with the annotation's label (or "Open" if absent) that opens the declared URL in a new browser tab

#### Scenario: Item with no UI annotation shows no UI affordance
- **WHEN** a marketplace item is installed and none of its K8s Services have `ark.mckinsey.com/marketplace-item-ui-url`
- **THEN** no UI button or badge is shown for that item

#### Scenario: Item with multiple UI annotations shows all UI links
- **WHEN** a marketplace item's Helm release includes multiple K8s Services each with `ark.mckinsey.com/marketplace-item-ui-url`
- **THEN** all discovered UI URLs SHALL be surfaced on the item's detail page

---

### Requirement: Marketplace.json item schema includes optional `ui` block
The `marketplace.json` manifest format SHALL support an optional `ui` object per item with the following fields: `path` (string, path relative to the service base URL), `label` (string, default button label), and `embedded` (boolean, Phase 2 flag for iframe rendering).

#### Scenario: Catalog entry shows "has UI" indicator before installation
- **WHEN** a marketplace item in the catalog has a `ui` block in its `marketplace.json` entry
- **THEN** the item card SHALL display a visual indicator that the item exposes a UI, even when the item is not installed

#### Scenario: Missing `ui` block does not cause errors
- **WHEN** a marketplace item has no `ui` block in its manifest entry
- **THEN** the dashboard SHALL render the item normally with no UI affordance and no error

---

### Requirement: URL resolution uses annotation-first hierarchy
The dashboard SHALL resolve a marketplace item's UI URL by checking sources in priority order: (1) K8s Service annotation, (2) HTTPRoute hostname combined with `ui.path` from the manifest, (3) no URL (item shows catalog-only UI indicator).

#### Scenario: Annotation URL takes precedence over HTTPRoute
- **WHEN** both a K8s Service annotation URL and an HTTPRoute-derived URL are available for the same item
- **THEN** the annotation URL SHALL be used

#### Scenario: HTTPRoute fallback when annotation is absent
- **WHEN** a marketplace item has no UI annotation but does have a discovered HTTPRoute and its manifest declares `ui.path`
- **THEN** the dashboard SHALL construct a URL from the HTTPRoute hostname concatenated with `ui.path` and present it as the item's UI link

---

### Requirement: Marketplace page includes "Has UI" filter
The marketplace page SHALL include a filter option that restricts the displayed items to those that expose a UI (either via a resolved runtime URL or a catalog-level `ui` block declaration).

#### Scenario: "Has UI" filter shows only items with UI
- **WHEN** the user selects the "Has UI" filter on the marketplace page
- **THEN** only items that have at least one entry in `uis` or have a `ui` block in their manifest SHALL be displayed

#### Scenario: Clearing the filter restores all items
- **WHEN** the user clears the "Has UI" filter
- **THEN** all marketplace items are shown regardless of UI availability

---

### Requirement: Services page is retired
The `app/(dashboard)/services/` page and its sidebar navigation entry SHALL be removed once the marketplace page provides full feature parity for installed-items-with-UI discovery.

#### Scenario: Services page is no longer accessible
- **WHEN** the services page has been removed
- **THEN** navigating to `/services` SHALL redirect to the marketplace page with the "Installed" status filter pre-applied

#### Scenario: Sidebar no longer contains Services entry
- **WHEN** the services page has been removed
- **THEN** the dashboard sidebar SHALL contain no entry pointing to the services page

---

### Requirement: Embedded UI renders in sandboxed iframe (Phase 2)
For marketplace items whose resolved UI URL is associated with `embedded: true` (from manifest), the dashboard SHALL render the URL inside a sandboxed `<iframe>` in a "UI" tab on the item detail page rather than opening a new browser tab.

#### Scenario: Embedded UI tab appears on detail page for embedded items
- **WHEN** a marketplace item is installed, has a resolved UI URL, and its manifest declares `embedded: true`
- **THEN** the detail page SHALL include a "UI" tab that renders the iframe

#### Scenario: Non-embedded item opens URL in new tab
- **WHEN** a marketplace item has a resolved UI URL and `embedded` is absent or `false`
- **THEN** clicking the "Open UI" button SHALL open the URL in a new browser tab

#### Scenario: Iframe uses restrictive sandbox attributes
- **WHEN** an embedded UI iframe is rendered
- **THEN** the iframe SHALL include `sandbox="allow-scripts allow-same-origin allow-forms"` and SHALL NOT allow top-level navigation or popups

#### Scenario: Non-HTTPS URL is rejected for embedded mode
- **WHEN** a marketplace item annotation or manifest declares an embedded UI URL using HTTP (not HTTPS)
- **THEN** the dashboard SHALL NOT render the iframe and SHALL display an error indicator explaining that embedded UIs require HTTPS
