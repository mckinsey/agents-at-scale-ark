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

Add standardized labels to marketplace charts to enable detection of deployed Helm releases via their associated Deployments.

**Add to each marketplace chart's values:**
```yaml
# values.yaml
global:
  labels:
    ark.mckinsey.com/marketplace-item: "phoenix"
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

**Why this works:**
- Infrastructure services (phoenix, a2a-inspector, mcp-inspector) don't create Ark CRDs
- Checking labeled Deployments detects Helm-installed infrastructure services
- Deployment status (Available=True) confirms successful installation

**Why labels not annotations?** [Labels vs Annotations best practice](https://komodor.com/blog/best-practices-guide-for-kubernetes-labels-and-annotations/): Labels are for identifying and selecting objects (queryable), annotations are for non-identifying metadata (not queryable). We need selection, so labels are correct.

## Capabilities

### New Capabilities
- `label-based-detection`: Dashboard checks deployments using label selector `ark.mckinsey.com/marketplace-item=[itemName]`
- `marketplace-chart-labels`: All marketplace charts include standardized labels

### Modified Capabilities
- `marketplace-installation-detection`: Adds infrastructure service detection via labeled deployments

## Impact

### RBAC

**No changes needed:**
- Dashboard queries ark-api (not K8s directly)
- ark-api already has sufficient permissions for deployment queries
- Existing RBAC is sufficient

### Marketplace (`github.com/mckinsey/agents-at-scale-marketplace`)

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
- Query: `GET /v1/resources/apis/apps/v1/Deployment?namespace=[namespace]&labelSelector=ark.mckinsey.com/marketplace-item=[itemName]`

**`lib/services/kubernetes.ts` (new):**
- `checkLabeledDeployment(itemName, namespace): Promise<boolean>` — Helper to query Deployments API
- Returns: `boolean` (true if labeled deployment exists and is available)

## Testing

1. Install phoenix → Dashboard shows "Installed" ✓
2. Install a2a-inspector → Dashboard shows "Installed" ✓
3. Uninstall phoenix → Dashboard shows "Get" ✓
4. Helm release in `failed` state → Shows "not installed" ✓
5. Helm release in `pending-install` state → Shows "not installed" ✓

## References

- [Labels vs Annotations Best Practices](https://komodor.com/blog/best-practices-guide-for-kubernetes-labels-and-annotations/) - Why labels are queryable and annotations are not
- [Recommended Kubernetes Labels](https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/) - Standard `app.kubernetes.io/*` label patterns
