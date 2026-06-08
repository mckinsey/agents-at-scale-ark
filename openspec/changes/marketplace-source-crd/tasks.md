# Implementation Tasks

Organized so the impl PR can be committed in three logical, self-contained commits — each passing lint and tests on its own. Section 4 (docs/e2e) is split per commit; the heading numbering reflects the commit boundary so reviewers can read commit-by-commit.

## 1. Commit 1 — `feat(crd): add MarketplaceSource type, RBAC, Helm seed`

### 1.1 CRD type and generation

- [ ] 1.1.1 Create `ark/api/v1alpha1/marketplacesource_types.go` with `MarketplaceSource`, `MarketplaceSourceList`, `MarketplaceSourceSpec` (`URL string`, `DisplayName *string`).
- [ ] 1.1.2 Add kubebuilder markers: `+kubebuilder:resource:scope=Namespaced,shortName=mps`, `+kubebuilder:object:root=true`, `+kubebuilder:validation:Pattern=^https://` on `URL`.
- [ ] 1.1.3 Register the type in `ark/api/v1alpha1/groupversion_info.go` (or equivalent scheme registration file).
- [ ] 1.1.4 Run `make manifests` and verify the generated CRD YAML lands under `ark/config/crd/bases/`.
- [ ] 1.1.5 Sync the generated CRD into the Helm chart per the existing `make` workflow for CRD additions.

### 1.2 Validating webhook for URL well-formedness

- [ ] 1.2.1 Add a webhook handler under `ark/internal/webhook/marketplacesource_webhook.go` validating `spec.url` parses as an absolute URL (defensive layer beyond the OpenAPI pattern).
- [ ] 1.2.2 Register the webhook in the webhook startup sequence and the chart's webhook configuration.
- [ ] 1.2.3 Unit tests for the webhook covering: well-formed URL accepted, malformed URL rejected, missing scheme rejected.

### 1.3 RBAC ClusterRole

- [ ] 1.3.1 Add a `ClusterRole` named `marketplace-source-editor` to the ark-controller chart granting `get,list,watch,create,update,patch,delete` on `marketplacesources.ark.mckinsey.com`.
- [ ] 1.3.2 Extend the existing dashboard tenant role(s) with `get,list,watch` on `marketplacesources.ark.mckinsey.com` so every dashboard user can read the catalogue without an explicit binding.
- [ ] 1.3.3 Add a sample `RoleBinding` manifest under `samples/marketplace/marketplace-source-editor-binding.yaml` with comments showing how to bind a user/group per namespace.

### 1.4 Helm seeding

- [ ] 1.4.1 Add the `marketplaceSources` values key to the ark-controller chart `values.yaml`. Each entry is a flat object with `name`, `url`, optional `displayName`, and optional `namespace` (defaulting to the install namespace when omitted). Default value: a single entry `{name: agents-at-scale-marketplace, url: <canonical URL>, displayName: "Ark Marketplace"}` with no `namespace` set.
- [ ] 1.4.2 Add a post-install/post-upgrade Job template (`templates/marketplace-sources-seed-job.yaml`) that iterates over `marketplaceSources` entries grouped by their target namespace and runs `kubectl apply --server-side --field-manager helm-marketplace-seeder` for each. Empty `marketplaceSources: []` produces zero CRs and the Job becomes a no-op (or is skipped via `{{- if .Values.marketplaceSources }}`).
- [ ] 1.4.3 Provision the Job's RBAC: a dedicated ServiceAccount, a ClusterRole granting `create,update,patch,get` on `marketplacesources.ark.mckinsey.com`, and a ClusterRoleBinding scoped by Helm release ownership labels. Cluster-scope is required because entries can target arbitrary namespaces; the binding is owned by the release and cleaned up on uninstall.
- [ ] 1.4.4 Confirm `helm upgrade` does not revert manual user edits to `spec.displayName` on a Helm-seeded `MarketplaceSource` (server-side apply field-manager test).
- [ ] 1.4.5 Multi-namespace seeding test: install with two entries pointing at namespaces `team-a` and `team-b` and confirm one CR lands in each.

### 1.5 Tests + docs (commit 1 scope)

- [ ] 1.5.1 Go unit tests for the type registration and the validating webhook.
- [ ] 1.5.2 Add a CRD reference page under `docs/content/reference/resources/marketplacesource.mdx` describing the schema, the `marketplace-source-editor` role, and the Helm values key.
- [ ] 1.5.3 Run `make lint` and `make test` in `ark/` — clean.

## 2. Commit 2 — `feat(ark-api): marketplace-sources CRUD + move fetch from dashboard`

### 2.1 ark-api CRUD module

- [ ] 2.1.1 Create `services/ark-api/ark-api/src/ark_api/api/v1/marketplace_sources.py` exposing `GET/POST/PATCH/DELETE /api/v1/namespaces/{namespace}/marketplace-sources[/{name}]`.
- [ ] 2.1.2 All handlers SHALL execute via `with_ark_client(...)` so the impersonation middleware applies. Errors from kube-apiserver propagate unchanged.
- [ ] 2.1.3 Pydantic models for request/response payloads (`MarketplaceSourceCreate`, `MarketplaceSourceResponse`).
- [ ] 2.1.4 Wire the new router into the v1 API root (`api/v1/__init__.py` or equivalent).

### 2.2 ark-api aggregator module

- [ ] 2.2.1 Create `services/ark-api/ark-api/src/ark_api/api/v1/marketplace_items.py` exposing `GET /api/v1/namespaces/{namespace}/marketplace-items`.
- [ ] 2.2.2 Implementation lists `MarketplaceSource` CRs (impersonated), then concurrently fetches each `spec.url`, returning `[{source, items}]` on success and `[{source, error}]` per failed source. Successful fetches are cached for 1 hour (match Next.js `revalidate: 3600`).
- [ ] 2.2.3 Outbound HTTP fetch uses the existing httpx client patterns from other ark-api endpoints (timeouts, retries).
- [ ] 2.2.4 Logs include source name on every fetch attempt; never log full source URLs at info-level (they may be private mirrors per #2346 prep).

### 2.3 ark-api permission probe

- [ ] 2.3.1 Add `GET /api/v1/namespaces/{namespace}/marketplace-sources/permissions` issuing a `SelfSubjectAccessReview` for `update marketplacesources` and returning `{"canEdit": <bool>}`.
- [ ] 2.3.2 Reuse the existing impersonation pathway — SSAR runs against the impersonated user.

### 2.4 ark-api RBAC additions

- [ ] 2.4.1 ark-api ServiceAccount gains `create selfsubjectaccessreviews` (cluster-scoped, required for the probe). The existing impersonation grant already covers user-side reads.

### 2.5 Remove Next.js fetch path

- [ ] 2.5.1 Delete `services/ark-dashboard/ark-dashboard/app/api/marketplace/route.ts`.
- [ ] 2.5.2 Delete `services/ark-dashboard/ark-dashboard/lib/services/marketplace-fetcher.ts` (replaced by ark-api).
- [ ] 2.5.3 Remove the `X-Marketplace-Sources` header construction in `services/ark-dashboard/ark-dashboard/lib/services/marketplace.ts` and any other call sites.
- [ ] 2.5.4 Update typing/interfaces in `lib/services/marketplace.ts` so the dashboard fetches via ark-api instead of the deleted route.

### 2.6 Tests + docs (commit 2 scope)

- [ ] 2.6.1 Python unit tests for `marketplace_sources.py` covering the impersonation propagation (403 path), validation errors (422), and not-found (404).
- [ ] 2.6.2 Python unit tests for `marketplace_items.py` covering the all-success path, the per-source-error path, and the no-permission path.
- [ ] 2.6.3 Python unit test for the permission probe covering both `canEdit` outcomes (mock the SSAR response).
- [ ] 2.6.4 Document the new endpoints in the ark-api OpenAPI surface (`docs/content/reference/...`) — list, get, create, update, delete, items, permissions.
- [ ] 2.6.5 Run `make lint` and `make test` in `services/ark-api/` — clean.

## 3. Commit 3 — `feat(dashboard): switch to cluster-backed sources, drop localStorage`

### 3.1 Replace localStorage atom

- [ ] 3.1.1 Remove `marketplaceSourcesAtom` and the `atomWithStorage` import from `services/ark-dashboard/ark-dashboard/atoms/marketplace-sources.ts` (delete the file or leave the type export only if still referenced).
- [ ] 3.1.2 Add a React Query hook `useMarketplaceSources(namespace)` in `lib/services/marketplace.ts` calling `GET /api/v1/namespaces/{namespace}/marketplace-sources`.
- [ ] 3.1.3 Add a React Query hook `useMarketplaceItems(namespace)` calling `GET /api/v1/namespaces/{namespace}/marketplace-items`.
- [ ] 3.1.4 Add a hook `useMarketplaceCanEdit(namespace)` calling the permission probe.
- [ ] 3.1.5 Remove every consumer of `marketplaceSourcesAtom` and replace with the new hooks.

### 3.2 RBAC-aware Manage Marketplace UI

- [ ] 3.2.1 Update `services/ark-dashboard/ark-dashboard/components/settings/manage-marketplace-settings.tsx` to consult `useMarketplaceCanEdit`. When `canEdit: false`, render the source list as read-only (no Add/Edit/Delete controls).
- [ ] 3.2.2 Wire Add/Edit/Delete controls (when `canEdit: true`) through the ark-api CRUD endpoints; on success, invalidate the React Query cache for sources and items.

### 3.3 Namespace switch reload

- [ ] 3.3.1 Confirm React Query cache keys include the active namespace so the namespace-switch event invalidates and refetches sources + items automatically. Add explicit invalidation if the cache keying alone is insufficient.

### 3.4 Silent localStorage migration

- [ ] 3.4.1 Add a one-shot effect at the marketplace page mount that, if `localStorage.getItem('marketplace-sources')` returns non-null, removes the key. No upload, no UI prompt, no toast.
- [ ] 3.4.2 The effect SHALL run at most once per browser (idempotent: subsequent loads find no key and noop).

### 3.5 Tests + docs (commit 3 scope)

- [ ] 3.5.1 Component test for `manage-marketplace-settings.tsx` rendering read-only when probe returns `canEdit: false`.
- [ ] 3.5.2 Component test for `manage-marketplace-settings.tsx` rendering editable controls and successfully creating/deleting a source when probe returns `canEdit: true` (mock React Query).
- [ ] 3.5.3 Component test for the silent localStorage cleanup effect.
- [ ] 3.5.4 Update the marketplace developer docs (introduced by PR #2336): remove the "Sources persist in localStorage, per browser" limitation bullet; add a note pointing at the new `MarketplaceSource` reference page.
- [ ] 3.5.5 Run `make lint` and `make test` in `services/ark-dashboard/ark-dashboard/` — clean.

## 4. Cross-commit verification

- [ ] 4.1 Chainsaw e2e: deploy a cluster with two users (`alice` bound to `marketplace-source-editor` in `team-a`, `bob` not bound). Confirm `alice` can CRUD sources via ark-api and `bob` gets 403 on writes / read-only UI in dashboard.
- [ ] 4.2 Multi-namespace check: verify dashboard switches between namespaces `team-a` and `team-b` and surfaces only the namespace-scoped source list and items each time.
- [ ] 4.3 Helm install on a fresh cluster: confirm the default `MarketplaceSource` exists and the dashboard renders the canonical Ark marketplace items on first load with no user action.
- [ ] 4.4 Helm upgrade on an existing cluster: confirm a manually-edited `spec.displayName` survives `helm upgrade`.
- [ ] 4.5 Migration check on a browser with a pre-upgrade `marketplace-sources` `localStorage` entry: confirm the key is removed and no entries are uploaded to the cluster.
