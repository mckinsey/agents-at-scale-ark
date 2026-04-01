# Marketplace installation detection and UI URL discovery

## Why

**Problem 1: Infrastructure services don't show as installed** ([#1269](https://github.com/mckinsey/agents-at-scale-ark/issues/1269))

Infrastructure marketplace services (Phoenix, Langfuse, A2A Inspector, MCP Inspector) show as "not installed" in the dashboard even when successfully deployed. Dashboard detection only checks Ark CRDs, but these services create only standard Kubernetes resources.

**Problem 2: No way to access marketplace item UIs** (addresses part of [#1596](https://github.com/mckinsey/agents-at-scale-ark/issues/1596))

Marketplace items that expose web UIs have no reliable way to surface their UI through the dashboard. The current services page attempts this but relies on fragile assumptions about networking setups, making it unreliable across different environments. By adding UI URL support directly to the marketplace page, we can provide a reliable "Open" action for installed services and sunset the services page entirely.

## What Changes

- Marketplace items are detected by querying Helm releases and matching release names to manifest `helmReleaseName`
- Service annotations carry UI URLs (`ark.mckinsey.com/ui-url`) for items with web interfaces
- Marketplace manifest extends with `ark.ui.enabled` field to declare UI intent and `installScope` field to indicate namespace vs cluster-scoped deployment
- Dashboard queries Helm releases via ark-api's existing `/v1/ark-services` endpoint
- Dashboard queries Services using Helm's standard label `app.kubernetes.io/instance={helmReleaseName}` to retrieve UI URLs
- Dashboard renders "Open" button on marketplace cards and detail pages when UI is enabled and URL is configured
- Dashboard displays scope badge (namespace/cluster) to indicate detection capability and deployment scope
- Services page is deprecated and removed, with functionality absorbed by marketplace page

## Why Helm Releases

- Source of truth: Helm release exists if and only if item was installed via Helm
- Survives disruptions: Helm releases persist through pod restarts, deployment failures
- Rich metadata: Contains version, revision, status, updated timestamp
- Already implemented: `/v1/ark-services` endpoint queries Helm releases
- Direct name matching: marketplace.json `helmReleaseName` matches Helm release name
- No RBAC expansion: ark-api already has permissions to read Helm releases
- No additional metadata: Use existing release names, no new annotations needed

## Why Service Annotations for UI URLs

- Runtime configurable: Service annotations set from Helm values at install time
- Network entry point: Service is the natural place for URL metadata
- Standard Helm labels: Query Services using `app.kubernetes.io/instance={helmReleaseName}` (automatically added by Helm)
- Multi-Service support: Finds all Services for a Helm release (supports multiple UIs per marketplace item)
- Network agnostic: URL annotation works with any setup (Ingress, Gateway API, LoadBalancer, port-forward)

## Capabilities

### New Capabilities
- `helm-release-detection`: Dashboard detects installed marketplace items by querying Helm releases and matching names
- `ui-url-discovery`: Service annotations provide UI endpoint URLs
- `marketplace-ui-enabled`: Marketplace manifest declares UI intent
- `marketplace-open-action`: Dashboard renders "Open" action for installed items when UI enabled and URL configured
- `services-page-sunset`: Services page deprecated and removed, functionality absorbed by marketplace page

### Modified Capabilities
- `marketplace-installation-detection`: Detection via Helm release name matching

## Impact

### ark-api
- Uses existing `/v1/ark-services` endpoint for Helm release queries
- Requires `/v1/resources` endpoint with `labelSelector` parameter support
- ark-api already has RBAC to read Helm releases (Secrets) and Services in its namespace
- **Namespace limitation:** Can only detect items in same namespace as ark-api

### Dashboard
- Modified: `marketplace-fetcher.ts`, `marketplace-item-card.tsx`, marketplace detail page
- Query Helm releases via `/v1/ark-services?list_all_services=true`
- Match releases by name: `release.name == item.ark.helmReleaseName`
- Query Services by Helm label: `GET /v1/resources/v1/Service?labelSelector=app.kubernetes.io/instance={helmReleaseName}`
- Extract `ui-url` annotations from all matching Services (supports multiple UIs)
- Extended types: Add `uiUrl` and `uiEnabled` to `MarketplaceItem`
- Remove: Services page and ark-services components

### Marketplace Repository
- Service templates include `ark.mckinsey.com/ui-url` annotation
- Annotation set from Helm values at install time
- Marketplace manifest extended with `ark.ui` field
- No Chart.yaml changes needed

## Alternatives Considered

**Custom Service labels:** Adding `ark.mckinsey.com/marketplace-item` label to Services. Not needed since Helm already adds standard `app.kubernetes.io/instance={releaseName}` label to all resources.

**Chart.yaml annotations:** Adding marketplace metadata to Chart.yaml. Not needed since manifest `helmReleaseName` already matches Helm release name.

**Deployment resources:** Would require additional RBAC permissions and doesn't align with the network entry point concept for UI URLs.

**Auto-discovery from HTTPRoute/Ingress:** Too fragile across different networking setups and cannot reliably determine URLs.

## References

- [Labels and Selectors - Kubernetes](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/)
- [Recommended Labels - Kubernetes](https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/)
- [Helm Labels and Annotations Best Practices](https://helm.sh/docs/chart_best_practices/labels/)
