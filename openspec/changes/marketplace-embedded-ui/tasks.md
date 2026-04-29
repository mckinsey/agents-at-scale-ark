## 1. Annotation Convention and Manifest Schema

- [ ] 1.1 Document `ark.mckinsey.com/marketplace-item-ui-url`, `ark.mckinsey.com/marketplace-item-ui-label`, and `ark.mckinsey.com/marketplace-item-ui-embedded` annotations in the Ark docs (marketplace item authoring guide)
- [ ] 1.2 Add optional `uis: { label: string; description?: string }[]` field to `GitHubMarketplaceItem` interface in `marketplace-fetcher.ts`
- [ ] 1.3 Update `transformGitHubItemToMarketplaceItem` to populate a pre-install `uisMetadata` field on `MarketplaceItem` from the manifest `uis` array (labels/descriptions only, no URLs)

## 2. Embedded UI Type Support

- [ ] 2.1 Extend `{ url: string; label: string }` in `MarketplaceItem.uis` (and `marketplace-types.ts`) to include `embedded?: boolean`
- [ ] 2.2 Update `getAllServiceUIs` in `marketplace-fetcher.ts` to read `ark.mckinsey.com/marketplace-item-ui-embedded` annotation and set `embedded: true` when present
- [ ] 2.3 Add unit tests for the updated `getAllServiceUIs` annotation parsing

## 3. Embedded UI Tab on Detail Page

- [ ] 3.1 Add a "UI" tab to the marketplace detail page (`app/(dashboard)/marketplace/[id]/page.tsx`) that renders when at least one `uis` entry has `embedded: true`
- [ ] 3.2 Implement the `EmbeddedUITab` component with a sandboxed `<iframe>` (`sandbox="allow-scripts allow-forms allow-same-origin"`)
- [ ] 3.3 Implement iframe load failure detection and render a fallback "Cannot embed — open in new tab" message with an external link button
- [ ] 3.4 Add unit tests for the `EmbeddedUITab` component (happy path and fallback path)

## 4. Pre-Install UI Documentation

- [ ] 4.1 Add a "Exposes UI" section to the detail page overview tab that renders `uisMetadata` labels/descriptions when the item is not installed
- [ ] 4.2 Add unit tests for the pre-install UI metadata rendering

## 5. Remove Services Page

- [ ] 5.1 Remove the `/services` route and all associated files from `app/(dashboard)/services/`
- [ ] 5.2 Remove any navigation links to `/services` from the dashboard sidebar/nav
- [ ] 5.3 Add a redirect from `/services` to `/marketplace` (or confirm 404 is acceptable per spec)
- [ ] 5.4 Verify no remaining imports or references to the services page

## 6. Integration and E2E

- [ ] 6.1 Update marketplace E2E test to verify an item with `ark.mckinsey.com/marketplace-item-ui-url` shows an external link button after install
- [ ] 6.2 Add E2E test: install an item with `ark.mckinsey.com/marketplace-item-ui-embedded: "true"`, verify the UI tab appears
- [ ] 6.3 Verify no regression on the marketplace page load performance (single batch Service fetch still in use)
