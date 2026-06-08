## Why

The dashboard's marketplace source list — the URLs pointing at `marketplace.json` files that determine what the marketplace shows — is persisted only in browser `localStorage`. Two members of the same team see two different marketplaces unless they manually keep their browsers in sync; clearing site data wipes custom sources; platform teams cannot declare, lock down, or audit the catalogue for the namespaces they manage.

Fixing this now also unblocks two sibling issues without rework: #2346 (authenticated source URLs, which will need Secret refs alongside each source URL) and #2347 (per-source install policy, which assumes the same governance posture as the source list itself).

## What Changes

- New namespaced **`marketplace-sources` ConfigMap** (one per namespace, fixed name). `data` holds one key per source; each value is JSON-encoded `{url, displayName?}`. One key per source enables server-side apply at the source level so Helm-seeded entries and user edits coexist.
- New Kubernetes RBAC: a `marketplace-source-editor` ClusterRole granting `get/update/patch` on `configmaps` with `resourceNames: ["marketplace-sources"]`. Default install binds it to no one — platform teams bind it per namespace. Read access is granted to the existing default dashboard role so every dashboard user sees the catalogue.
- New ark-api endpoints under `/api/v1/namespaces/{namespace}/marketplace-sources/` (list / get / create / update / delete — operating on entries inside the ConfigMap) and `/api/v1/namespaces/{namespace}/marketplace-items` (the aggregator that fetches every `marketplace.json` for that namespace's sources). Both run under the requesting user's identity via the existing impersonation middleware. ark-api validates URL well-formedness on every write (HTTPS-only, parseable absolute URL).
- **BREAKING (internal API)**: the dashboard's `/api/marketplace` Next.js route is removed and the `X-Marketplace-Sources` HTTP header path is deleted. The dashboard calls ark-api directly. The `marketplace-sources` `localStorage` key is removed; existing values are silently ignored on first load.
- Helm values seed default sources at deploy time via a new `marketplaceSources` key, replacing the hard-coded `mckinsey/agents-at-scale-marketplace` URL today carried in `atoms/marketplace-sources.ts:12-17`. Each entry produces one key in the target namespace's `marketplace-sources` ConfigMap, applied with server-side apply so user edits to seeded entries survive `helm upgrade`.
- Dashboard's Manage Marketplace page becomes RBAC-aware: users without `marketplace-source-editor` see a read-only list (no add / edit / delete controls). Namespace switch reloads the source list and items for the new namespace.

## Capabilities

### New Capabilities

- `marketplace-sources`: namespaced `marketplace-sources` ConfigMap as the source of truth for marketplace source URLs; ark-api CRUD + manifest-aggregator endpoints fronting it; Helm seeding for platform-team defaults; dashboard read/write flowing through ark-api with native Kubernetes RBAC. Reserves the per-source value shape for a future `authorization` block (#2346) without implementing it.

### Modified Capabilities

None. `api-impersonation` and `multi-namespace-rbac` are consumed unchanged.

## Impact

- **No new CRD, no new webhook, no Go code in `ark/`**: the resource is a stock ConfigMap; URL validation lives in ark-api on the write path.
- **ark-api (Python)**: new modules under `services/ark-api/ark-api/src/ark_api/api/v1/` — `marketplace_sources.py` (CRUD over the namespaced ConfigMap via `with_ark_client(...)`, with URL validation on every write) and `marketplace_items.py` (aggregator that reads sources from the ConfigMap and fetches each `marketplace.json`, replacing the dashboard's Next.js route). Outbound fetch is cached per `(namespace, source-name, url)` for 1 hour, with per-source 10s and aggregator total 30s timeout guards. Existing test fixtures cover the impersonation path, so the RBAC-denied path tests are additive.
- **Dashboard (TypeScript)**:
  - Remove `atomWithStorage` and the `marketplaceSourcesAtom` from `atoms/marketplace-sources.ts`; replace with a `useQuery` against ark-api keyed on the active namespace.
  - Remove `services/ark-dashboard/ark-dashboard/app/api/marketplace/route.ts` and the `X-Marketplace-Sources` header construction in `lib/services/marketplace.ts`.
  - `components/settings/manage-marketplace-settings.tsx` consults an ark-api permission probe (SSAR for `update configmaps/marketplace-sources`) and renders read-only or editable accordingly.
- **RBAC**: new `marketplace-source-editor` ClusterRole bound by `resourceNames` to the `marketplace-sources` ConfigMap. Default install grants it to no one. Platform teams `kubectl create rolebinding` it per namespace.
- **Helm**: new `marketplaceSources` values key in the chart that owns the dashboard install today. Chart materialises one ConfigMap entry per values entry in its target namespace at install / upgrade time, using server-side apply with a dedicated field manager so user edits to seeded entries survive upgrades.
- **Migration**: silent. Existing `marketplace-sources` `localStorage` keys are ignored on first load; the cluster-side defaults populate via the Helm seed. PR #2336's "Sources persist in localStorage, per browser" limitation bullet is removed in the same PR.
- **Tests**: Python unit tests for ark-api endpoints including URL validation, the RBAC-denied path that exercises the impersonation gate, and the timeout / partial-failure paths of the aggregator; dashboard component tests for editable-vs-read-only `manage-marketplace-settings.tsx`; integration test seeding sources via Helm values and confirming the dashboard reads them on first load with no user action; chainsaw e2e covering two users (one with the role bound, one without) on a multi-namespace cluster.
- **Dependencies**: none.

## Non-Goals

- **Authenticated source URLs** (#2346) — the per-source value JSON reserves space for an `authorization` block but does not define or implement it. Adding the field shape, the Secret-ref resolution, and the outbound `Authorization` header is owned by that issue.
- **Per-source install policy / platform-team opt-out** (#2347) — lands as a separate resource (likely a sibling ConfigMap). This change must not add policy fields to per-source values.
- **Cluster-scoped sources** — out of scope. Every source is namespaced. Operators wanting cluster-wide defaults declare them via Helm values per namespace.
- **Marketplace item caching beyond the documented 1-hour revalidate** — rethinking it is a separate concern.
