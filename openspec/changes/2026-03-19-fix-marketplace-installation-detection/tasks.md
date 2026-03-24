## 0. Ark API — Label Selector Support (PREREQUISITE)

- [ ] 0.1 Update `list_grouped_resources()` in `services/ark-api/ark-api/src/ark_api/api/v1/resources.py`
- [ ] 0.2 Add parameter: `labelSelector: Optional[str] = Query(None, description="Kubernetes label selector (e.g., 'app=nginx,env=prod')")`
- [ ] 0.3 Pass `label_selector=labelSelector` to `api_resource.get()` call (line ~203)
- [ ] 0.4 Update function docstring to document labelSelector parameter
- [ ] 0.5 Add tests in `services/ark-api/ark-api/tests/api/test_resources.py` for label selector filtering
- [ ] 0.6 Test manually: `GET /v1/resources/apis/apps/v1/Deployment?namespace=phoenix&labelSelector=ark.mckinsey.com/marketplace-item=phoenix`
- [ ] 0.7 Verify OpenAPI spec auto-generates with new parameter

## 1. Dashboard — Kubernetes Service Layer

- [ ] 1.1 Create `lib/services/kubernetes.ts` with `checkLabeledDeployment(itemName: string, namespace: string): Promise<boolean>` function
- [ ] 1.2 Implement deployment query via ark-api: `GET /v1/resources/apis/apps/v1/Deployment?namespace={namespace}&labelSelector=ark.mckinsey.com/marketplace-item={itemName}`
- [ ] 1.3 URL-encode label selector parameter using `encodeURIComponent()`
- [ ] 1.4 Parse response and check for deployments with `status.conditions` containing `type=Available, status=True`
- [ ] 1.5 Add error handling for API failures (network errors, 404s, auth errors) — return `false` on errors
- [ ] 1.6 Add unit tests for checkLabeledDeployment: deployment exists and available, deployment exists but not available, deployment not found, API error

## 2. Dashboard — Marketplace Detection Logic

- [ ] 2.1 Update `fetchMarketplaceItemsFromSource()` in `lib/services/marketplace-fetcher.ts` to add infrastructure service detection
- [ ] 2.2 After CRD check returns `isInstalled = false`, check if item has `ark.helmReleaseName` and `ark.namespace`
- [ ] 2.3 If so, call `checkLabeledDeployment(item.name, item.ark.namespace)` and update `isInstalled`
- [ ] 2.4 Pass final `isInstalled` value to `transformGitHubItemToMarketplaceItem()`
- [ ] 2.5 Add debug logging to show detection method used (CRD vs labeled deployment vs not installed)
- [ ] 2.6 Update tests in `marketplace-fetcher.test.ts`: mock kubernetes service, test CRD-only items still work, test infrastructure items detected via deployments, test items with both CRD and deployment (CRD takes precedence)

## 3. Dashboard — Type Definitions

- [ ] 3.1 Add deployment-related types to `kubernetes.ts` or appropriate types file: `DeploymentStatus`, `DeploymentCondition`, `DeploymentList`
- [ ] 3.2 Ensure `GitHubMarketplaceItem.ark.helmReleaseName` and `GitHubMarketplaceItem.ark.namespace` types are correctly defined (verify existing types)

## 4. Marketplace Charts — Phoenix

- [ ] 4.1 Add `global.labels` section to `services/phoenix/chart/values.yaml` with `ark.mckinsey.com/marketplace-item: "phoenix"`
- [ ] 4.2 Note: Phoenix is a wrapper chart with dependency on `phoenix-helm` OCI chart - global labels propagate automatically to subchart deployments
- [ ] 4.3 Test deployment: `helm upgrade --install phoenix ./services/phoenix/chart -n phoenix --create-namespace`
- [ ] 4.4 Verify label propagated to dependency: `kubectl get deployment -n phoenix -l ark.mckinsey.com/marketplace-item=phoenix -o yaml`

## 5. Marketplace Charts — A2A Inspector

- [ ] 5.1 Add `global.labels` section to `services/a2a-inspector/chart/values.yaml` with `ark.mckinsey.com/marketplace-item: "a2a-inspector"`
- [ ] 5.2 If chart has custom deployment template, add labels from `Values.global.labels`. If wrapper chart, labels propagate via global values
- [ ] 5.3 Test deployment and verify label: `kubectl get deployment -n a2a-inspector -l ark.mckinsey.com/marketplace-item=a2a-inspector`

## 6. Marketplace Charts — MCP Inspector

- [ ] 6.1 Add `global.labels` section to `services/mcp-inspector/chart/values.yaml` with `ark.mckinsey.com/marketplace-item: "mcp-inspector"`
- [ ] 6.2 If chart has custom deployment template, add labels from `Values.global.labels`. If wrapper chart, labels propagate via global values
- [ ] 6.3 Test deployment and verify label: `kubectl get deployment -n mcp-inspector -l ark.mckinsey.com/marketplace-item=mcp-inspector`

## 7. Integration Testing

- [ ] 7.1 Test API endpoint directly: `curl "http://localhost:8000/v1/resources/apis/apps/v1/Deployment?namespace=phoenix&labelSelector=ark.mckinsey.com%2Fmarketplace-item%3Dphoenix"`
- [ ] 7.2 Deploy phoenix to test cluster: verify dashboard shows "Installed" status
- [ ] 7.3 Deploy a2a-inspector to test cluster: verify dashboard shows "Installed" status
- [ ] 7.4 Uninstall phoenix: verify dashboard shows "Get" status
- [ ] 7.5 Install service that creates Ark CRDs (e.g., an agent): verify it still shows as installed via CRD detection
- [ ] 7.6 Test edge case: deployment exists but has `Available=False` condition → should show "not installed"
- [ ] 7.7 Test edge case: deployment without marketplace label → shows "not installed"

## 8. Marketplace Documentation (marketplace repo)

- [ ] 8.1 Add label requirement to `CONTRIBUTING.md` or chart development guide
- [ ] 8.2 Document for contributors: label is required, must match marketplace.json `name`, enables install status detection
- [ ] 8.3 Document for custom marketplace users: label enables install status, without it items show as "available" always
- [ ] 8.4 Update chart template with `global.labels` section including `ark.mckinsey.com/marketplace-item` placeholder
- [ ] 8.5 Add troubleshooting: "Item shows not installed" → check label exists and matches name

## 9. Marketplace CI Validation (marketplace repo)

- [ ] 9.1 Create `.github/workflows/validate-charts.yml` or update existing CI workflow
- [ ] 9.2 Add check: all `services/*/chart/values.yaml` files must contain `ark.mckinsey.com/marketplace-item`
- [ ] 9.3 Add check: label value must match directory name or marketplace.json entry
- [ ] 9.4 Fail CI if validation fails with clear error message showing which charts are missing labels

## 10. Ark Dashboard Documentation (this repo)

- [ ] 10.1 Document curated marketplace model in Ark docs: explain label requirement for installation detection
- [ ] 10.2 Add "Custom Marketplace Sources" section explaining label requirement for third-party marketplaces
- [ ] 10.3 Document that marketplace items must include `ark.mckinsey.com/marketplace-item` label for status detection
- [ ] 10.4 Add troubleshooting note on marketplace labeling requirements to Ark documentation
