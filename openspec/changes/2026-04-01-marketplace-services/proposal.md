# Marketplace installation detection and UI URL discovery

## Why

**Problem 1: Infrastructure services don't show as installed** ([#1269](https://github.com/mckinsey/agents-at-scale-ark/issues/1269))

Infrastructure marketplace services (Phoenix, Langfuse, A2A Inspector, MCP Inspector) show as "not installed" in the dashboard even when successfully deployed. Dashboard detection only checks Ark CRDs, but these services create only standard Kubernetes resources.

**Problem 2: No way to access marketplace item UIs** (addresses part of [#1596](https://github.com/mckinsey/agents-at-scale-ark/issues/1596))

Marketplace items that expose web UIs have no reliable way to surface their UI through the dashboard. The current services page attempts this but relies on fragile assumptions about networking setups, making it unreliable across different environments. By adding UI URL support directly to the marketplace page, we can provide a reliable "Open" action for installed services and sunset the services page entirely.

## What Changes

- Marketplace items are detected by querying Helm releases and checking for the `ark.mckinsey.com/marketplace-item-name` chart annotation
- Service annotations carry UI URLs (`ark.mckinsey.com/marketplace-item-ui-url`) and optional display labels (`ark.mckinsey.com/marketplace-item-ui-label`) for items with web interfaces
- Marketplace manifest extends with `installScope` field to indicate namespace vs cluster-scoped deployment
- Dashboard queries Helm releases via ark-api's `/v1/marketplace-items` endpoint
- Dashboard queries Services using Helm's standard label `app.kubernetes.io/instance` to retrieve UI URLs
- Dashboard renders "Open" button (or custom label) on marketplace cards and detail pages when a UI URL annotation is present
- Dashboard displays scope badge (namespace/cluster) to indicate detection capability and deployment scope
- Services page is deprecated and removed, with functionality absorbed by marketplace page

## Why Helm Releases with Chart Annotations

- Source of truth: Helm release exists if and only if item was installed via Helm
- Survives disruptions: Helm releases persist through pod restarts, deployment failures
- Rich metadata: Contains version, revision, status, updated timestamp
- Annotation-based matching: `ark.mckinsey.com/marketplace-item-name` in `Chart.yaml` is baked in at build time and survives regardless of what the user names their release
- No RBAC expansion: ark-api already has permissions to read Helm releases
- No fragile name coupling: Users can name their Helm release anything and detection still works

## Why Service Annotations for UI URLs

- Runtime configurable: Service annotations set from Helm values at install time
- Network entry point: Service is the natural place for URL metadata
- Standard Helm labels: Query Services using `app.kubernetes.io/instance` (automatically added by Helm)
- Multi-Service support: Finds all Services for a Helm release (supports multiple UIs per marketplace item via `marketplace-item-ui-label`)
- Network agnostic: URL annotation works with any setup (Ingress, Gateway API, LoadBalancer, port-forward)

## Capabilities

### New Capabilities
- `marketplace-item-listing`: Dashboard detects installed marketplace items by querying Helm releases and matching chart annotations
- `ui-url-discovery`: Service annotations provide UI endpoint URLs with optional display labels
- `marketplace-open-action`: Dashboard renders "Open" action (or custom label) for installed items when UI URL annotation is present
- `services-page-sunset`: Services page deprecated and removed, functionality absorbed by marketplace page

### Modified Capabilities
- `marketplace-installation-detection`: Detection via `ark.mckinsey.com/marketplace-item-name` chart annotation

## Impact

### ark-api
- Exposes `/v1/marketplace-items` endpoint for Helm release queries (replaces `/v1/ark-services` for this use case)
- Requires `/v1/resources` endpoint with `labelSelector` parameter support (single shared implementation)
- ark-api already has RBAC to read Helm releases (Secrets) and Services in its namespace
- **Namespace limitation:** Can only detect items in same namespace as ark-api

### Dashboard
- Modified: `marketplace-fetcher.ts`, `marketplace-item-card.tsx`, marketplace detail page
- Query Helm releases via `/v1/marketplace-items`
- Match releases by chart annotation: `release.chart.metadata.annotations["ark.mckinsey.com/marketplace-item-name"] == item.name`
- Query Services by Helm label: `GET /v1/resources/v1/Service?labelSelector=app.kubernetes.io/instance={releaseName}`
- Extract `marketplace-item-ui-url` and `marketplace-item-ui-label` annotations from all matching Services (supports multiple UIs)
- Extended types: Add `uiUrl`, `uiLabel` to `MarketplaceItem`
- Remove: Services page and ark-services components

### Marketplace Repository
- `Chart.yaml` includes `ark.mckinsey.com/marketplace-item-name` annotation (e.g., `services/phoenix`)
- Service templates include `ark.mckinsey.com/marketplace-item-ui-url` annotation (set from Helm values)
- Service templates optionally include `ark.mckinsey.com/marketplace-item-ui-label` annotation (e.g., "Dashboard", "MinIO Console")
- Marketplace manifest extended with `installScope` field
- No `helmReleaseName` needed in manifest for detection purposes

## Alternatives Considered

**Helm release name matching:** Matching marketplace.json `helmReleaseName` to Helm release name. Fragile because users can name their release anything (`helm install observability ./phoenix-chart`). Chart annotation is baked in at build time and survives regardless.

**Custom Service labels:** Adding `ark.mckinsey.com/marketplace-item` label to Services. Not needed since Helm already adds standard `app.kubernetes.io/instance` label to all resources.

**Chart.yaml annotations for UI URLs:** Chart.yaml annotations are static (baked in at build time) and cannot be overridden at install time. Service annotations are runtime-configurable from Helm values.

**Deployment resources:** Would require additional RBAC permissions and doesn't align with the network entry point concept for UI URLs.

**Auto-discovery from HTTPRoute/Ingress:** Too fragile across different networking setups and cannot reliably determine URLs.

**`ark.ui.enabled` manifest field:** Unnecessary. The presence of the `ark.mckinsey.com/marketplace-item-ui-url` annotation on a Service is the signal that a UI exists. No separate manifest flag needed.

## References

- [Labels and Selectors - Kubernetes](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/)
- [Recommended Labels - Kubernetes](https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/)
- [Helm Labels and Annotations Best Practices](https://helm.sh/docs/chart_best_practices/labels/)
