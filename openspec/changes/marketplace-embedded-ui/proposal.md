## Why

Marketplace items with web interfaces (Langfuse, Phoenix, Argo) and configuration screens (Claude Code executor) have no way to surface those UIs through the Ark dashboard. Users must manually port-forward or discover nip.io URLs, and marketplace item authors have no documented way to declare their UI endpoints.

## What Changes

- Add a Kubernetes Service annotation convention (`ark.mckinsey.com/marketplace-item-ui-url`, `ark.mckinsey.com/marketplace-item-ui-label`) for Helm chart authors to declare their UI URL and label; the dashboard already reads these annotations and surfaces links on installed items.
- Add an optional `uis` field to the `marketplace.json` manifest schema so authors can declare static UI entries for documentation and pre-install discovery.
- Add an embedded UI tab on the marketplace detail page that renders a marketplace item's UI inside an iframe, enabling config screens (e.g. Claude Code executor) without leaving the dashboard.
- Add a Kubernetes Service annotation (`ark.mckinsey.com/marketplace-item-ui-embedded: "true"`) to flag that a UI should be rendered as an embedded iframe rather than opened externally.
- Remove the standalone `/services` page; its functionality (URL discovery, link exposure) is now fully covered by the enhanced marketplace page.

## Capabilities

### New Capabilities

- `marketplace-item-ui`: How marketplace items declare their UI endpoints (annotations, manifest field) and how the dashboard discovers and displays them (external links, embedded iframe tab).

### Modified Capabilities

- none

## Impact

- `services/ark-dashboard/`: New embedded-UI tab on detail page; `uis` already rendered on cards and detail sidebar; no new dashboard routes needed.
- `services/ark-api/`: No changes required; HTTPRoute URL discovery in `ark_services.py` is already in use for `ArkService`; marketplace UI URLs are fetched via Service annotations separately.
- `lib/ark-sdk/` / CRDs: No changes; this is a pure dashboard + Helm chart annotation convention.
- Marketplace Helm charts (in agents-at-scale-marketplace): Authors add Service annotations and optionally update `marketplace.json` to declare `uis`.
- Breaking: `/services` page removed from dashboard navigation.
