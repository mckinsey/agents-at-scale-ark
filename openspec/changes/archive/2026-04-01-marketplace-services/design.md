# Marketplace Installation Detection and UI URL Discovery

## Context

The Ark marketplace page has two issues:

1. **Installation detection** — Marketplace items (Phoenix, Langfuse, A2A Inspector, MCP Inspector) show as "not installed" even when deployed. Dashboard detection queries Ark CRDs, but these items create only standard Kubernetes resources.

2. **UI access** — Items with web UIs have no way to surface them. The services page makes brittle assumptions about port-forwarding and nip.io routing.

Evidence:
```bash
$ helm list | grep phoenix
phoenix  default  1  deployed  ✓

$ kubectl get agents,mcpservers -A | grep phoenix
(empty)

# Dashboard shows: "Get" (not installed)
```

**Prior work:** PR #1440 (Deployment labeling), PR #1598 (UI URL annotations on Deployments). Community feedback suggested using Helm releases directly.

## Goals / Non-Goals

**Goals:**
- Marketplace page shows items in the user's current namespace
- Items show correct installation status
- Items with web UIs get an "Open" button (or custom label)
- No post-install hooks or complex patching
- Leverage existing Helm and Kubernetes standards
- Retire the services page

**Non-Goals:**
- Cross-namespace discovery (marketplace = current namespace only)
- Embedded/iframe UIs within the dashboard
- OIDC token passthrough to item UIs
- Automatic URL detection from Ingress/HTTPRoute/Gateway

## Decisions

### 1. Marketplace page is current-namespace only

The marketplace page shows what is installed in the user's current namespace. Detection queries Helm releases in that namespace. If a user installs something, it goes to their namespace.

### 2. Detect installed items via chart annotations

Query Helm releases via `/v1/marketplace-items` and match using the `ark.mckinsey.com/marketplace-item-name` annotation in `Chart.yaml`.

```yaml
# Chart.yaml for phoenix
apiVersion: v2
name: phoenix
annotations:
  ark.mckinsey.com/marketplace-item-name: "services/phoenix"
```

```typescript
const releases = await fetch('/v1/marketplace-items')
const isInstalled = releases.items.some(r =>
  r.chart?.metadata?.annotations?.['ark.mckinsey.com/marketplace-item-name'] === item.name
  && r.status === 'deployed'
)
```

**Why chart annotations over release name matching:**
Release names are chosen at install time. Chart annotations are baked in at build time and survive regardless of naming.

### 3. UI URLs and labels via Service annotations

Store the externally-reachable URL and optional display label as annotations on the Kubernetes Service.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: phoenix
  labels:
    app.kubernetes.io/instance: "phoenix"
  annotations:
    ark.mckinsey.com/marketplace-item-ui-url: "https://phoenix.example.com"
    ark.mckinsey.com/marketplace-item-ui-label: "Dashboard"
spec:
  ports:
    - port: 6006
```

**Multi-UI support:** Some items expose multiple Services with UIs (e.g., Argo Workflows: MinIO + Argo dashboard). Each Service can have its own URL and label. If label is absent, dashboard shows "Open".

**Helm chart template:**
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

### 4. Query Services using Helm's standard label

Query Services for a Helm release using `app.kubernetes.io/instance`, then extract UI annotations.

```typescript
GET /v1/resources/v1/Service?labelSelector=app.kubernetes.io/instance=${releaseName}
```

Helm automatically sets this label on all resources. Single shared `labelSelector` implementation on the `/v1/resources` endpoint.

### 5. No manifest-level UI declaration

The `ark.mckinsey.com/marketplace-item-ui-url` annotation on a Service is the signal a UI exists. No `ark.ui.enabled` manifest field needed.

### 6. Complete flow

```typescript
const releases = await arkApi.getMarketplaceItems(namespace)

return items.map(item => {
  const release = releases.items.find(r =>
    r.chart?.metadata?.annotations?.['ark.mckinsey.com/marketplace-item-name'] === item.name
    && r.status === 'deployed'
  )

  let uis: { url: string; label: string }[] = []

  if (release) {
    const services = await k8sApi.getServices({
      labelSelector: `app.kubernetes.io/instance=${release.name}`
    })
    uis = services.items
      .filter(svc => svc.metadata.annotations?.['ark.mckinsey.com/marketplace-item-ui-url'])
      .map(svc => ({
        url: svc.metadata.annotations['ark.mckinsey.com/marketplace-item-ui-url'],
        label: svc.metadata.annotations['ark.mckinsey.com/marketplace-item-ui-label'] || 'Open'
      }))
  }

  return { ...item, status: release ? 'installed' : 'available', uis }
})
```

### 7. Services page sunset

1. Add buttons to marketplace cards for items with UI URLs
2. Add "Installed" filter to marketplace page
3. Remove services page and components

## Risks / Trade-offs

**URL configuration burden** — Admins must set `uiUrl` at install time. Acceptable because the admin who sets up networking knows the URL.

**URL staleness** — If networking changes, the annotation becomes stale. `helm upgrade` with new values fixes it.

## Implementation Notes

### ark-api (this repo)

**New endpoint:** `/v1/marketplace-items` — queries Helm releases in current namespace.

**Existing endpoint:** `/v1/resources/v1/Service?labelSelector=...` — single shared `labelSelector` implementation.

**RBAC:** Already has permissions. No expansion needed.

### Dashboard (this repo)

**Modified files:**
- `lib/services/marketplace-fetcher.ts` — detection logic
- `lib/services/kubernetes.ts` — Service query helper
- `components/cards/marketplace-item-card.tsx` — UI buttons
- `lib/api/generated/marketplace-types.ts` — add `uis` field

**Removed:**
- Services page and ark-services components

### Marketplace Charts (agents-at-scale-marketplace repo)

1. Add `ark.mckinsey.com/marketplace-item-name` to `Chart.yaml`
2. Add `ark.mckinsey.com/marketplace-item-ui-url` to Service template (from `.Values.uiUrl`)
3. Optionally add `ark.mckinsey.com/marketplace-item-ui-label` (from `.Values.uiLabel`)
4. Add `uiUrl: ""` and `uiLabel: ""` to `values.yaml`

**Install example:**
```bash
helm install phoenix ./chart \
  --set uiUrl=https://phoenix.example.com \
  --set uiLabel="Phoenix Dashboard"
```
