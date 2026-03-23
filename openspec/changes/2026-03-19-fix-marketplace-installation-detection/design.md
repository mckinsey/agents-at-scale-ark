## Context

Infrastructure marketplace services (phoenix, a2a-inspector, mcp-inspector) appear as "not installed" in the dashboard even when successfully deployed with Helm releases running and pods healthy.

Dashboard detection (`marketplace-fetcher.ts:getInstalledMarketplaceItems()`) queries the export service for Ark CRDs (agents, mcpservers, a2aservers, workflows, models). Infrastructure services create only standard Kubernetes resources (Deployment, Service, HTTPRoute) without Ark CRDs, so they remain invisible to the current detection logic.

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

## Goals / Non-Goals

**Goals:**
- Infrastructure services show correct installation status in marketplace UI
- Solution uses explicit marketplace labels for unambiguous detection
- Detection works for both CRD-based services and infrastructure services
- Backward compatible with existing CRD detection
- Performance remains comparable to current implementation

**Non-Goals:**
- Changing the marketplace manifest structure or API
- Modifying how services are deployed or installed
- Adding backend API endpoints for installation detection (dashboard queries K8s API directly)
- Supporting non-Helm installation methods

## Decisions

### 1. Use custom marketplace labels for explicit identification

Add `ark.mckinsey.com/marketplace-item` label to all marketplace chart deployments. This positions Ark as a **curated marketplace** (like App Store) rather than generic registry (like npm), requiring contributors to meet labeling standards.

**Why labels over annotations**: Labels are indexed and queryable via label selectors. Annotations are for non-identifying metadata and cannot be used in selectors.

**Why custom `ark.mckinsey.com/marketplace-item` over standard labels**:
- Standard `app.kubernetes.io/name` is NOT unique - multiple resources can share the same value
- Explicit marketplace identification prevents false positives from user deployments
- Enables future capabilities beyond detection

**What this enables**:
1. **Explicit identification**: No ambiguity - labeled resources are marketplace items, user deployments won't have this label
2. **Future capabilities**: RBAC policies, cost tracking, monitoring alerts, compliance enforcement, `kubectl` discovery, operator automation
3. **Curated model**: Tighter quality control vs. generic registries, positions Ark marketplace alongside App Store, Chrome Web Store

**Trade-off accepted**: Contributors must add the label. Generic Helm charts work but won't show install status until labeled. This is acceptable for a curated marketplace model.

**Alternative considered**: Helm release Secret detection. Rejected - less explicit, ties to Helm internals, doesn't enable future label-based features.

### 2. Label placement in marketplace chart values

Each marketplace chart adds the marketplace label in `values.yaml`:

```yaml
# values.yaml
global:
  labels:
    ark.mckinsey.com/marketplace-item: "phoenix"
```

**Why `global.labels`**: Follows Helm conventions for labels that should be applied across all chart resources. Makes it easy to consistently label Deployments, Services, and other resources.

**Why `ark.mckinsey.com/marketplace-item`**: Explicit marketplace identification prevents collisions with user-deployed resources.

### 3. Dashboard queries both CRDs and labeled Deployments

Detection logic priority order (backward compatible):
1. Check Ark CRDs first (agents, mcpservers, a2aservers, workflows, models) via export service
2. If no CRD found AND item has `ark.helmReleaseName` metadata, check for labeled Deployment
3. Mark as installed if either exists

**Why this works**:
- Agent/MCP services create CRDs → found in step 1
- Infrastructure services (phoenix, a2a-inspector, mcp-inspector) don't create CRDs → fall through to step 2
- No conflicts: If service creates a CRD, it's found at step 1 and step 2 never runs

### 4. Query Deployments by label selector via ark-api

**Prerequisite**: ark-api must support `labelSelector` query parameter on the generic resources endpoint.

Dashboard calls ark-api's generic resource endpoint:
```
GET /v1/resources/apis/apps/v1/Deployment?namespace={namespace}&labelSelector=ark.mckinsey.com/marketplace-item={itemName}
```

Check if response contains at least one deployment with status conditions showing `Available=True`.

**Why query deployments not pods**: Deployments are the primary workload resource and their status reflects overall application health. Pods come and go (restarts, rolling updates), while deployments persist.

**Why check via ark-api not direct K8s**: Dashboard already uses ark-api for all K8s queries. Maintains consistent RBAC model and error handling.

**API Change Required**: Current `list_grouped_resources()` in ark-api only supports Workflow-specific filters. Must add generic `labelSelector` parameter that passes to Kubernetes API client.

### 5. Match using marketplace item name

The `ark.mckinsey.com/marketplace-item` label value must match the marketplace item's `name` field (not `displayName`). The label selector uses the item name directly.

## Risks / Trade-offs

### Curated Marketplace Model

| Model | Example | Label Required? |
|-------|---------|-----------------|
| Generic Registry | npm, Docker Hub | No requirements |
| **Curated Marketplace** | **App Store, Ark** | **Must meet standards** |

**Acceptable**:
- Contributors must read docs and add label (documented requirement)
- Tighter control over marketplace quality
- Future extensibility with label-based features

**Implications**:
- Custom marketplace sources must adopt convention for install status detection
- Generic Helm charts won't show install status until labeled
- Requires clear documentation and CI validation tooling

### Graceful Degradation

Items WITHOUT the label:
- Won't show correct install status (always "available")
- Can still be installed via install command
- Appear in marketplace catalog

Items WITH the label:
- Show correct install status
- Enable future marketplace features
- Explicit marketplace member

### Technical Risks

**[Risk] Label value mismatches** → Detection fails if label doesn't match marketplace.json name. Mitigation: CI validation enforces matching.

**[Risk] Only labeled deployments detected** → StatefulSets/DaemonSets without Deployment won't be detected. Mitigation: Current infrastructure services use Deployments. Can expand query later if needed.

**[Risk] Cross-repo coordination** → Dashboard and marketplace charts must align. Mitigation: Dashboard degrades gracefully (shows "not installed"), charts can update independently.

**[Performance] Additional API calls** → Only for items with helmReleaseName and no CRD. Comparable to existing CRD queries. No polling - on-demand only.

## Implementation Notes

### API Backend (ark repo - PREREQUISITE)

**File: `services/ark-api/ark-api/src/ark_api/api/v1/resources.py`**

Add `labelSelector` support to `list_grouped_resources()`:

```python
async def list_grouped_resources(
    request: Request,
    group: str,
    version: str,
    kind: str,
    namespace: Optional[str] = Query(None),
    labelSelector: Optional[str] = Query(None, description="Label selector (e.g., 'app=nginx,env=prod')"),  # ADD THIS
    workflowName: Optional[str] = Query(None),
    # ... other params
) -> Response:
    # ...
    resources = await api_resource.get(
        namespace=namespace,
        label_selector=labelSelector  # ADD THIS
    )
```

This enables querying: `GET /v1/resources/apis/apps/v1/Deployment?namespace=phoenix&labelSelector=ark.mckinsey.com/marketplace-item=phoenix`

### Marketplace Charts (agents-at-scale-marketplace repo)

For each infrastructure service chart (phoenix, a2a-inspector, mcp-inspector):

**Note**: Some charts (like phoenix) are wrapper charts with Helm dependencies. Labels added to `global.labels` in values.yaml automatically propagate to subchart deployments.

1. Add label to `values.yaml`:
```yaml
global:
  labels:
    ark.mckinsey.com/marketplace-item: "phoenix"  # Must match marketplace.json item name
```

2. For charts with custom templates, apply to Deployment:
```yaml
# templates/deployment.yaml (if exists)
metadata:
  labels:
    {{- with .Values.global.labels }}
    {{- toYaml . | nindent 4 }}
    {{- end }}
```

For wrapper charts (phoenix), the global labels propagate automatically to dependency charts via Helm's global values mechanism.

### Dashboard (this repo)

**File: `lib/services/kubernetes.ts` (new)**

```typescript
export async function checkLabeledDeployment(
  itemName: string,
  namespace: string
): Promise<boolean> {
  // Query deployments by marketplace-item label selector
  const labelSelector = `ark.mckinsey.com/marketplace-item=${itemName}`;
  const response = await fetch(
    `/v1/resources/apis/apps/v1/Deployment?namespace=${namespace}&labelSelector=${encodeURIComponent(labelSelector)}`
  )
  // Check if any deployment exists and is available
  const deployments = await response.json()
  return deployments.items?.some(
    d => d.status?.conditions?.some(
      c => c.type === 'Available' && c.status === 'True'
    )
  ) ?? false
}
```

**File: `lib/services/marketplace-fetcher.ts`**

Update `fetchMarketplaceItemsFromSource()`:
1. After checking CRDs for each item, if not found and item has `ark.helmReleaseName` + `ark.namespace`
2. Call `checkLabeledDeployment(item.name, item.ark.namespace)`
3. Set `isInstalled = true` if deployment check returns true
4. Pass `isInstalled` to `transformGitHubItemToMarketplaceItem()`

This placement is correct because `fetchMarketplaceItemsFromSource()` has access to marketplace item metadata (helmReleaseName, namespace) which `getInstalledMarketplaceItems()` lacks.

### Documentation (marketplace repo)

**For contributors** (`CONTRIBUTING.md` or chart template):
```markdown
## Marketplace Label Requirement

All charts must include the marketplace identification label:

\`\`\`yaml
# values.yaml
global:
  labels:
    ark.mckinsey.com/marketplace-item: "<name>"  # Must match marketplace.json name field
\`\`\`

Without this label, items will show as "available" regardless of installation status.
```

**For custom marketplace users**:
```markdown
## Custom Marketplace Sources

To show install status for your items:
1. Add `ark.mckinsey.com/marketplace-item` label to chart values
2. Label value must match `name` field in your marketplace.json
3. Without this label, items appear in catalog but show incorrect install status
```

### CI Validation (marketplace repo)

Add to `.github/workflows/validate-charts.yml`:
```bash
# Validate all charts have required marketplace label
for chart in services/*/chart/values.yaml; do
  if ! grep -q "ark.mckinsey.com/marketplace-item" "$chart"; then
    echo "ERROR: $chart missing required label"
    exit 1
  fi
done
```
