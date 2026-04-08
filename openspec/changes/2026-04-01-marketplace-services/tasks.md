## 0. Prerequisites

- [x] 0.1 `/v1/ark-services` endpoint queries Helm releases via pyhelm3 (existing)

## 1. ark-api: labelSelector Parameter

- [ ] 1.1 Add `labelSelector` parameter to `list_grouped_resources()` in `services/ark-api/ark-api/src/ark_api/api/v1/resources.py`
- [ ] 1.2 Pass `label_selector=labelSelector` to `api_resource.get()` call — single shared implementation
- [ ] 1.3 Add tests for label selector filtering
- [ ] 1.4 Test manually: `GET /v1/resources/v1/Service?labelSelector=app.kubernetes.io/instance=phoenix`

## 2. ark-api: `/v1/marketplace-items` Endpoint

- [ ] 2.1 Create endpoint that queries Helm releases in current namespace
- [ ] 2.2 Return release metadata including `chart.metadata.annotations`
- [ ] 2.3 Add tests

## 3. Marketplace Chart Annotations (agents-at-scale-marketplace repo)

- [ ] 3.1 Add `ark.mckinsey.com/marketplace-item-name` annotation to each chart's `Chart.yaml`
- [ ] 3.2 For charts with web UIs, add `ark.mckinsey.com/marketplace-item-ui-url` annotation to Service template (from `.Values.uiUrl`)
- [ ] 3.3 For charts with web UIs, add `ark.mckinsey.com/marketplace-item-ui-label` annotation to Service template (from `.Values.uiLabel`)
- [ ] 3.4 Add `uiUrl: ""` and `uiLabel: ""` to `values.yaml` for charts with web UIs

## 4. Dashboard: Type Extensions

- [ ] 4.1 Add `uis?: { url: string; label: string }[]` field to `MarketplaceItem` in `marketplace-types.ts`
- [ ] 4.2 Update `transformGitHubItemToMarketplaceItem()` to include `uis` field

## 5. Dashboard: Marketplace Item Detection

- [ ] 5.1 Update `getInstalledMarketplaceItems()` in `marketplace-fetcher.ts` to query `/v1/marketplace-items`
- [ ] 5.2 Match by chart annotation: `release.chart.metadata.annotations["ark.mckinsey.com/marketplace-item-name"] === item.name`
- [ ] 5.3 Only match releases with `status === 'deployed'`
- [ ] 5.4 Remove old CRD-based detection logic
- [ ] 5.5 Add tests

## 6. Dashboard: Service Query and URL Resolution

- [ ] 6.1 Create helper: `getServiceUIs(releaseName: string, namespace: string): Promise<{ url: string; label: string }[]>`
- [ ] 6.2 Query Services via `/v1/resources/v1/Service?labelSelector=app.kubernetes.io/instance=${releaseName}`
- [ ] 6.3 Extract `marketplace-item-ui-url` and `marketplace-item-ui-label` annotations
- [ ] 6.4 Use "Open" as fallback label
- [ ] 6.5 Call `getServiceUIs()` for all installed items
- [ ] 6.6 Add tests

## 7. Dashboard: Marketplace Card UI

- [ ] 7.1 Add buttons to `marketplace-item-card.tsx` for each entry in `item.uis`
- [ ] 7.2 Button text from `ui.label`, opens URL in new tab
- [ ] 7.3 Add tests

## 8. Dashboard: Marketplace Detail Page UI

- [ ] 8.1 Add buttons to detail page for each entry in `item.uis`
- [ ] 8.2 Add tests

## 9. Services Page Sunset

- [ ] 9.1 Add "Installed" filter to marketplace page
- [ ] 9.2 Remove "Services" from sidebar navigation
- [ ] 9.3 Remove services page code and components
- [ ] 9.4 Keep `/v1/ark-services` endpoint (may have other consumers)

## 10. Integration Testing

- [ ] 10.1 Deploy item with chart annotation and URL: verify detection and button
- [ ] 10.2 Deploy item with custom release name: verify annotation-based detection works
- [ ] 10.3 Deploy item with multiple Services: verify multiple buttons with labels
- [ ] 10.4 Test failed Helm release: should not show as installed
- [ ] 10.5 Test Service without UI annotation: no button

## 11. Documentation

- [ ] 11.1 Update marketplace repo CONTRIBUTING.md with chart annotation and UI URL sections
- [ ] 11.2 Document install examples with `--set uiUrl` and `--set uiLabel`
- [ ] 11.3 Document services page sunset
