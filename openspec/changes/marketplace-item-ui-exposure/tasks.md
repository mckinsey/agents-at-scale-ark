## 1. Formalize Annotation Contract

- [ ] 1.1 Document `ark.mckinsey.com/marketplace-item-ui-url` and `ark.mckinsey.com/marketplace-item-ui-label` annotation contract in `docs/` (purpose, expected values, multi-URL behavior)
- [ ] 1.2 Validate that `marketplace-fetcher.ts` `getAllServiceUIs` handles multiple Services per release correctly and surfaces all URLs in the `uis` array
- [ ] 1.3 Add HTTPS-only validation in the fetcher: log a warning and skip non-HTTPS URLs discovered via annotation

## 2. Extend marketplace.json Schema

- [ ] 2.1 Define the `ui` block schema in the marketplace repo (`marketplace.json` — optional `path`, `label`, `embedded` fields) and open a PR against `mckinsey/agents-at-scale-marketplace`
- [ ] 2.2 Add `ui` block entries to existing marketplace items that have web UIs (Phoenix, Langfuse, a2a-inspector at minimum) in the marketplace repo PR
- [ ] 2.3 Update `GitHubMarketplaceItem` interface in `marketplace-fetcher.ts` to include the optional `ui` block
- [ ] 2.4 Thread `ui.label` from manifest as default label when no annotation label is present (fallback in `transformGitHubItemToMarketplaceItem`)

## 3. HTTPRoute Fallback URL Resolution

- [ ] 3.1 In `marketplace-fetcher.ts`, implement HTTPRoute fallback: when `uis` is empty after annotation scan but manifest has `ui.path` and an HTTPRoute is available for the release, construct and append the URL
- [ ] 3.2 Add catalog-only UI indicator: when item is not installed but manifest has a `ui` block, set a `hasUiHint: true` flag on `MarketplaceItem` (or use `uis` with a sentinel) so the "Has UI" filter can include it

## 4. Dashboard — Marketplace Item Cards

- [ ] 4.1 Add "Open UI" button to `MarketplaceItemCard` component; render only when `item.uis` has at least one entry
- [ ] 4.2 For items with a single UI, render a direct link button; for items with 2+ UIs, render a dropdown listing all UI labels and URLs
- [ ] 4.3 Add a "has UI" visual badge/indicator on cards for items with `hasUiHint: true` that are not yet installed (catalog-time display)

## 5. Dashboard — Marketplace Item Detail Page

- [ ] 5.1 Add "Open UI" button(s) to the item detail page header/action area for installed items with `uis` entries
- [ ] 5.2 Update detail page to list all available UI links when multiple are present

## 6. Dashboard — Marketplace Page Filter

- [ ] 6.1 Add "Has UI" checkbox/toggle to the marketplace page filter panel
- [ ] 6.2 Wire "Has UI" filter to hide items that have neither resolved `uis` entries nor a `hasUiHint` flag
- [ ] 6.3 Update `MarketplaceFilters` type in `marketplace-types.ts` to include `hasUi?: boolean`

## 7. Services Page Retirement

- [ ] 7.1 Verify marketplace page "Installed" filter + "Has UI" filter combination covers all functionality of the services page
- [ ] 7.2 Remove `app/(dashboard)/services/` directory and its route
- [ ] 7.3 Add a redirect from `/services` to `/marketplace?status=installed` in Next.js routing
- [ ] 7.4 Remove the "Services" sidebar navigation entry from `components/app-sidebar.tsx` and `lib/constants/dashboard-icons.ts`

## 8. Phase 2 — Embedded UI (iframe)

- [ ] 8.1 Add `embedded?: boolean` to `MarketplaceItem` type (propagated from manifest `ui.embedded`)
- [ ] 8.2 Add a "UI" tab to the marketplace item detail page that conditionally renders when `item.embedded === true` and a UI URL is resolved
- [ ] 8.3 Implement the sandboxed iframe component with `sandbox="allow-scripts allow-same-origin allow-forms"`, HTTPS enforcement, and an error state for non-HTTPS URLs
- [ ] 8.4 Gate the embedded UI tab behind the experimental features flag until the CSP configuration story is finalized
- [ ] 8.5 Document CSP `frame-src` configuration for operators (how to allowlist marketplace item origins)

## 9. Testing

- [ ] 9.1 Unit tests for URL resolution hierarchy in `marketplace-fetcher.ts` (annotation wins, HTTPRoute fallback, no-URL path)
- [ ] 9.2 Unit tests for "Has UI" filter logic in marketplace page
- [ ] 9.3 Component tests for `MarketplaceItemCard` with and without UI entries (single URL, multiple URLs, hint-only)
- [ ] 9.4 E2E test: install a marketplace item with a UI annotation, verify "Open UI" button appears and navigates correctly
- [ ] 9.5 E2E test: verify services page redirect lands on marketplace with correct filter state
