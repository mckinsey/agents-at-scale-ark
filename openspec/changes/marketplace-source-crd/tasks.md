# Implementation Tasks

Organized so the impl PR can be committed in two logical, self-contained commits — each passing lint and tests on its own.

## 1. Commit 1 — `feat(rbac+helm): marketplace-sources ConfigMap RBAC + Helm seed`

### 1.1 RBAC ClusterRole

- [ ] 1.1.1 Add a `ClusterRole` named `marketplace-source-editor` to the chart that owns the dashboard install. Rules: `apiGroups: [""]`, `resources: ["configmaps"]`, `resourceNames: ["marketplace-sources"]`, `verbs: ["get", "update", "patch"]`.
- [ ] 1.1.2 Extend the existing dashboard tenant role(s) with `get` on `configmaps` scoped to `resourceNames: ["marketplace-sources"]` so every dashboard user can read the catalogue without an explicit binding.
- [ ] 1.1.3 Add a sample `RoleBinding` manifest under `samples/marketplace/marketplace-source-editor-binding.yaml` with comments showing how to bind a user/group per namespace.

### 1.2 Helm seeding

- [ ] 1.2.1 Add the `marketplaceSources` values key to the chart's `values.yaml`. Each entry is a flat object with `name`, `url`, optional `displayName`, and optional `namespace` (defaulting to the install namespace when omitted). Default value: a single entry `{name: agents-at-scale-marketplace, url: <canonical URL>, displayName: "Ark Marketplace"}` with no `namespace` set.
- [ ] 1.2.2 Add a post-install/post-upgrade Job template (`templates/marketplace-sources-seed-job.yaml`) that iterates over `marketplaceSources` entries grouped by their target namespace and runs `kubectl apply --server-side --field-manager helm-marketplace-seeder` on a generated ConfigMap manifest per namespace. Empty `marketplaceSources: []` produces zero ConfigMaps and the Job is skipped via `{{- if .Values.marketplaceSources }}`.
- [ ] 1.2.3 The Job's apply payload SHALL include `kind: ConfigMap`, `metadata.name: marketplace-sources`, and `data.<source-name>: <JSON-encoded value>` so server-side apply tracks ownership at the data-key level.
- [ ] 1.2.4 Provision the Job's RBAC: a dedicated ServiceAccount, a ClusterRole granting `get,create,update,patch` on `configmaps` (scoped via `resourceNames: ["marketplace-sources"]` on update/patch verbs only — `create` requires unscoped permission), and a ClusterRoleBinding scoped by Helm release ownership labels. Cluster-scope is required because entries can target arbitrary namespaces; the binding is owned by the release and cleaned up on uninstall.
- [ ] 1.2.5 Confirm `helm upgrade` does not revert manual user edits to a Helm-seeded source's `displayName` (server-side apply field-manager test on the data key).
- [ ] 1.2.6 Multi-namespace seeding test: install with two entries pointing at namespaces `team-a` and `team-b` and confirm one ConfigMap with the appropriate keys lands in each.

### 1.3 Tests + docs (commit 1 scope)

- [ ] 1.3.1 Helm chart lint and template tests covering: empty `marketplaceSources`, single-entry default, multi-namespace entries.
- [ ] 1.3.2 Add a marketplace-sources reference page under `docs/content/reference/marketplace-sources.mdx` describing the ConfigMap shape, the per-source value JSON schema, the `marketplace-source-editor` role, and the Helm values key.
- [ ] 1.3.3 Run chart lint + Helm test suite — clean.

## 2. Commit 2 — `feat(ark-api+dashboard): marketplace-sources CRUD + dashboard migration`

### 2.1 ark-api CRUD module

- [ ] 2.1.1 Create `services/ark-api/ark-api/src/ark_api/api/v1/marketplace_sources.py` exposing `GET/POST/PATCH/DELETE /api/v1/namespaces/{namespace}/marketplace-sources[/{name}]`.
- [ ] 2.1.2 All handlers SHALL execute via `with_ark_client(...)` so the impersonation middleware applies. Errors from kube-apiserver propagate unchanged.
- [ ] 2.1.3 Pydantic models for the wire format (`MarketplaceSourceCreate`, `MarketplaceSourceResponse`) and the per-source value JSON (`url: HttpUrl`, `displayName: str | None`). URL validation rejects non-HTTPS schemes and unparseable values; failures return HTTP 422.
- [ ] 2.1.4 List handler reads the namespace's `marketplace-sources` ConfigMap, parses each `data` value, and returns a list. ConfigMap-not-found returns an empty list (200), not 404.
- [ ] 2.1.5 Create / update / delete handlers issue server-side patches against the namespace's `marketplace-sources` ConfigMap, adding/removing the appropriate `data` key. Create handler creates the ConfigMap if it does not yet exist (single server-side apply that materialises both the ConfigMap and the key).
- [ ] 2.1.6 Wire the new router into the v1 API root.

### 2.2 ark-api aggregator module

- [ ] 2.2.1 Create `services/ark-api/ark-api/src/ark_api/api/v1/marketplace_items.py` exposing `GET /api/v1/namespaces/{namespace}/marketplace-items`.
- [ ] 2.2.2 Implementation reads the namespace's `marketplace-sources` ConfigMap (impersonated), parses each value, then concurrently fetches each `url`. Returns the grouped response: `{source, displayName, items}` on success, `{source, displayName, error: {message, code}}` on failure. ConfigMap-not-found returns an empty array (200).
- [ ] 2.2.3 Per-source HTTP fetch uses an explicit 10s timeout. Aggregator total wall-clock is bounded at 30s; sources still in-flight at the deadline appear with `error.code: "aggregator_timeout"`. Network/parse/HTTP errors map to `network_error` / `parse_error` / `http_error`.
- [ ] 2.2.4 Successful fetches are cached for 1 hour, keyed on `(namespace, source-name, url)`. Cache is in-process per ark-api replica.
- [ ] 2.2.5 Logs include source name on every fetch attempt; never log full source URLs at info-level (they may be private mirrors per #2346 prep).

### 2.3 ark-api permission probe

- [ ] 2.3.1 Add `GET /api/v1/namespaces/{namespace}/marketplace-sources/permissions` issuing a `SelfSubjectAccessReview` for `update configmaps` with `resourceName: "marketplace-sources"` and returning `{"canEdit": <bool>}`.
- [ ] 2.3.2 If the SSAR call itself fails for any reason, return HTTP 200 with `{"canEdit": false}` and log the underlying error at warn level (fail-closed).
- [ ] 2.3.3 Reuse the existing impersonation pathway — SSAR runs against the impersonated user.

### 2.4 ark-api RBAC additions

- [ ] 2.4.1 ark-api ServiceAccount gains `create selfsubjectaccessreviews` (cluster-scoped, required for the probe). The existing impersonation grant already covers user-side reads.

### 2.5 Remove Next.js fetch path

- [ ] 2.5.1 Delete `services/ark-dashboard/ark-dashboard/app/api/marketplace/route.ts`.
- [ ] 2.5.2 Delete `services/ark-dashboard/ark-dashboard/lib/services/marketplace-fetcher.ts` (replaced by ark-api).
- [ ] 2.5.3 Remove the `X-Marketplace-Sources` header construction in `services/ark-dashboard/ark-dashboard/lib/services/marketplace.ts` and any other call sites.
- [ ] 2.5.4 Update typing/interfaces in `lib/services/marketplace.ts` so the dashboard fetches via ark-api instead of the deleted route.

### 2.6 Dashboard React hooks

- [ ] 2.6.1 Remove `marketplaceSourcesAtom` and the `atomWithStorage` import from `services/ark-dashboard/ark-dashboard/atoms/marketplace-sources.ts` (delete the file or leave the type export only if still referenced).
- [ ] 2.6.2 Add a React Query hook `useMarketplaceSources(namespace)` calling `GET /api/v1/namespaces/{namespace}/marketplace-sources`.
- [ ] 2.6.3 Add a React Query hook `useMarketplaceItems(namespace)` calling `GET /api/v1/namespaces/{namespace}/marketplace-items`.
- [ ] 2.6.4 Add `useMarketplaceCanEdit(namespace)` calling the permission probe.
- [ ] 2.6.5 Replace every consumer of `marketplaceSourcesAtom` with the new hooks.

### 2.7 RBAC-aware Manage Marketplace UI

- [ ] 2.7.1 Update `services/ark-dashboard/ark-dashboard/components/settings/manage-marketplace-settings.tsx` to consult `useMarketplaceCanEdit`. When `canEdit: false`, render the source list as read-only (no Add/Edit/Delete controls).
- [ ] 2.7.2 Wire Add/Edit/Delete controls (when `canEdit: true`) through the ark-api CRUD endpoints; on success, invalidate the React Query cache for sources and items.

### 2.8 Namespace switch reload

- [ ] 2.8.1 Confirm React Query cache keys include the active namespace so the namespace-switch event invalidates and refetches sources + items automatically. Add explicit invalidation if the cache keying alone is insufficient.

### 2.9 Silent localStorage migration

- [ ] 2.9.1 Add a one-shot effect at the marketplace page mount that, if `localStorage.getItem('marketplace-sources')` returns non-null, removes the key. No upload, no UI prompt, no toast.
- [ ] 2.9.2 The effect SHALL run at most once per browser (idempotent: subsequent loads find no key and noop).

### 2.10 Tests + docs (commit 2 scope)

- [ ] 2.10.1 Python unit tests for `marketplace_sources.py` covering URL validation (422), impersonation propagation (403), ConfigMap-not-found returns empty list (200), and create-when-ConfigMap-absent.
- [ ] 2.10.2 Python unit tests for `marketplace_items.py` covering all-success, one-source-error, per-source timeout, aggregator total timeout, and the no-permission path.
- [ ] 2.10.3 Python unit tests for the permission probe covering both `canEdit` outcomes plus the SSAR-failure fail-closed path.
- [ ] 2.10.4 Document the new endpoints in the ark-api OpenAPI surface (`docs/content/reference/...`) — list, get, create, update, delete, items, permissions.
- [ ] 2.10.5 Component test for `manage-marketplace-settings.tsx` rendering read-only when probe returns `canEdit: false`.
- [ ] 2.10.6 Component test for `manage-marketplace-settings.tsx` rendering editable controls and successfully creating/deleting a source when probe returns `canEdit: true` (mock React Query).
- [ ] 2.10.7 Component test for the silent localStorage cleanup effect.
- [ ] 2.10.8 Update the marketplace developer docs (introduced by PR #2336): remove the "Sources persist in localStorage, per browser" limitation bullet; add a note pointing at the new marketplace-sources reference page.
- [ ] 2.10.9 Run `make lint` and `make test` in `services/ark-api/` and `services/ark-dashboard/ark-dashboard/` — clean.

## 3. Cross-commit verification

- [ ] 3.1 Chainsaw e2e: deploy a cluster with two users (`alice` bound to `marketplace-source-editor` in `team-a`, `bob` not bound). Confirm `alice` can CRUD sources via ark-api and `bob` gets 403 on writes / read-only UI in dashboard.
- [ ] 3.2 Multi-namespace check: verify dashboard switches between namespaces `team-a` and `team-b` and surfaces only the namespace-scoped source list and items each time.
- [ ] 3.3 Helm install on a fresh cluster: confirm the default `marketplace-sources` ConfigMap exists and the dashboard renders the canonical Ark marketplace items on first load with no user action.
- [ ] 3.4 Helm upgrade on an existing cluster with a user-edited seeded source: confirm the user's `displayName` edit survives `helm upgrade`.
- [ ] 3.5 Migration check on a browser with a pre-upgrade `marketplace-sources` `localStorage` entry: confirm the key is removed and no entries are uploaded to the cluster.
- [ ] 3.6 Aggregator partial-failure test: configure 3 sources where one URL is unreachable; confirm the response is HTTP 200 with the failed source carrying an `error` field and the others returning `items`.
