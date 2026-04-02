# Marketplace Installation Detection and UI URL Discovery

## Context

The Ark dashboard has two issues with marketplace services:

1. **Installation detection** — Infrastructure services (Phoenix, Langfuse, A2A Inspector, MCP Inspector) show as "not installed" even when successfully deployed. Dashboard detection queries Ark CRDs via export service, but these infrastructure services create only standard Kubernetes resources (Deployments, Services, HTTPRoutes) without Ark CRDs.

2. **UI access** — Marketplace items with web UIs have no way to surface those UIs through the dashboard. The services page (`/services`) attempts this but makes brittle assumptions about port-forwarding and nip.io routing, making it unreliable across deployment modes (Ingress, Gateway API, LoadBalancer, local).

Evidence of problem 1:
```bash
# Helm + pods running
$ helm list -A | grep phoenix
phoenix  phoenix  1  deployed  ✓

# No Ark CRDs exist
$ kubectl get agents,mcpservers,a2aservers -A | grep phoenix
(empty)  ✗

# Dashboard shows: "Get" (not installed)  ✗
```

**Prior work:**
- PR #1440 initially proposed Deployment labeling with post-install hooks
- PR #1598 extended this to include UI URL annotations on Deployments
- Community feedback suggested simplifying to use Helm releases directly

## Goals / Non-Goals

**Goals:**
- Infrastructure services show correct installation status in dashboard
- Marketplace items can surface their web UIs with "Open" button (or custom label)
- Solution only works for items in the same namespace as ark-api (namespace-scoped detection)
- No post-install hooks or complex patching required
- Leverage existing Helm and Kubernetes standards
- Retire the services page in favor of enhanced marketplace page

**Non-Goals:**
- Embedded/iframe UIs within the dashboard (future work)
- OIDC token passthrough to marketplace item UIs (future work)
- Automatic URL detection from Ingress/HTTPRoute/Gateway resources (too fragile across setups)
- Cross-namespace resource discovery (deferred; requires ClusterRole)

## Decisions

### 1. Use Helm releases with chart annotations for installation detection

Query Helm releases via the `/v1/marketplace-items` endpoint and match using the `ark.mckinsey.com/marketplace-item-name` annotation baked into `Chart.yaml`.

```yaml
# Chart.yaml for phoenix
apiVersion: v2
name: phoenix
annotations:
  ark.mckinsey.com/marketplace-item-name: "services/phoenix"
```

```typescript
// Detection flow
const releases = await fetch('/v1/marketplace-items')
const isInstalled = releases.items.some(r =>
  r.chart?.metadata?.annotations?.['ark.mckinsey.com/marketplace-item-name'] === item.name
  && r.status === 'deployed'
)
```

**Why chart annotations over Helm release name matching:**
Release names are chosen at install time by the user (`helm install my-obs ./phoenix-chart`). Chart annotations are baked in at build time and survive regardless of naming. This eliminates fragile coupling between release names and marketplace manifest entries.

**What this enables:**
- Single detection mechanism (no two-tier CRD + fallback)
- Rich metadata available (version, revision, status, updated timestamp)
- No additional resources to label or patch
- Users can name their releases freely

**Trade-off accepted:** Namespace-scoped detection only. Helm releases are stored as Secrets in the release namespace, and ark-api uses a Role (not ClusterRole), so it can only detect items in its own namespace.

### 2. Use Service annotations for UI URLs and labels

For marketplace items with web UIs, store the externally-reachable URL and optional display label as annotations on the Kubernetes Service resource.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: phoenix
  labels:
    app.kubernetes.io/instance: "phoenix"  # Helm adds this automatically
  annotations:
    ark.mckinsey.com/marketplace-item-ui-url: "https://phoenix.example.com"
    ark.mckinsey.com/marketplace-item-ui-label: "Dashboard"
spec:
  ports:
    - port: 6006
```

**Why Service annotations over Deployment annotations (PR #1598 original approach):**
Services are the network entry point and map 1:1 to endpoints. Service metadata is templatable from Helm values at install time (no post-install patching needed). This aligns with Kubernetes conventions where networking metadata lives on Service resources.

**Why annotations not Chart.yaml:**
Chart.yaml annotations are static (baked in at chart build time) and cannot be overridden at install time. Service annotations are runtime-configurable from Helm values, allowing admins to specify the URL for their specific networking setup.

**Multi-UI support via `marketplace-item-ui-label`:**
Some marketplace items expose multiple Services with UIs. For example, an Argo Workflows item might have a MinIO UI and an Argo dashboard. The `marketplace-item-ui-label` annotation lets each Service specify its display label. If absent, the dashboard falls back to "Open".

**Example Helm chart template:**
```yaml
# templates/service.yaml
metadata:
  annotations:
    {{- if .Values.uiUrl }}
    ark.mckinsey.com/marketplace-item-ui-url: "{{ .Values.uiUrl }}"
    {{- end }}
    {{- if .Values.uiLabel }}
    ark.mckinsey.com/marketplace-item-ui-label: "{{ .Values.uiLabel }}"
    {{- end }}
```

### 3. Query Services using Helm's standard label

To retrieve UI URLs, query Services for a Helm release using the standard `app.kubernetes.io/instance` label, then extract `ark.mckinsey.com/marketplace-item-ui-url` and `ark.mckinsey.com/marketplace-item-ui-label` annotations.

**Why `app.kubernetes.io/instance`:**
Helm automatically sets `app.kubernetes.io/instance: "{{ .Release.Name }}"` on all resources per [Helm best practices](https://helm.sh/docs/chart_best_practices/labels/). This is a Kubernetes standard label — no need to add custom labels.

**Multi-Service support:**
A single Helm release can create multiple Services (e.g., dashboard + admin UIs). This query finds all Services for that release, each potentially having different UI URL and label annotations.

**Query pattern:**
```typescript
GET /v1/resources/v1/Service?labelSelector=app.kubernetes.io/instance=${releaseName}
```

**Requires:** `/v1/resources` endpoint with `labelSelector` parameter support — single shared implementation used across all resource types (added by PR #1440).

### 4. No manifest-level UI declaration needed

The presence of the `ark.mckinsey.com/marketplace-item-ui-url` annotation on a Service is the signal that a UI exists. No `ark.ui.enabled` field is needed in the marketplace manifest.

**Conditional query logic:**
- Dashboard queries Services (Decision 3) for all installed marketplace items
- If any matching Service has a `marketplace-item-ui-url` annotation: show button with label from `marketplace-item-ui-label` (or "Open" as fallback)
- If no UI URL annotation found: item is installed but has no UI

### 5. Complete detection and UI URL flow

The dashboard combines Decisions 1-4 into a single flow. For each marketplace item:

```typescript
// Decision 1: Check if Helm release is deployed (by chart annotation)
const releases = await arkApi.getMarketplaceItems(namespace)
const matchingRelease = releases.items.find(r =>
  r.chart?.metadata?.annotations?.['ark.mckinsey.com/marketplace-item-name'] === item.name
  && r.status === 'deployed'
)

if (matchingRelease) {
  // Decision 3: Query Services using standard Helm label
  const services = await k8sApi.getServices({
    labelSelector: `app.kubernetes.io/instance=${matchingRelease.name}`
  })

  // Decision 2: Extract UI URLs and labels from Service annotations
  const uis = services.items
    .filter(svc => svc.metadata.annotations?.['ark.mckinsey.com/marketplace-item-ui-url'])
    .map(svc => ({
      url: svc.metadata.annotations['ark.mckinsey.com/marketplace-item-ui-url'],
      label: svc.metadata.annotations['ark.mckinsey.com/marketplace-item-ui-label'] || 'Open'
    }))

  // Render buttons for each UI
  uis.forEach(ui => <Button onClick={() => window.open(ui.url)}>{ui.label}</Button>)
}
```

### 6. Services page sunset

The services page functionality is fully absorbed by the marketplace page. Users access installed service UIs through the marketplace page instead.

**Implementation steps:**
1. Add buttons to marketplace cards for items with UI URLs (using label or "Open" fallback)
2. Add "Installed" filter view to marketplace page
3. Remove services page from navigation
4. Remove services page code and components

### 7. Namespace vs cluster-scoped detection

The marketplace manifest includes an `installScope` field to distinguish between namespace-scoped and cluster-scoped deployments (addresses [#1522](https://github.com/mckinsey/agents-at-scale-ark/issues/1522)).

```json
{
  "name": "services/phoenix",
  "installScope": "namespace",
  "ark": {
    "namespace": "phoenix"
  }
}
```

**Scope values:**
- `"namespace"`: Item deployed in the same namespace as ark-api — detection supported
- `"cluster"`: Item may be deployed in different namespace or cluster-wide — detection not supported, requires manual verification

**Dashboard behavior:**
- **Namespace-scoped items**: Show "Installed" when Helm release detected in ark-api's namespace
- **Cluster-scoped items**: Always show "Get" with scope badge indicating manual verification needed
- Badge displayed on marketplace cards: `[Namespace]` or `[Cluster]`

**Why this matters:**
Users need to understand detection limitations. Cluster-scoped items (like operators) may be installed but won't auto-detect due to namespace-scoped RBAC. The badge sets correct expectations.

**Implementation:**
```typescript
// In marketplace card
{item.installScope === 'cluster' && (
  <Badge>Cluster</Badge>
)}
{item.installScope === 'namespace' && (
  <Badge>Namespace</Badge>
)}
```

## Risks / Trade-offs

**Namespace limitation** — ark-api can only detect items in its own namespace due to Role-scoped RBAC (not ClusterRole). Items deployed to other namespaces cannot be auto-detected.

*Mitigation:* Marketplace manifest can include `installScope: "cluster"` badge to inform users. Future work could add ClusterRole option for cluster-wide detection.

**URL configuration burden** — Admins must set the `uiUrl` Helm value at install time for their networking setup (Ingress hostname, LoadBalancer IP, etc.).

*Mitigation:* This is acceptable because the admin who sets up networking knows the URL. Chart templates can provide sensible defaults (localhost + port for local dev).

**URL staleness** — If admin changes Ingress hostname after install, the Service annotation becomes stale.

*Mitigation:* This matches how other annotation-based systems work (external-dns, cert-manager). Admin must update annotation when networking changes. Helm upgrade with new values updates the annotation.

**HTTPRoute auto-discovery** — The `/v1/ark-services` endpoint already discovers HTTPRoutes and constructs URLs. Why not use this?

*Mitigation:* HTTPRoute discovery only works for Gateway API deployments, not Ingress, LoadBalancer, or port-forward setups (the "fragile assumptions" mentioned in #1596). Explicit Service annotations work universally across all deployment modes.

## Implementation Notes

### ark-api (this repo)

**New endpoint:** `/v1/marketplace-items` — queries Helm releases and returns them for dashboard consumption. Replaces `/v1/ark-services` for this use case.

**Existing endpoint:** `/v1/resources/v1/Service?labelSelector=...` — for Service queries. `labelSelector` must be a single shared implementation used across all resource types (requires support from PR #1440).

**RBAC:** Already has permissions to read Helm releases (Secrets) and Services in its namespace. No expansion needed.

### Dashboard (this repo)

**Modified files:**
- `lib/services/marketplace-fetcher.ts` — Detection logic using `/v1/marketplace-items`
- `lib/services/kubernetes.ts` — Service query helper using `labelSelector`
- `components/cards/marketplace-item-card.tsx` — UI buttons with labels when URL annotations present
- `lib/api/generated/marketplace-types.ts` — Add `uiUrl` and `uiLabel` fields

**Detection flow:**
```typescript
async function getInstalledMarketplaceItems(items: MarketplaceItem[]) {
  const releases = await fetch('/v1/marketplace-items')

  return items.map(item => {
    const matchingRelease = releases.items.find(r =>
      r.chart?.metadata?.annotations?.['ark.mckinsey.com/marketplace-item-name'] === item.name
      && r.status === 'deployed'
    )

    let uis: { url: string; label: string }[] = []

    if (matchingRelease) {
      const services = await fetch(
        `/v1/resources/v1/Service?labelSelector=app.kubernetes.io/instance=${matchingRelease.name}`
      )
      uis = services.items
        .filter(svc => svc.metadata.annotations?.['ark.mckinsey.com/marketplace-item-ui-url'])
        .map(svc => ({
          url: svc.metadata.annotations['ark.mckinsey.com/marketplace-item-ui-url'],
          label: svc.metadata.annotations['ark.mckinsey.com/marketplace-item-ui-label'] || 'Open'
        }))
    }

    return {
      ...item,
      status: matchingRelease ? 'installed' : 'available',
      uis
    }
  })
}
```

### Marketplace Charts (agents-at-scale-marketplace repo)

**For each chart:**

1. **Add marketplace item annotation to Chart.yaml:**
```yaml
# Chart.yaml
apiVersion: v2
name: phoenix
annotations:
  ark.mckinsey.com/marketplace-item-name: "services/phoenix"
```

2. **For charts with a web UI, add annotations to Service template:**
```yaml
# templates/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ include "phoenix.fullname" . }}
  annotations:
    {{- if .Values.uiUrl }}
    ark.mckinsey.com/marketplace-item-ui-url: "{{ .Values.uiUrl }}"
    {{- end }}
    {{- if .Values.uiLabel }}
    ark.mckinsey.com/marketplace-item-ui-label: "{{ .Values.uiLabel }}"
    {{- end }}
spec:
  # ... existing spec
```

3. **Update values.yaml with UI config:**
```yaml
# values.yaml
uiUrl: ""      # Set via --set uiUrl=https://phoenix.example.com
uiLabel: ""    # Set via --set uiLabel="Dashboard" (defaults to "Open" if empty)
```

4. **Update marketplace.json:**
```json
{
  "name": "services/phoenix",
  "installScope": "namespace",
  "ark": {
    "namespace": "phoenix"
  }
}
```

**Install examples:**
```bash
# URL and label configured
helm install phoenix ./chart \
  --set uiUrl=https://phoenix.example.com \
  --set uiLabel="Phoenix Dashboard"

# Local dev (no URL configured — no "Open" button shown)
helm install phoenix ./chart
```

### Documentation

**For chart authors** (marketplace repo CONTRIBUTING.md):
```markdown
## Marketplace Item Detection

Add the `ark.mckinsey.com/marketplace-item-name` annotation to your Chart.yaml:
  ark.mckinsey.com/marketplace-item-name: "<type>/<name>"

## UI URL Configuration

If your marketplace item has a web UI:
1. Add `ark.mckinsey.com/marketplace-item-ui-url` annotation to Service template, templated from `.Values.uiUrl`
2. Optionally add `ark.mckinsey.com/marketplace-item-ui-label` for a custom button label (defaults to "Open")
3. Add `uiUrl: ""` and `uiLabel: ""` to values.yaml
```

**For users** (dashboard or marketplace docs):
```markdown
## Accessing Marketplace Item UIs

Items with web UIs show a button (labeled per the chart author, or "Open") when installed with a configured URL:

  helm install <item> --set uiUrl=<your-url> --set uiLabel="My Dashboard"

Without URL configuration, item shows as installed but no button appears.
```
