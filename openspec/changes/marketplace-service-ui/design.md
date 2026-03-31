## Context

The Ark dashboard has two separate pages that deal with installed services:

1. **Marketplace page** (`/marketplace`) — lists items from a GitHub-hosted `marketplace.json` manifest, detects installation status by cross-referencing with cluster resources (CRDs and labeled Deployments via PR #1440), supports install/uninstall actions.

2. **Services page** (`/services`) — lists Helm releases via `ark-api /v1/ark-services`, discovers URLs by matching HTTPRoute annotations to Helm release names, and renders clickable links. This page has known issues: hardcoded port assumptions (port 8080 for localhost-gateway), reliance on nip.io hostnames, and no support for Ingress or LoadBalancer networking setups.

PR #1440 established a pattern for marketplace installation detection: the marketplace manifest declares item metadata, Deployments in the cluster are labeled with `ark.mckinsey.com/marketplace-item`, and the dashboard queries these labeled Deployments via ark-api's `/v1/resources` endpoint with `labelSelector` support. Post-install hooks (Helm jobs) automate the labeling.

This design extends that pattern to also carry UI URL information, and uses it to sunset the services page.

## Goals / Non-Goals

**Goals:**
- Marketplace items that expose a web UI can surface an "Open" link in the dashboard
- URL discovery works regardless of networking setup (Ingress, Gateway API, LoadBalancer, port-forward)
- The services page functionality is fully absorbed by the marketplace page
- Follow the same patterns as PR #1440 (label on Deployment, dashboard-side logic, manifest declares intent)

**Non-Goals:**
- Embedded/iframe UIs within the dashboard (future work)
- OIDC token passthrough to marketplace item UIs (future work)
- Automatic URL detection from Ingress/HTTPRoute/Gateway resources (too fragile across setups)
- Cross-namespace resource discovery (deferred; requires ClusterRole)

## Decisions

### 1. UI URL carried as annotation on the labeled Deployment

The same Deployment that PR #1440 labels with `ark.mckinsey.com/marketplace-item` also carries an annotation `ark.mckinsey.com/ui-url` with the complete, ready-to-use URL.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    ark.mckinsey.com/marketplace-item: phoenix
  annotations:
    ark.mckinsey.com/ui-url: "https://phoenix.example.com"
```

**Why this over auto-discovery from networking resources:**
Reconstructing a URL from HTTPRoute/Ingress/Service resources requires chasing references (HTTPRoute → Gateway → listener for scheme and port), handling multiple resource types, and still can't reliably determine scheme, external port, or sub-paths. An annotation is explicit, works with any networking setup, and follows the Kubernetes convention of labels for selection and annotations for metadata (like `external-dns.alpha.kubernetes.io/hostname` or `cert-manager.io/cluster-issuer`).

**Why on the Deployment, not a separate ConfigMap or networking resource:**
The Deployment is already queried for installation detection. Adding an annotation to the same resource means zero additional API calls. Not all items have networking resources (some are local-only), but all installed items have a Deployment.

### 2. Manifest declares UI intent via `ark.ui` field

```json
{
  "name": "phoenix",
  "ark": {
    "helmReleaseName": "phoenix",
    "k8sServiceName": "phoenix",
    "k8sServicePort": 6006,
    "ui": {
      "enabled": true
    }
  }
}
```

`ark.ui.enabled: true` means "this item has a web UI." The dashboard uses this to know which items should show an "Open" button (when a URL is available) or port-forward instructions (when no URL is configured).

Items without `ark.ui` or with `ark.ui.enabled: false` never show UI-related controls.

### 3. Fallback to port-forward instructions

When `ark.ui.enabled: true` but no `ark.mckinsey.com/ui-url` annotation is found on the Deployment, the dashboard renders port-forward instructions using manifest data:

```
kubectl port-forward svc/phoenix 6006:6006
```

This uses `ark.k8sServiceName` and `ark.k8sServicePort` which are already in the manifest.

### 4. Dashboard reads annotation in existing detection flow

The dashboard already queries labeled Deployments via ark-api's `/v1/resources` endpoint (PR #1440). The response includes the full Deployment object with metadata. The dashboard reads `metadata.annotations["ark.mckinsey.com/ui-url"]` from the same response — no additional API call.

Flow:
1. Fetch marketplace manifest (existing)
2. For items with `ark.ui.enabled`, query labeled Deployment (existing PR #1440 flow)
3. Read `ark.mckinsey.com/ui-url` annotation from the Deployment response
4. Attach URL to `MarketplaceItem` as `uiUrl` field
5. Render "Open" button if `uiUrl` present, port-forward instructions if absent

### 5. Post-install hooks set the annotation

The marketplace repository's post-install hooks (which already label Deployments per PR #1440) are extended to also set the `ark.mckinsey.com/ui-url` annotation. The URL is derived from Helm values at install time.

### 6. Services page sunset via phased removal

Phase 1: Add "Open" button to marketplace page for items with URLs.
Phase 2: Add "Installed" filter view to marketplace page.
Phase 3: Remove services page from navigation, add redirect.
Phase 4: Remove services page code and ark-services API endpoint.

## Risks / Trade-offs

- **Admin must set the annotation for custom networking setups** → Acceptable trade-off. The admin who sets up Ingress/Gateway is the one who knows the URL. Marketplace Helm charts can template the annotation from values. Documentation will cover how to set it manually.

- **URL can become stale if networking changes** → The annotation is static. If an admin changes the Ingress hostname, they need to update the annotation. This matches how other annotation-based systems (external-dns, cert-manager) work. Mitigation: documentation.

- **Depends on PR #1440** → This work cannot start until PR #1440 is merged. Dashboard UI work (card changes, detail page) can be developed in parallel with mocked data.

- **Cross-namespace items won't have URL detection** → Items deployed outside ark-api's namespace can't be queried for Deployment annotations without ClusterRole. Deferred to future work. For now, these items show as "installed" (via PR #1440's `installScope: "cluster"` badge) but without an "Open" button.
