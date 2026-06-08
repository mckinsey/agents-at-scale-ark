## Why

The dashboard's marketplace source list — the URLs pointing at `marketplace.json` files that determine what the marketplace shows — is persisted only in browser `localStorage`. Two members of the same team see two different marketplaces unless they manually keep their browsers in sync; clearing site data wipes custom sources; platform teams cannot declare, lock down, or audit the catalogue for the namespaces they manage; and a future `MarketplaceSource` shape change has no migration story.

Fixing this now also unblocks two sibling issues without rework: #2346 (authenticated source URLs, which will need Secret refs that fit CRD spec fields cleanly — cf. how `Model.spec.config.apiKey` uses a `ValueSource` pointing at a Secret) and #2347 (per-source install policy, which lands as its own CRD but assumes the same governance posture as the source list itself).

## What Changes

- New namespaced CRD **`MarketplaceSource`** (one CR per source), with `spec.url` and optional `spec.displayName`. Namespace-scoped so platform teams can offer different catalogues to different namespaces.
- New Kubernetes RBAC: a `marketplace-source-editor` ClusterRole granting `get/list/watch/create/update/patch/delete` on `marketplacesources.ark.mckinsey.com`. Default install binds it to no one — platform teams bind it per namespace to the users or groups they want to authorize. Read access (`get/list/watch`) is granted to the existing default dashboard role so every dashboard user sees the catalogue.
- New ark-api endpoints under `/api/v1/namespaces/{namespace}/marketplace-sources/` (list / get / create / update / delete) and `/api/v1/namespaces/{namespace}/marketplace-items` (the aggregator that fetches every `marketplace.json` for that namespace's sources). Both run under the requesting user's identity via the existing impersonation middleware, so Kubernetes RBAC is enforced natively without a separate authorization layer.
- **BREAKING (internal API)**: the dashboard's `/api/marketplace` Next.js route is removed and the `X-Marketplace-Sources` HTTP header path is deleted. The dashboard calls ark-api directly. The `marketplace-sources` `localStorage` key is removed; existing values are silently ignored on first load (sources are recoverable through the UI, no migration step needed).
- Helm values seed default sources at deploy time via a new `marketplaceSources: []` key, replacing the hard-coded `mckinsey/agents-at-scale-marketplace` URL today carried in `atoms/marketplace-sources.ts:12-17`. Each entry produces one `MarketplaceSource` CR in the install namespace.
- Dashboard's Manage Marketplace page becomes RBAC-aware: users without `marketplace-source-editor` see a read-only list (no add / edit / delete controls). Namespace switch reloads the source list and items for the new namespace.

## Capabilities

### New Capabilities

- `marketplace-sources`: namespaced `MarketplaceSource` CRD as the source of truth for marketplace source URLs; ark-api CRUD + manifest-aggregator endpoints fronting it; Helm seeding for platform-team defaults; dashboard read/write flowing through ark-api with native Kubernetes RBAC. Reserves spec-level space for a future `spec.authorization` block (#2346) without implementing it.

### Modified Capabilities

None. `api-impersonation` and `multi-namespace-rbac` are consumed unchanged.

## Impact

- **CRD**: new `ark/api/v1alpha1/marketplacesource_types.go`, generated CRD YAML under `ark/config/crd/bases/`, and Helm chart sync. URL-format validation lives in a kubebuilder marker (HTTPS-only) plus a validating webhook for any cross-field rules. No controller / reconciler — `MarketplaceSource` is a config resource read by ark-api, not reconciled state.
- **ark-api (Python)**: new modules under `services/ark-api/ark-api/src/ark_api/api/v1/` — `marketplace_sources.py` (CRUD over the CRD via `with_ark_client(...)`) and `marketplace_items.py` (aggregator that lists sources for the namespace and fetches each `marketplace.json`, replacing the dashboard's Next.js route). Outbound fetch reuses the same 1-hour cache semantics the Next.js route uses today. Existing test fixtures cover the impersonation path (the `api-impersonation` capability), so the RBAC-denied path tests are additive.
- **Dashboard (TypeScript)**:
  - Remove `atomWithStorage` and the `marketplaceSourcesAtom` from `atoms/marketplace-sources.ts`; replace with a `useQuery` against ark-api keyed on the active namespace.
  - Remove `services/ark-dashboard/ark-dashboard/app/api/marketplace/route.ts` and the `X-Marketplace-Sources` header construction in `lib/services/marketplace.ts`.
  - `components/settings/manage-marketplace-settings.tsx` consults a self-subject-access-review (or equivalent ark-api permission probe) for `update marketplacesources` and renders read-only or editable accordingly.
- **RBAC**: new `marketplace-source-editor` ClusterRole. Default install grants it to no one. Platform teams `kubectl create rolebinding` it per namespace.
- **Helm**: new `marketplaceSources` values key in the chart that owns the dashboard install today (TBD in `design.md` — likely the ark-controller or dashboard chart, not ark-api). Chart materialises one `MarketplaceSource` per entry in the install namespace at install time.
- **Migration**: silent. Existing `marketplace-sources` `localStorage` keys are ignored on first load; the cluster-side defaults populate via the Helm seed. PR #2336's "Sources persist in localStorage, per browser" limitation bullet is removed in the same PR.
- **Tests**: Go unit tests for the webhook URL validator; Python unit tests for ark-api endpoints including the RBAC-denied path that exercises the impersonation gate; dashboard component tests for editable-vs-read-only `manage-marketplace-settings.tsx`; integration test seeding sources via Helm values and confirming the dashboard reads them on first load with no user action; chainsaw e2e covering two users (one with the role bound, one without) on a multi-namespace cluster.
- **Dependencies**: none.

## Non-Goals

- **Authenticated source URLs** (#2346) — the `MarketplaceSource` schema reserves space for `spec.authorization` but does not define or implement it. Adding the field shape, the Secret-ref resolution, and the outbound `Authorization` header is owned by that issue.
- **Per-source install policy / platform-team opt-out** (#2347) — lands as a separate singleton CRD (e.g. `MarketplaceConfig`). This change must not add policy fields to `MarketplaceSource`.
- **Cluster-scoped sources** — out of scope. Every source is namespaced. Operators wanting cluster-wide defaults declare them via Helm values per namespace.
- **Marketplace item caching beyond the existing 1-hour revalidate** — the aggregator inherits the current cache contract; rethinking it is a separate concern.
