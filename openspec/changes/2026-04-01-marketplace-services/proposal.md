# Marketplace installation detection and UI URL discovery

## Why

**Problem 1: Marketplace items don't show as installed** ([#1269](https://github.com/mckinsey/agents-at-scale-ark/issues/1269))

Marketplace items (Phoenix, Langfuse, A2A Inspector, MCP Inspector) show as "not installed" in the dashboard even when deployed. Dashboard detection only checks Ark CRDs, but these items create standard Kubernetes resources without Ark CRDs.

**Problem 2: No way to access marketplace item UIs** (addresses part of [#1596](https://github.com/mckinsey/agents-at-scale-ark/issues/1596))

Marketplace items with web UIs have no way to surface them through the dashboard. The services page relies on fragile networking assumptions. By adding UI URL support to the marketplace page, we provide a reliable "Open" action and sunset the services page.

## What Changes

- Marketplace page shows items in the user's current namespace only
- Items are detected by querying Helm releases and checking the `ark.mckinsey.com/marketplace-item-name` chart annotation
- Service annotations carry UI URLs (`ark.mckinsey.com/marketplace-item-ui-url`) and optional display labels (`ark.mckinsey.com/marketplace-item-ui-label`)
- Dashboard queries Helm releases via ark-api's `/v1/marketplace-items` endpoint
- Dashboard queries Services using Helm's standard `app.kubernetes.io/instance` label to retrieve UI URLs
- Dashboard renders buttons on marketplace cards when a UI URL annotation is present
- Services page is removed, functionality absorbed by marketplace page

## Why Helm Releases with Chart Annotations

- Source of truth: Helm release exists if and only if item was installed via Helm
- Survives disruptions: Helm releases persist through pod restarts, deployment failures
- Rich metadata: version, revision, status, updated timestamp
- Annotation-based matching: `ark.mckinsey.com/marketplace-item-name` in `Chart.yaml` is baked in at build time, survives regardless of release naming
- No RBAC expansion: ark-api already has permissions to read Helm releases

## Why Service Annotations for UI URLs

- Runtime configurable: set from Helm values at install time
- Network entry point: Service is the natural place for URL metadata
- Standard Helm labels: query using `app.kubernetes.io/instance` (added by Helm automatically)
- Multi-Service support: multiple UIs per marketplace item via `marketplace-item-ui-label`
- Network agnostic: works with Ingress, Gateway API, LoadBalancer, port-forward

## Capabilities

### New
- `marketplace-item-listing`: Detect installed items by querying Helm releases and matching chart annotations
- `ui-url-discovery`: Service annotations provide UI URLs with optional display labels
- `marketplace-open-action`: Dashboard renders buttons for installed items with UI URLs
- `services-page-sunset`: Services page removed, absorbed by marketplace page

### Modified
- `marketplace-installation-detection`: Detection via `ark.mckinsey.com/marketplace-item-name` chart annotation

## Impact

### ark-api
- Exposes `/v1/marketplace-items` endpoint for Helm release queries
- Requires `labelSelector` parameter on `/v1/resources` (single shared implementation)
- Already has RBAC to read Helm releases (Secrets) and Services in its namespace

### Dashboard
- Query Helm releases via `/v1/marketplace-items`
- Match by chart annotation: `release.chart.metadata.annotations["ark.mckinsey.com/marketplace-item-name"] == item.name`
- Query Services by Helm label to extract UI URLs and labels
- Add `uis` field to `MarketplaceItem` type
- Remove services page and ark-services components

### Marketplace Repository
- `Chart.yaml` includes `ark.mckinsey.com/marketplace-item-name` annotation
- Service templates include `ark.mckinsey.com/marketplace-item-ui-url` annotation
- Service templates optionally include `ark.mckinsey.com/marketplace-item-ui-label` annotation

## Alternatives Considered

**Helm release name matching:** Fragile — users can name releases anything. Chart annotation is baked in at build time.

**`ark.ui.enabled` manifest field:** Unnecessary. Annotation presence on the Service is the signal.

**Auto-discovery from HTTPRoute/Ingress:** Too fragile across networking setups.

**`ark.ui.enabled` manifest field:** Unnecessary. The presence of the `ark.mckinsey.com/marketplace-item-ui-url` annotation on a Service is the signal that a UI exists. No separate manifest flag needed.

## References

- [Recommended Labels - Kubernetes](https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/)
- [Helm Labels and Annotations Best Practices](https://helm.sh/docs/chart_best_practices/labels/)
