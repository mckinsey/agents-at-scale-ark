## 0. Prerequisites

- [x] 0.1 `/v1/ark-services` endpoint queries Helm releases via pyhelm3 (existing)

## 0.5 Add labelSelector Parameter to ark-api

- [ ] 0.5.1 Update `list_grouped_resources()` in `services/ark-api/ark-api/src/ark_api/api/v1/resources.py`
- [ ] 0.5.2 Add parameter: `labelSelector: Optional[str] = Query(None, description="Kubernetes label selector (e.g., 'app.kubernetes.io/instance=phoenix')")`
- [ ] 0.5.3 Pass `label_selector=labelSelector` to `api_resource.get()` call
- [ ] 0.5.4 Update function docstring to document labelSelector parameter
- [ ] 0.5.5 Add tests in `services/ark-api/ark-api/tests/api/test_resources.py` for label selector filtering
- [ ] 0.5.6 Test manually: `GET /v1/resources/v1/Service?namespace=phoenix&labelSelector=app.kubernetes.io/instance=phoenix`
- [ ] 0.5.7 Verify OpenAPI spec auto-generates with new parameter

## 1. Marketplace Manifest Schema

- [ ] 1.1 Add `ark.ui` field to marketplace manifest schema — add `ui: { enabled: boolean }` to the `GitHubMarketplaceItem` interface in `marketplace-fetcher.ts`
- [ ] 1.2 Add `installScope` field to `GitHubMarketplaceItem` interface — add `installScope?: 'namespace' | 'cluster'` to support scope badges ([#1522](https://github.com/mckinsey/agents-at-scale-ark/issues/1522))
- [ ] 1.3 Update marketplace items in the marketplace repo (`mckinsey/agents-at-scale-marketplace`) to set `ark.ui.enabled: true` on items with web UIs (Phoenix, Langfuse, A2A Inspector, MCP Inspector)
- [ ] 1.4 Update marketplace items to set `installScope: "namespace"` or `installScope: "cluster"` based on deployment scope

## 2. Dashboard Type Extensions

- [ ] 2.1 Add `uiUrl?: string` field to `MarketplaceItem` in `marketplace-types.ts`
- [ ] 2.2 Add `installScope?: 'namespace' | 'cluster'` field to `MarketplaceItem` in `marketplace-types.ts`
- [ ] 2.3 Update `transformGitHubItemToMarketplaceItem()` in `marketplace-fetcher.ts` to include `uiUrl` and `installScope` fields in the returned object

## 3. Helm Release Detection in Dashboard

- [ ] 3.1 Update `getInstalledMarketplaceItems()` in `marketplace-fetcher.ts` to query Helm releases via `/v1/ark-services?list_all_services=true`
- [ ] 3.2 Check if release name matches `item.ark.helmReleaseName` AND `release.status === 'deployed'`
- [ ] 3.3 Remove old CRD-based detection logic
- [ ] 3.4 Add tests: Helm release with status='deployed' detected, Helm release with other status not detected, no matching release returns not installed

## 4. Service Query and URL Resolution in Dashboard

- [ ] 4.1 Create helper function in `kubernetes.ts`: `getServiceUIUrl(helmReleaseName: string, namespace: string): Promise<string | undefined>`
- [ ] 4.2 Query Services via `/v1/resources/v1/Service?labelSelector=app.kubernetes.io/instance=${helmReleaseName}&namespace=${namespace}`
- [ ] 4.3 Extract `ark.mckinsey.com/ui-url` annotation from first matching Service
- [ ] 4.4 Return undefined if no Services found or annotation missing
- [ ] 4.5 Update `fetchMarketplaceItemsFromSource()` to call `getServiceUIUrl()` when `isInstalled && item.ark.ui?.enabled`
- [ ] 4.6 Attach resolved `uiUrl` to MarketplaceItem
- [ ] 4.7 Add tests: Service with annotation returns URL, Service without annotation returns undefined, no Services returns undefined

## 5. Marketplace Card UI

- [ ] 5.1 Add "Open" button to `marketplace-item-card.tsx` — render when `item.status === 'installed'` and `item.uiUrl` is present
- [ ] 5.2 Button opens URL in new tab via `window.open(item.uiUrl, '_blank')`
- [ ] 5.3 Add scope badge to marketplace card — render `[Namespace]` or `[Cluster]` badge based on `item.installScope` value ([#1522](https://github.com/mckinsey/agents-at-scale-ark/issues/1522))
- [ ] 5.4 Badge styling: namespace badge uses neutral color, cluster badge uses warning color to indicate manual verification needed
- [ ] 5.5 Add tests: renders Open button when uiUrl present, does not render when uiUrl absent, renders correct scope badge

## 6. Marketplace Detail Page UI

- [ ] 6.1 Add "Open" button to the detail page — prominent button when `item.uiUrl` is present
- [ ] 6.2 Button opens URL in new tab
- [ ] 6.3 Add tests: Open button renders with URL, no button when URL absent

## 7. Marketplace Charts — Service Annotations

- [ ] 7.1 Add `uiUrl: ""` to `services/.../chart/values.yaml`
- [ ] 7.2 Update Service template with `ark.mckinsey.com/ui-url` annotation
- [ ] 7.3 Update marketplace.json: add `"ui": { "enabled": true }`
- [ ] 7.4 Test deployment and verify annotation

## 8. Services Page Sunset

- [ ] 8.1 Add "Installed" filter option to the marketplace page — filter items by `status: "installed"`
- [ ] 8.2 Remove "Services" entry from the dashboard sidebar navigation
- [ ] 8.3 Remove services page code:
  - `app/(dashboard)/services/page.tsx`
  - `components/ark-services/ark-services-table.tsx`
  - `components/ark-services/use-ark-services.ts`
  - `lib/services/ark-services.ts` (if no other consumers)
- [ ] 8.4 Keep `/v1/ark-services` endpoint in ark-api (used by new detection logic)

## 9. Integration Testing

- [ ] 9.1 Deploy Langfuse with URL: verify detection and Open button
- [ ] 9.2 Deploy A2A Inspector with URL: verify detection and Open button
- [ ] 9.3 Test Helm release with status != 'deployed' (e.g., 'failed'): should not show as installed
- [ ] 9.4 Test Service query returns multiple Services: verify first one's URL is used
- [ ] 9.5 Test namespace limitation: deploy item to different namespace, verify not detected
- [ ] 9.6 Test scope badges: namespace-scoped items show `[Namespace]` badge, cluster-scoped items show `[Cluster]` badge

## 10. Documentation

### Marketplace Repository (agents-at-scale-marketplace)
- [ ] 10.1 Update `CONTRIBUTING.md` with UI URL configuration section
- [ ] 10.2 Document for contributors: add `ark.ui.enabled: true` to marketplace.json for items with UIs
- [ ] 10.3 Document Service annotation pattern: `ark.mckinsey.com/ui-url` templated from `.Values.uiUrl`
- [ ] 10.4 Provide template example for Service annotation in values.yaml
- [ ] 10.5 Document install examples: `helm install <item> --set uiUrl=<your-url>`

### Ark Dashboard Documentation (this repo)
- [ ] 10.6 Document marketplace UI URL feature in Ark docs
- [ ] 10.7 Explain namespace limitation for marketplace detection
- [ ] 10.8 Add user guide: how to configure UI URLs when installing marketplace items
- [ ] 10.9 Add troubleshooting: "Item shows installed but no Open button" → check `uiUrl` value set
- [ ] 10.10 Document Services page sunset

## 11. Verification

- [ ] 11.1 Verify Helm release detection works for all infrastructure services
- [ ] 11.2 Verify Services page removed and marketplace page has "Installed" filter
- [ ] 11.3 Verify UI URLs display correctly when configured
- [ ] 11.4 Verify namespace-scoped detection works as expected
