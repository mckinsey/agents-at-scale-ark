## 1. Marketplace Manifest Schema

- [ ] 1.1 Add `ark.ui` field to marketplace manifest schema — add `ui: { enabled: boolean }` to the `GitHubMarketplaceItem` interface in `marketplace-fetcher.ts` and update the marketplace.json.example template
- [ ] 1.2 Update marketplace items in the marketplace repo (`mckinsey/agents-at-scale-marketplace`) to set `ark.ui.enabled: true` on items with web UIs (Phoenix, Langfuse, A2A Inspector, MCP Inspector)

## 2. Dashboard Type Extensions

- [ ] 2.1 Add `uiUrl?: string` and `uiEnabled?: boolean` fields to `MarketplaceItem` in `marketplace-types.ts`
- [ ] 2.2 Update `transformGitHubItemToMarketplaceItem()` in `marketplace-fetcher.ts` to map `ark.ui.enabled` to the `uiEnabled` field

## 3. URL Resolution in Dashboard

- [ ] 3.1 Extend the labeled Deployment detection flow (PR #1440's `checkLabeledDeployment`) to also read `ark.mckinsey.com/ui-url` annotation from the Deployment response and return it alongside the installation status
- [ ] 3.2 Update `fetchMarketplaceItemsFromSource()` in `marketplace-fetcher.ts` to attach the resolved `uiUrl` to MarketplaceItem when `uiEnabled` is true and the annotation is present
- [ ] 3.3 Add tests for URL resolution: Deployment with annotation returns URL, Deployment without annotation returns undefined

## 4. Marketplace Card UI

- [ ] 4.1 Add "Open" button to `marketplace-item-card.tsx` — render when `item.status === 'installed'` and `item.uiUrl` is present, opens URL in new tab via `window.open`
- [ ] 4.2 Add tests for marketplace card: renders Open button when uiUrl present, does not render when absent

## 5. Marketplace Detail Page UI

- [ ] 5.1 Add "Open" button to the detail page sidebar (`marketplace/[id]/page.tsx`) — prominent button when `uiUrl` is present
- [ ] 5.2 Add port-forward instructions to the detail page — render when `uiEnabled` is true but `uiUrl` is absent, using `k8sServiceName` and `k8sServicePort` from manifest
- [ ] 5.3 Add tests for detail page: Open button renders with URL, port-forward instructions render without URL

## 6. Post-Install Hooks (Marketplace Repo)

- [ ] 6.1 Extend the post-install hook job template in `mckinsey/agents-at-scale-marketplace` to also patch `ark.mckinsey.com/ui-url` annotation on the Deployment, deriving the URL from Helm values
- [ ] 6.2 Update marketplace Helm charts for Phoenix, Langfuse, A2A Inspector, MCP Inspector to pass UI URL via Helm values to the post-install hook

## 7. Services Page Sunset

- [ ] 7.1 Add "Installed" filter option to the marketplace page — filter items by `status: "installed"`
- [ ] 7.2 Remove "Services" entry from the dashboard sidebar navigation
- [ ] 7.3 Add redirect from `/services` to `/marketplace?status=installed`
- [ ] 7.4 Remove services page code: `app/(dashboard)/services/page.tsx`, `components/ark-services/ark-services-table.tsx`, `components/ark-services/use-ark-services.ts`, `lib/services/ark-services.ts`
- [ ] 7.5 Evaluate whether `ark-api /v1/ark-services` endpoint can be removed or if other consumers depend on it
