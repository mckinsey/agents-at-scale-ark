## Why

Marketplace items with web interfaces (Langfuse, Phoenix, Argo, Claude Code executor) have no reliable way to surface their UIs through the Ark dashboard — users must manually port-forward or discover nip.io URLs. The existing `services/` dashboard page partially addresses this but makes brittle assumptions about deployment topology, making it unreliable across local, ingress, and HTTP gateway modes.

## What Changes

- Formalize the K8s Service annotation contract for UI URL declaration (`ark.mckinsey.com/marketplace-item-ui-url`, `ark.mckinsey.com/marketplace-item-ui-label`) — currently undocumented and inconsistently used
- Extend `marketplace.json` item schema with an optional `ui` block for static UI metadata (enables catalog-time display before installation)
- Add "Open UI" affordances (button/badge) to marketplace item cards and detail pages for items that expose a UI URL
- Add a "Has UI" filter to the marketplace page so users can find items with accessible interfaces
- Replace the brittle `app/(dashboard)/services/` page with a marketplace-integrated "Installed with UI" view
- Design (Phase 2) an embedded UI mechanism for items that render configuration screens inside the Ark dashboard

## Capabilities

### New Capabilities

- `marketplace-item-ui`: How marketplace items declare, expose, and surface UI links or embedded interfaces through the Ark dashboard — covering the annotation contract, `marketplace.json` schema extension, URL resolution hierarchy, dashboard affordances, and the embedded UI design for Phase 2

### Modified Capabilities

_(none — no existing spec-level behavior changes)_

## Impact

- **ark-dashboard**: Marketplace item cards, detail pages, and page-level filters; services page retired
- **marketplace.json schema** (`mckinsey/agents-at-scale-marketplace`): New optional `ui` block per item
- **ark-api**: Annotation-based UI URL discovery already implemented; may need minor hardening for multi-URL support
- **Documentation**: Marketplace item authors need guidance on declaring UI endpoints across deployment modes
- **Related issues**: #1248, #1522, #1594
