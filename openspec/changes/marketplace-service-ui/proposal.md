## Why

Marketplace items that expose web UIs (Phoenix, Langfuse, A2A Inspector, etc.) have no way to surface their UI through the Ark dashboard. The current services page attempts this but relies on fragile assumptions about port-forwarding and nip.io routing, making it unreliable across different networking setups (Ingress, Gateway API, LoadBalancer, local). By adding UI URL support directly to the marketplace page, we can provide a reliable "Open" action for installed services and sunset the services page entirely.

## What Changes

- Marketplace items can declare they expose a web UI via a new `ark.ui` field in the marketplace manifest
- Installed marketplace items carry their externally-reachable URL as a Kubernetes annotation (`ark.mckinsey.com/ui-url`) on the same Deployment that PR #1440 already labels for installation detection
- The dashboard reads this annotation during marketplace item fetching and renders an "Open" button on marketplace cards and detail pages for installed items with a URL
- Post-install hooks in the marketplace repository are extended to set the `ui-url` annotation alongside the existing `marketplace-item` label
- The services page is deprecated and eventually removed, with its functionality absorbed by the marketplace page
- An "Installed" filter/view on the marketplace page replaces the services page's list of deployed services

## Capabilities

### New Capabilities
- `marketplace-ui-url`: Annotation-based UI URL discovery for marketplace items, including manifest schema extension, dashboard rendering of "Open" action, and fallback to port-forward instructions when no URL is configured
- `services-page-sunset`: Deprecation and removal of the services page, with its functionality absorbed by the marketplace page's installed items view

### Modified Capabilities

## Impact

- **Marketplace manifest schema** (`marketplace.json`): New `ark.ui` field on items
- **Dashboard** (`services/ark-dashboard`): Modified marketplace-fetcher, marketplace-item-card, marketplace detail page; eventually removed services page and ark-services components
- **Marketplace repository** (external: `mckinsey/agents-at-scale-marketplace`): Post-install hooks updated to annotate Deployments with `ark.mckinsey.com/ui-url`
- **ark-api**: No changes beyond what PR #1440 already provides (labelSelector on /v1/resources)
- **Depends on**: PR #1440 (marketplace installation detection) being merged first
