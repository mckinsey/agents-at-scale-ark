# Fix marketplace installation detection for infrastructure services

## Why

Infrastructure marketplace services (`phoenix`, `a2a-inspector`, `mcp-inspector`) show as "not installed" in the dashboard even when successfully deployed (Helm releases exist, pods running).

Dashboard detection (`marketplace-fetcher.ts:getInstalledMarketplaceItems()`) only checks Ark CRDs via `/api/v1/agents`, `/api/v1/mcp-servers`, `/api/v1/a2a-servers`, etc. These infrastructure services create only standard Kubernetes resources (Deployment, Service, HTTPRoute), no Ark CRDs — they don't integrate with Ark's resource model.

Evidence:
```bash
# Helm + pods running for phoenix
$ helm list -A | grep phoenix
phoenix  phoenix  1  deployed  ✓

$ kubectl get pods -n phoenix | grep phoenix
phoenix-xxx  1/1  Running  ✓

# No Ark CRDs exist
$ kubectl get agents,mcpservers,a2aservers -A | grep phoenix
(empty)  ✗

# Dashboard shows: "Get" (not installed)  ✗
```

**Note:** `file-gateway` has a similar issue (name mismatch) but is being fixed separately via marketplace chart update.

## What Changes

Two approaches for detecting infrastructure services that don't create Ark CRDs:

### Option A: Check Helm Releases

Check **Helm releases** using Kubernetes-native patterns. No marketplace chart changes needed.

### Kubernetes Pattern: Helm Release Storage

Helm v3 stores releases as Kubernetes Secrets with standardized naming and labels:

**Naming pattern:** `sh.helm.release.v1.[release-name].v[version]` ([Helm storage documentation](https://codeengineered.com/blog/2020/helm-secret-storage/))

**Label selector:** `owner=helm,name=[release-name]`

```bash
$ kubectl get secrets -n phoenix -l owner=helm
NAME                             TYPE                 AGE
sh.helm.release.v1.phoenix.v1    helm.sh/release.v1   2h
```

Each marketplace item in `marketplace.json` already specifies this metadata:
```json
{
  "name": "phoenix",
  "ark": {
    "helmReleaseName": "phoenix",  // ← What to check
    "namespace": "phoenix"          // ← Where to check
  }
}
```

Dashboard queries Helm release Secrets using label selectors to determine installation status — no Helm CLI required.

**Simplified Detection:** Check if Secret exists with label `status=deployed`. No need to decode Secret data (base64/gzip parsing) — the status is available as a label.

### Option B: Label-Based Detection

Add standardized labels to marketplace charts, query labeled Deployments.

**Add to each marketplace chart's values:**
```yaml
# values.yaml
global:
  labels:
    ark.mckinsey.com/marketplace-item: "phoenix"
    ark.mckinsey.com/marketplace-version: "0.1.5"
```

**Apply to deployments in templates:**
```yaml
# templates/deployment.yaml
metadata:
  labels:
    {{- with .Values.global.labels }}
    {{- toYaml . | nindent 4 }}
    {{- end }}
```

**Dashboard queries deployments by label:**
```bash
kubectl get deployments -n phoenix \
  -l ark.mckinsey.com/marketplace-item=phoenix
```

**Why labels not annotations?** [Labels vs Annotations best practice](https://komodor.com/blog/best-practices-guide-for-kubernetes-labels-and-annotations/): Labels are for identifying and selecting objects (queryable), annotations are for non-identifying metadata (not queryable). We need selection, so labels are correct.

### Comparison

| Aspect | Option A: Helm Releases | Option B: Labels |
|--------|------------------------|------------------|
| **Chart changes** | None required | All charts need updates |
| **Standard pattern** | ✅ Helm's built-in storage | ✅ K8s labels (standard) |
| **Robustness** | ✅ Covers all resources | ⚠️ Only labeled resources |
| **Maintenance** | ✅ Automatic | ⚠️ Manual label management |
| **Pod restarts** | ✅ Survives restarts | ✅ Survives restarts |
| **Querying** | Secrets API | Deployments API |
| **RBAC** | Read secrets | Read deployments |

### Detection Logic

**Priority order** (backward compatible):
1. Check Ark CRDs first (agents, mcpservers, a2aservers, workflows, models)
2. If no CRD found, check Helm release (for infrastructure services)
3. Mark as installed if either exists

**Why this works:**
- Infrastructure services (phoenix, a2a-inspector, mcp-inspector) don't create Ark CRDs
- Agent/MCP services create CRDs, so CRD check finds them
- No conflicts: if service creates a CRD, it's found in step 1

### Performance & Caching

**Current behavior:**
- Marketplace manifest: Cached 1 hour
- Installation status: Fetched on-demand (when user visits marketplace page)
- No continuous polling

**Impact:**
- Adding Helm Secret query is comparable to existing CRD queries (both use label selectors)

## Capabilities

### New Capabilities (Option A)
- `helm-release-detection`: Dashboard checks Helm release Secrets using label selector `owner=helm,name=[helmReleaseName]` and namespace from marketplace.json

### New Capabilities (Option B)
- `label-based-detection`: Dashboard checks deployments using label selector `ark.mckinsey.com/marketplace-item=[itemName]`
- `marketplace-chart-labels`: All marketplace charts include standardized labels

### Modified Capabilities (Both)
- `marketplace-installation-detection`: Adds infrastructure service detection alongside existing CRD checks (backward compatible)

## Impact

### RBAC

**No changes needed:**
- Dashboard queries ark-api (not K8s directly)
- ark-api already has `secrets: [get, list]` permission
- Existing RBAC is sufficient for Option A

### Option A: Helm Releases

#### Dashboard (`services/ark-dashboard/ark-dashboard/`)

**`lib/services/marketplace-fetcher.ts`:**
- `getInstalledMarketplaceItems()` — Add Helm release query alongside CRD checks
- Query: `GET /api/v1/namespaces/[namespace]/secrets?labelSelector=owner=helm,name=[helmReleaseName],status=deployed`
- Check if Secret exists (no data decoding needed — status is in labels)

**`lib/services/kubernetes.ts` (new):**
- `checkHelmRelease(releaseName, namespace): Promise<boolean>` — Helper to query Secrets API
- Returns: `boolean` (true if deployed Secret exists)

### Option B: Labels

#### Marketplace (`github.com/mckinsey/agents-at-scale-marketplace`)

**All service charts need:**
- `values.yaml` — Add `global.labels` with `ark.mckinsey.com/marketplace-item`
- `templates/*.yaml` — Apply labels from `Values.global.labels` to all resources

**Example for phoenix:**
```yaml
# services/phoenix/chart/values.yaml
global:
  labels:
    ark.mckinsey.com/marketplace-item: "phoenix"
```

#### Dashboard (`services/ark-dashboard/ark-dashboard/`)

**`lib/services/marketplace-fetcher.ts`:**
- `getInstalledMarketplaceItems()` — Query deployments by label selector
- Query: `GET /api/v1/namespaces/[namespace]/deployments?labelSelector=ark.mckinsey.com/marketplace-item=[itemName]`

**`lib/services/kubernetes.ts` (new):**
- `checkLabeledDeployment(itemName, namespace): Promise<boolean>` — Helper to query Deployments API
- Returns: `{ exists: boolean }`

### Optional: Backend API

**`services/ark-api/src/ark_api/api/v1/helm.py` (new):**
- `GET /api/v1/helm-releases?namespace=[ns]` — Centralizes Helm release querying
- Returns: `[{ name, namespace, status }]`
- Dashboard uses this instead of direct K8s Secrets queries
- Benefits: Centralized RBAC, caching, error handling

## Testing

1. Install phoenix → Dashboard shows "Installed" ✓
2. Install a2a-inspector → Dashboard shows "Installed" ✓
3. Uninstall phoenix → Dashboard shows "Get" ✓
4. Helm release in `failed` state → Shows "not installed" ✓
5. Helm release in `pending-install` state → Shows "not installed" ✓

## References

**Option A: Helm Release Detection**
- [Helm Storage Using Secrets](https://codeengineered.com/blog/2020/helm-secret-storage/) - How Helm v3 stores releases as Kubernetes Secrets with standard labels

**Option B: Label-Based Detection**
- [Labels vs Annotations Best Practices](https://komodor.com/blog/best-practices-guide-for-kubernetes-labels-and-annotations/) - Why labels are queryable and annotations are not
- [Recommended Kubernetes Labels](https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/) - Standard `app.kubernetes.io/*` label patterns
