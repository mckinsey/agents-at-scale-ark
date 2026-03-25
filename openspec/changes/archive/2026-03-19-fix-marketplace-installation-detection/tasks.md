## 0. Ark API — Label Selector Support (PREREQUISITE)

- [x] 0.1 Update `list_grouped_resources()` in `services/ark-api/ark-api/src/ark_api/api/v1/resources.py`
- [x] 0.2 Add parameter: `labelSelector: Optional[str] = Query(None, description="Kubernetes label selector (e.g., 'app=nginx,env=prod')")`
- [x] 0.3 Pass `label_selector=labelSelector` to `api_resource.get()` call (line ~203)
- [x] 0.4 Update function docstring to document labelSelector parameter
- [x] 0.5 Add tests in `services/ark-api/ark-api/tests/api/test_resources.py` for label selector filtering
- [x] 0.6 Test manually: `GET /v1/resources/apis/apps/v1/Deployment?namespace=phoenix&labelSelector=ark.mckinsey.com/marketplace-item=phoenix`
- [x] 0.7 Verify OpenAPI spec auto-generates with new parameter

## 1. Dashboard — Kubernetes Service Layer

- [x] 1.1 Create `lib/services/kubernetes.ts` with `checkLabeledDeployment(itemName: string, namespace: string): Promise<boolean>` function
- [x] 1.2 Implement deployment query via ark-api: `GET /v1/resources/apis/apps/v1/Deployment?namespace={namespace}&labelSelector=ark.mckinsey.com/marketplace-item={itemName}`
- [x] 1.3 URL-encode label selector parameter using `URLSearchParams`
- [x] 1.4 Parse response and check for deployments with `status.conditions` containing `type=Available, status=True`
- [x] 1.5 Add error handling for API failures (network errors, 404s, auth errors) — return `false` on errors
- [x] 1.6 Add unit tests for checkLabeledDeployment: deployment exists and available, deployment exists but not available, deployment not found, API error

## 2. Dashboard — Marketplace Detection Logic

- [x] 2.1 Update `fetchMarketplaceItemsFromSource()` in `lib/services/marketplace-fetcher.ts` to add infrastructure service detection
- [x] 2.2 After CRD check returns `isInstalled = false`, check if item has `ark.helmReleaseName` and `ark.namespace`
- [x] 2.3 If so, call `checkLabeledDeployment(item.name, item.ark.namespace)` and update `isInstalled`
- [x] 2.4 Pass final `isInstalled` value to `transformGitHubItemToMarketplaceItem()`
- [x] 2.5 Add debug logging to show detection method used (CRD vs labeled deployment vs not installed)
- [x] 2.6 Update tests in `marketplace-fetcher.test.ts`: mock kubernetes service, test CRD-only items still work, test infrastructure items detected via deployments, test items with both CRD and deployment (CRD takes precedence)

## 3. Dashboard — Type Definitions

- [x] 3.1 Add deployment-related types to `kubernetes.ts` or appropriate types file: `DeploymentStatus`, `DeploymentCondition`, `DeploymentList`
- [x] 3.2 Ensure `GitHubMarketplaceItem.ark.helmReleaseName` and `GitHubMarketplaceItem.ark.namespace` types are correctly defined (verify existing types)

## 4. Marketplace Charts — Phoenix

- [x] 4.1 Add `global.labels` section to `services/phoenix/chart/values.yaml` with `ark.mckinsey.com/marketplace-item: "phoenix"`
- [x] 4.2 Note: Phoenix is a wrapper chart with dependency on `phoenix-helm` OCI chart - global labels propagate automatically to subchart deployments
- [x] 4.3 Test deployment: `helm upgrade --install phoenix ./services/phoenix/chart -n phoenix --create-namespace`
- [x] 4.4 Verify label propagated to dependency: `kubectl get deployment -n phoenix -l ark.mckinsey.com/marketplace-item=phoenix -o yaml`

## 5. Marketplace Charts — A2A Inspector

- [x] 5.1 Add `global.labels` section to `services/a2a-inspector/chart/values.yaml` with `ark.mckinsey.com/marketplace-item: "a2a-inspector"`
- [x] 5.2 Chart has custom deployment template - added labels from `Values.global.labels` to `_helpers.tpl`
- [x] 5.3 Test deployment and verify label: `kubectl get deployment -n a2a-inspector -l ark.mckinsey.com/marketplace-item=a2a-inspector`

## 6. Marketplace Charts — MCP Inspector

- [x] 6.1 Add `global.labels` section to `services/mcp-inspector/chart/values.yaml` with `ark.mckinsey.com/marketplace-item: "mcp-inspector"`
- [x] 6.2 Chart has custom deployment template - added labels from `Values.global.labels` to `_helpers.tpl`
- [x] 6.3 Test deployment and verify label: `kubectl get deployment -n mcp-inspector -l ark.mckinsey.com/marketplace-item=mcp-inspector`

## 7. Integration Testing

- [x] 7.1 Test API endpoint directly: `curl "http://localhost:8000/v1/resources/apis/apps/v1/Deployment?namespace=phoenix&labelSelector=ark.mckinsey.com%2Fmarketplace-item%3Dphoenix"`
- [x] 7.2 Deploy phoenix to test cluster: verify dashboard shows "Installed" status
- [x] 7.3 Deploy a2a-inspector to test cluster: verify dashboard shows "Installed" status
- [x] 7.4 Uninstall phoenix: verify dashboard shows "Get" status
- [x] 7.5 Install service that creates Ark CRDs (e.g., an agent): verify it still shows as installed via CRD detection
- [x] 7.6 Test edge case: deployment exists but has `Available=False` condition → should show "not installed"
- [x] 7.7 Test edge case: deployment without marketplace label → shows "not installed"

## 8. Marketplace Documentation (marketplace repo)

- [x] 8.1 Add label requirement to `CONTRIBUTING.md` Helm Chart section
- [x] 8.2 Document for contributors: label is required, must match marketplace.json `name`, enables install status detection
- [x] 8.3 Documented template example for applying labels from `Values.global.labels` in `_helpers.tpl`
- [x] 8.4 Added validation command example to test marketplace label application
- [x] 8.5 Add troubleshooting section: "Item shows not installed" → check label exists and matches name

## 9. Marketplace CI Validation (marketplace repo)

- [x] 9.1 Updated existing CI workflow `.github/workflows/_reusable-charts-cicd.yaml`
- [x] 9.2 Add check: all `services/*/chart/values.yaml` files must contain `ark.mckinsey.com/marketplace-item`
- [x] 9.3 Add check: label value must match directory name or marketplace.json entry
- [x] 9.4 Fail CI if validation fails with clear error message showing which charts are missing labels
- [x] 9.5 Added deployment verification step to test-deployment job to verify label is applied to deployed resources

## 10. Ark Dashboard Documentation (this repo)

- [x] 10.1 Document curated marketplace model in Ark docs: explain label requirement for installation detection
- [x] 10.2 Add "Custom Marketplace Sources" section explaining label requirement for third-party marketplaces
- [x] 10.3 Document that marketplace items must include `ark.mckinsey.com/marketplace-item` label for status detection
- [x] 10.4 Add troubleshooting note on marketplace labeling requirements to Ark documentation
