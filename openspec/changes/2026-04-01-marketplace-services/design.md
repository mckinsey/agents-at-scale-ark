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
- Marketplace items can surface their web UIs with "Open" button
- Solution only works for items in the same namespace as ark-api (namespace-scoped detection)
- No post-install hooks or complex patching required
- Leverage existing Helm and Kubernetes standards (no custom labels)
- Retire the services page in favor of enhanced marketplace page

**Non-Goals:**
- Embedded/iframe UIs within the dashboard (future work)
- OIDC token passthrough to marketplace item UIs (future work)
- Automatic URL detection from Ingress/HTTPRoute/Gateway resources (too fragile across setups)
- Cross-namespace resource discovery (deferred; requires ClusterRole)

## Decisions

### 1. Use Helm releases for installation detection

Query Helm releases via the existing `/v1/ark-services` endpoint to determine if a marketplace item is installed.

```typescript
// Detection flow
const releases = await fetch('/v1/ark-services?list_all_services=true')
const isInstalled = releases.items.some(r =>
  r.name === item.ark.helmReleaseName && r.status === 'deployed'
)
```

**Why Helm releases over Deployment labels:**
Helm releases are the source of truth for "this was installed." They're always present when something is installed via Helm, survive pod restarts and deployment disruptions, and ark-api already reads them via `/v1/ark-services`. This eliminates the need for custom labels, post-install hooks, and RBAC expansion for Deployment reads.

**What this enables:**
- Single detection mechanism (no two-tier CRD + fallback)
- Rich metadata available (version, revision, status, updated timestamp)
- No additional resources to label or patch
- Consistent with existing services page pattern

**Trade-off accepted:** Namespace-scoped detection only. Helm releases are stored as Secrets in the release namespace, and ark-api uses a Role (not ClusterRole), so it can only detect items in its own namespace.

### 2. Use Service annotations for UI URLs

For marketplace items with web UIs, store the externally-reachable URL as an annotation on the Kubernetes Service resource.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: phoenix
  labels:
    app.kubernetes.io/instance: "phoenix"  # Helm adds this automatically
  annotations:
    ark.mckinsey.com/ui-url: "https://phoenix.example.com"
spec:
  ports:
    - port: 6006
```

**Why Service annotations over Deployment annotations (PR #1598 original approach):**
Services are the network entry point and map 1:1 to endpoints. Service metadata is templatable from Helm values at install time (no post-install patching needed). This aligns with Kubernetes conventions where networking metadata lives on Service resources.

**Why annotations not Chart.yaml:**
Chart.yaml annotations are static (baked in at chart build time) and cannot be overridden at install time. Service annotations are runtime-configurable from Helm values, allowing admins to specify the URL for their specific networking setup.

**Example Helm chart template:**
```yaml
# templates/service.yaml
metadata:
  annotations:
    {{- if .Values.uiUrl }}
    ark.mckinsey.com/ui-url: "{{ .Values.uiUrl }}"
    {{- end }}
```

### 3. Query Services using Helm's standard label

To retrieve UI URLs, query Services for a Helm release using the standard `app.kubernetes.io/instance` label, then extract `ark.mckinsey.com/ui-url` annotations.

**Why `app.kubernetes.io/instance`:**
Helm automatically sets `app.kubernetes.io/instance: "{{ .Release.Name }}"` on all resources per [Helm best practices](https://helm.sh/docs/chart_best_practices/labels/). This is a Kubernetes standard label - no need to add custom labels.

**Multi-Service support:**
A single Helm release can create multiple Services (e.g., frontend + admin UIs). This query finds all Services for that release, each potentially having different `ui-url` annotations.

**Query pattern:**
```typescript
GET /v1/resources/v1/Service?labelSelector=app.kubernetes.io/instance=${helmReleaseName}
```

**Requires:** `/v1/resources` endpoint with `labelSelector` parameter support (added by PR #1440).

### 4. Marketplace manifest declares UI intent

Extend marketplace manifest with `ark.ui.enabled` field to indicate which items have web UIs.

```json
{
  "name": "phoenix",
  "ark": {
    "helmReleaseName": "phoenix",
    "namespace": "phoenix",
    "k8sServiceName": "phoenix",
    "k8sServicePort": 6006,
    "ui": {
      "enabled": true
    }
  }
}
```

**Why static UI declaration:**
The manifest declares "this item has a UI" as static metadata. The actual URL comes from the Helm install (environment-specific). This allows the dashboard to skip Service queries for items without UIs.

**Conditional query logic:**
- Dashboard only queries Services (Decision 3) when **both** conditions are true:
  1. `item.ark.ui.enabled === true` (manifest declares UI)
  2. `item.status === 'installed'` (Helm release deployed)
- If UI URL found: show "Open" button
- If no UI URL: item installed but URL not configured

### 5. Complete detection and UI URL flow

The dashboard combines Decisions 1-4 into a single flow. For each marketplace item:

```typescript
// Decision 1: Check if Helm release is deployed
const releases = await arkApi.getServices(namespace, true)
const isInstalled = releases.items.some(r =>
  r.name === item.ark.helmReleaseName && r.status === 'deployed'
)

// Decision 4: Only query Services if installed AND UI enabled
if (isInstalled && item.ark.ui?.enabled) {
  // Decision 3: Query Services using standard Helm label
  const services = await k8sApi.getServices({
    labelSelector: `app.kubernetes.io/instance=${item.ark.helmReleaseName}`
  })
  // Decision 2: Extract UI URL from Service annotation
  const uiUrl = services.items[0]?.metadata.annotations?.['ark.mckinsey.com/ui-url']

  if (uiUrl) {
    return <Button onClick={() => window.open(uiUrl)}>Open</Button>
  }
}
```

### 6. Services page sunset

The services page functionality is fully absorbed by the marketplace page. Users access installed service UIs through the marketplace page instead.

**Implementation steps:**
1. Add "Open" button to marketplace cards for items with UI URLs
2. Add "Installed" filter view to marketplace page
3. Remove services page from navigation
4. Remove services page code and components

### 7. Namespace vs cluster-scoped detection

The marketplace manifest includes an `installScope` field to distinguish between namespace-scoped and cluster-scoped deployments (addresses [#1522](https://github.com/mckinsey/agents-at-scale-ark/issues/1522)).

```json
{
  "name": "phoenix",
  "installScope": "cluster",
  "ark": {
    "helmReleaseName": "phoenix",
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

**No new endpoints needed.** Uses existing:
- `/v1/ark-services?list_all_services=true` — for Helm release queries
- `/v1/resources/v1/Service?labelSelector=...` — for Service queries (requires `labelSelector` support from PR #1440)

**RBAC:** Already has permissions to read Helm releases (Secrets) and Services in its namespace. No expansion needed.

### Dashboard (this repo)

**Modified files:**
- `lib/services/marketplace-fetcher.ts` — Detection logic using `/v1/ark-services`
- `lib/services/kubernetes.ts` — Service query helper using `labelSelector`
- `components/cards/marketplace-item-card.tsx` — "Open" button when `uiUrl` present
- `lib/api/generated/marketplace-types.ts` — Add `uiUrl` and `uiEnabled` fields

**Detection flow:**
```typescript
async function getInstalledMarketplaceItems(items: MarketplaceItem[]) {
  // Query all Helm releases once
  const releases = await fetch('/v1/ark-services?list_all_services=true')

  return items.map(item => {
    // Check if this item's Helm release exists and is deployed
    const isInstalled = releases.items.some(r =>
      r.name === item.ark.helmReleaseName && r.status === 'deployed'
    )
    let uiUrl = undefined

    // Only query Services if installed AND manifest declares UI
    if (isInstalled && item.ark.ui?.enabled) {
      const services = await fetch(
        `/v1/resources/v1/Service?labelSelector=app.kubernetes.io/instance=${item.ark.helmReleaseName}`
      )
      uiUrl = services.items[0]?.metadata.annotations?.['ark.mckinsey.com/ui-url']
    }

    return { ...item, status: isInstalled ? 'installed' : 'available', uiUrl }
  })
}
```

### Marketplace Charts (agents-at-scale-marketplace repo)

**For each chart with a web UI (phoenix, langfuse, a2a-inspector, mcp-inspector):**

1. **No label changes needed** — Helm already adds `app.kubernetes.io/instance: "{{ .Release.Name }}"` to all resources

2. **Add annotation to Service template:**
```yaml
# templates/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ include "phoenix.fullname" . }}
  annotations:
    {{- if .Values.uiUrl }}
    ark.mckinsey.com/ui-url: "{{ .Values.uiUrl }}"
    {{- end }}
spec:
  # ... existing spec
```

3. **Update values.yaml with UI URL config:**
```yaml
# values.yaml
# UI URL configuration (environment-specific)
uiUrl: ""  # Set via --set uiUrl=https://phoenix.example.com
```

4. **Update marketplace.json:**
```json
{
  "name": "phoenix",
  "ark": {
    "helmReleaseName": "phoenix",
    "ui": {
      "enabled": true
    }
  }
}
```

**Install examples:**
```bash
# URL configured
helm install phoenix ./chart \
  --set uiUrl=https://phoenix.example.com

# Local dev (no URL configured)
helm install phoenix ./chart
```

### Documentation

**For chart authors** (marketplace repo CONTRIBUTING.md):
```markdown
## UI URL Configuration

If your marketplace item has a web UI:

1. Add `ark.ui.enabled: true` to marketplace.json
2. Add `ark.mckinsey.com/ui-url` annotation to Service template, templated from `.Values.uiUrl`
3. Add `uiUrl: ""` to values.yaml with example usage in comments
```

**For users** (dashboard or marketplace docs):
```markdown
## Accessing Marketplace Item UIs

Items with web UIs show an "Open" button when installed with a configured URL:

```bash
# Set the externally-reachable URL for your networking setup
helm install <item> --set uiUrl=<your-url>

# Without URL configuration, item shows as installed but no "Open" button appears
```
```
