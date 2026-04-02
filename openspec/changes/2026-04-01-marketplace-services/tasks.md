## 0. Prerequisites

- [x] 0.1 `/v1/ark-services` endpoint queries Helm releases via pyhelm3 (existing)

## 0.5 Add labelSelector Parameter to ark-api

- [ ] 0.5.1 Update `list_grouped_resources()` in `services/ark-api/ark-api/src/ark_api/api/v1/resources.py`
- [ ] 0.5.2 Add parameter: `labelSelector: Optional[str] = Query(None, description="Kubernetes label selector (e.g., 'app.kubernetes.io/instance=phoenix')")`
- [ ] 0.5.3 Pass `label_selector=labelSelector` to `api_resource.get()` call — single shared implementation used across all resource types
- [ ] 0.5.4 Update function docstring to document labelSelector parameter
- [ ] 0.5.5 Add tests in `services/ark-api/ark-api/tests/api/test_resources.py` for label selector filtering
- [ ] 0.5.6 Test manually: `GET /v1/resources/v1/Service?namespace=phoenix&labelSelector=app.kubernetes.io/instance=phoenix`
- [ ] 0.5.7 Verify OpenAPI spec auto-generates with new parameter

## 0.6 Add `/v1/marketplace-items` Endpoint to ark-api

- [ ] 0.6.1 Create `/v1/marketplace-items` endpoint that queries Helm releases (replaces `/v1/ark-services` for marketplace use case)
- [ ] 0.6.2 Return release metadata including `chart.metadata.annotations` so dashboard can read `ark.mckinsey.com/marketplace-item-name`
- [ ] 0.6.3 Add tests for the new endpoint

## 1. Marketplace Manifest Schema

- [ ] 1.1 Add `installScope` field to `GitHubMarketplaceItem` interface — add `installScope?: 'namespace' | 'cluster'` to support scope badges ([#1522](https://github.com/mckinsey/agents-at-scale-ark/issues/1522))
- [ ] 1.2 Update marketplace items in the marketplace repo (`mckinsey/agents-at-scale-marketplace`) to set `installScope: "namespace"` or `installScope: "cluster"` based on deployment scope
- [ ] 1.3 Update marketplace item names in marketplace.json to use `<type>/<name>` format (e.g., `services/phoenix`)

## 2. Marketplace Chart Annotations

- [ ] 2.1 Add `ark.mckinsey.com/marketplace-item-name` annotation to each chart's `Chart.yaml` (e.g., `services/phoenix`)
- [ ] 2.2 For charts with web UIs, add `ark.mckinsey.com/marketplace-item-ui-url` annotation to Service template, templated from `.Values.uiUrl`
- [ ] 2.3 For charts with web UIs, add `ark.mckinsey.com/marketplace-item-ui-label` annotation to Service template, templated from `.Values.uiLabel`
- [ ] 2.4 Add `uiUrl: ""` and `uiLabel: ""` to `values.yaml` for charts with web UIs

## 3. Dashboard Type Extensions

- [ ] 3.1 Add `uis?: { url: string; label: string }[]` field to `MarketplaceItem` in `marketplace-types.ts`
- [ ] 3.2 Add `installScope?: 'namespace' | 'cluster'` field to `MarketplaceItem` in `marketplace-types.ts`
- [ ] 3.3 Update `transformGitHubItemToMarketplaceItem()` in `marketplace-fetcher.ts` to include `uis` and `installScope` fields

## 4. Marketplace Item Listing in Dashboard

- [ ] 4.1 Update `getInstalledMarketplaceItems()` in `marketplace-fetcher.ts` to query Helm releases via `/v1/marketplace-items`
- [ ] 4.2 Match by chart annotation: `release.chart.metadata.annotations["ark.mckinsey.com/marketplace-item-name"] === item.name`
- [ ] 4.3 Only match releases with `status === 'deployed'`
- [ ] 4.4 Remove old CRD-based detection logic
- [ ] 4.5 Add tests: chart annotation match detected, no annotation returns not installed, non-deployed status not detected

## 5. Service Query and URL Resolution in Dashboard

- [ ] 5.1 Create helper function in `kubernetes.ts`: `getServiceUIs(releaseName: string, namespace: string): Promise<{ url: string; label: string }[]>`
- [ ] 5.2 Query Services via `/v1/resources/v1/Service?labelSelector=app.kubernetes.io/instance=${releaseName}&namespace=${namespace}`
- [ ] 5.3 Extract `ark.mckinsey.com/marketplace-item-ui-url` and `ark.mckinsey.com/marketplace-item-ui-label` annotations from matching Services
- [ ] 5.4 Return `{ url, label }` pairs — use "Open" as fallback label when `marketplace-item-ui-label` is absent
- [ ] 5.5 Update `fetchMarketplaceItemsFromSource()` to call `getServiceUIs()` for all installed items
- [ ] 5.6 Attach resolved `uis` array to MarketplaceItem
- [ ] 5.7 Add tests: Service with both annotations returns url+label, Service with url only returns url+"Open", no Services returns empty array, multiple Services returns multiple entries

## 6. Marketplace Card UI

- [ ] 6.1 Add UI buttons to `marketplace-item-card.tsx` — render for each entry in `item.uis` when `item.status === 'installed'`
- [ ] 6.2 Button text uses `ui.label` (e.g., "Dashboard", "MinIO Console") or "Open" fallback
- [ ] 6.3 Button opens URL in new tab via `window.open(ui.url, '_blank')`
- [ ] 6.4 Add scope badge to marketplace card — render `[Namespace]` or `[Cluster]` badge based on `item.installScope` value ([#1522](https://github.com/mckinsey/agents-at-scale-ark/issues/1522))
- [ ] 6.5 Badge styling: namespace badge uses neutral color, cluster badge uses warning color to indicate manual verification needed
- [ ] 6.6 Add tests: renders buttons with correct labels when uis present, does not render when uis absent, renders correct scope badge

## 7. Marketplace Detail Page UI

- [ ] 7.1 Add UI buttons to the detail page — one per entry in `item.uis`
- [ ] 7.2 Buttons open URL in new tab with correct label
- [ ] 7.3 Add tests: buttons render with URLs and labels, no buttons when uis absent

## 8. Services Page Sunset

- [ ] 8.1 Add "Installed" filter option to the marketplace page — filter items by `status: "installed"`
- [ ] 8.2 Remove "Services" entry from the dashboard sidebar navigation
- [ ] 8.3 Remove services page code:
  - `app/(dashboard)/services/page.tsx`
  - `components/ark-services/ark-services-table.tsx`
  - `components/ark-services/use-ark-services.ts`
  - `lib/services/ark-services.ts` (if no other consumers)
- [ ] 8.4 Keep `/v1/ark-services` endpoint in ark-api (may be used by other consumers)

## 9. Integration Testing

- [ ] 9.1 Deploy Phoenix with chart annotation and URL: verify detection and UI button
- [ ] 9.2 Deploy item with custom release name (`helm install my-obs ./phoenix-chart`): verify annotation-based detection still works
- [ ] 9.3 Deploy item with multiple Services (e.g., two UIs): verify both buttons render with correct labels
- [ ] 9.4 Test Helm release with status != 'deployed' (e.g., 'failed'): should not show as installed
- [ ] 9.5 Test Service query returns Service without UI annotation: no button rendered
- [ ] 9.6 Test namespace limitation: deploy item to different namespace, verify not detected
- [ ] 9.7 Test scope badges: namespace-scoped items show `[Namespace]` badge, cluster-scoped items show `[Cluster]` badge

## 10. Documentation

### Marketplace Repository (agents-at-scale-marketplace)
- [ ] 10.1 Update `CONTRIBUTING.md` with marketplace item detection section (Chart.yaml annotation)
- [ ] 10.2 Update `CONTRIBUTING.md` with UI URL and label configuration section
- [ ] 10.3 Document Service annotation pattern: `ark.mckinsey.com/marketplace-item-ui-url` and `ark.mckinsey.com/marketplace-item-ui-label`
- [ ] 10.4 Provide template example for Service annotations in values.yaml
- [ ] 10.5 Document install examples: `helm install <item> --set uiUrl=<url> --set uiLabel="Dashboard"`

### Ark Dashboard Documentation (this repo)
- [ ] 10.6 Document marketplace UI URL feature in Ark docs
- [ ] 10.7 Explain namespace limitation for marketplace detection
- [ ] 10.8 Add user guide: how to configure UI URLs and labels when installing marketplace items
- [ ] 10.9 Add troubleshooting: "Item shows installed but no button" → check `uiUrl` value set
- [ ] 10.10 Document Services page sunset

## 11. Verification

- [ ] 11.1 Verify chart annotation-based detection works for all marketplace items
- [ ] 11.2 Verify custom release names still detected correctly
- [ ] 11.3 Verify Services page removed and marketplace page has "Installed" filter
- [ ] 11.4 Verify UI buttons display correctly with labels when configured
- [ ] 11.5 Verify multi-UI items show multiple buttons with correct labels
- [ ] 11.6 Verify namespace-scoped detection works as expected
