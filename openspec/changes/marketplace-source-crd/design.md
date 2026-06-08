## Context

The dashboard's marketplace source list lives in browser `localStorage` today. The dashboard's Next.js route at `app/api/marketplace/route.ts` reads the list from a client-supplied `X-Marketplace-Sources` HTTP header, fetches every `marketplace.json` server-side, and returns the aggregated items to the browser. The default seed is hard-coded in `atoms/marketplace-sources.ts:12-17` (one URL pointing at `mckinsey/agents-at-scale-marketplace`). Items themselves are not persisted — only the list of source URLs.

ark-api already supports Kubernetes user impersonation (`services/ark-api/ark-api/src/ark_api/auth/`), so any resource stored as a Kubernetes object inherits native RBAC enforcement against the requesting user. The Ark codebase has prior art for namespaced config CRDs (`Model`, `MCPServer`) using a `ValueSource` pattern to point at Secrets — relevant for sibling issue #2346, which will need the same pattern for authenticated source URLs.

## Goals / Non-Goals

**Goals:**
- Replace `localStorage` with a cluster-side, per-namespace source of truth that platform teams can seed at deploy time.
- Enforce edit permissions through native Kubernetes RBAC — no parallel authorization layer.
- Move the outbound `marketplace.json` fetch out of the dashboard's Next.js layer so #2346 (auth) and #2347 (install policy) can compose additively.
- Reserve schema space for #2346's authentication block without implementing it.

**Non-Goals:**
- Authenticated source URLs (#2346).
- Per-source install policy / opt-out (#2347).
- Cluster-scoped sources — every source is namespaced.
- Reconciliation logic — `MarketplaceSource` is a config resource read by ark-api, not driven by a controller.
- Replacing the existing 1-hour fetch revalidate semantics.

## Decisions

### 1. CRD over ConfigMap

**Decision**: Store sources as one `MarketplaceSource` CR per source, not as entries in a single ConfigMap.

**Alternatives considered**:
- *ConfigMap with a YAML/JSON list*: simpler, no CRD generation step, Helm-friendly. Rejected because RBAC on a ConfigMap is all-or-nothing — every actor with edit permission can change every entry. CRDs grant per-resource RBAC natively (`update marketplacesources/foo`), and granular `resourceNames` bindings work out of the box.
- *Singleton CRD with a list field*: solves the RBAC granularity in spec but not at the K8s authorization layer (still one resource).

**Rationale**: One-CR-per-source matches the unit users think about ("revoke access to *that* source") and lets `kubectl describe marketplacesource <name>` show provenance, validation status, and (later) `spec.authorization` for #2346 in one place.

### 2. Namespaced, not cluster-scoped

**Decision**: `MarketplaceSource` is a namespaced resource.

**Rationale**: Multi-tenant clusters need different catalogues per namespace (e.g. `team-a` sees a curated subset, `team-b` sees a superset). A cluster-scoped resource would force a single catalogue or push the multi-tenancy concern into label selectors. Namespacing is the simpler primitive and aligns with how `Model`, `Agent`, and `MCPServer` are scoped.

### 3. Move the outbound fetch to ark-api now, not later

**Decision**: The aggregator endpoint that fetches `marketplace.json` files lives in ark-api in this change. The dashboard's `/api/marketplace` Next.js route is removed entirely.

**Alternatives considered**:
- *Keep the Next.js route, just have it read from ark-api instead of `X-Marketplace-Sources`*: works for #2348 alone but #2346 needs the outbound `Authorization` header to come from a Secret, which puts Secret-reading credentials in the Next.js server. That's a much larger trust boundary expansion than reading the source list.

**Rationale**: ark-api already runs under impersonation. When #2346 adds Secret refs, the resolution happens in the same request as the source list read, under the same impersonated identity. Doing this work now makes #2346 purely additive — a `spec.authorization` field plus a `client.read_secret(...)` call inside the existing aggregator. Deferring it would force a second migration of the dashboard's fetch path within a few weeks.

### 4. CRD schema (v1alpha1)

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: MarketplaceSource
metadata:
  name: agents-at-scale            # any kebab-case name
  namespace: default
spec:
  url: https://raw.githubusercontent.com/mckinsey/agents-at-scale-marketplace/main/marketplace.json
  displayName: "Ark Marketplace"   # optional; falls back to metadata.name
```

No `status` subresource in v1alpha1 — there is no controller. URL validation is enforced at admission time (decision 6). When #2346 lands, it adds `spec.authorization` (a `ValueSource` mirroring `Model.spec.config.apiKey`); when #2347 lands, install policy lives on a separate singleton CRD, not here.

### 5. ark-api endpoint surface

Two endpoint groups, both impersonated:

- **`/api/v1/namespaces/{namespace}/marketplace-sources`** — REST CRUD over the CRD. List/get/create/update/delete map 1:1 to `client.list_marketplacesources(...)` etc. Errors from kube-apiserver (403, 404, 422) bubble through unmodified — the dashboard handles them generically.
- **`/api/v1/namespaces/{namespace}/marketplace-items`** — the aggregator. Lists `MarketplaceSource` CRs in the namespace (impersonated, so RBAC filters), fetches every `spec.url` with the existing 1-hour revalidate cache, and returns `{ source: <name>, items: [...] }` per source. Per-source fetch failures degrade gracefully (one entry returns `{ source: <name>, error: "..." }`, others succeed) — matches today's Next.js behaviour.

**Alternatives considered**:
- *Single endpoint that fans out CRUD over the CRD via subpath routing*: less code, but ark-api already has a per-resource module pattern (`agents.py`, `models.py`); the CRUD module would feel out of place if it diverged.

### 6. URL validation: kubebuilder + validating webhook

**Decision**: `spec.url` carries `+kubebuilder:validation:Pattern=^https://` for HTTPS-only enforcement at OpenAPI level, plus a validating webhook for `MarketplaceSource` that checks the URL is well-formed and uses the registered `ark/internal/webhook/` infrastructure.

**Rationale**: Pattern-only validation lets bad URLs through that look like HTTPS but parse-fail. A webhook adds ~20 lines and reuses existing webhook plumbing (`validate_webhook.go` registration). HTTP (non-TLS) is forbidden — every supported source is a public manifest URL today; #2346's authenticated case is also HTTPS by definition.

### 7. Permission probe: SelfSubjectAccessReview via ark-api

**Decision**: The dashboard's Manage Marketplace page calls a new `GET /api/v1/namespaces/{namespace}/marketplace-sources/permissions` ark-api endpoint that issues a `SelfSubjectAccessReview` for `update marketplacesources` on behalf of the impersonated user, returning `{ canEdit: bool }`.

**Alternatives considered**:
- *Try the write and handle 403 in the UI*: simpler but produces destructive-feeling failure modes (user fills in a form, hits save, gets 403). Bad UX.
- *Encode role in JWT/session*: requires the dashboard auth layer to know about RBAC, breaking the current model where ark-api owns all impersonation.

**Rationale**: SSAR is the canonical way to ask "can I do X?" without doing it. ark-api wraps it in one endpoint so the dashboard stays thin.

### 8. Helm seeding location and multi-namespace shape

**Decision**: A new `marketplaceSources` values key on the **ark-controller chart** (the same chart that already installs every other Ark CRD). Each entry is a flat object with `name`, `url`, optional `displayName`, and optional `namespace` (defaulting to the install namespace when omitted). Entries materialise one `MarketplaceSource` CR each via a templated `helm.sh/hook: post-install,post-upgrade` Job that runs `kubectl apply --server-side --field-manager helm-marketplace-seeder` for every entry, grouped by their target namespace.

```yaml
marketplaceSources:
  - name: agents-at-scale-marketplace
    url: https://raw.githubusercontent.com/mckinsey/agents-at-scale-marketplace/main/marketplace.json
    displayName: "Ark Marketplace"
    # namespace omitted → install namespace
  - name: internal
    url: https://internal.example.com/marketplace.json
    namespace: team-a
  - name: shared
    url: https://shared.example.com/marketplace.json
    namespace: team-b
```

This shape lets a single `helm install` seed different catalogues for different namespaces — the central use case from the issue ("platform teams can declare the marketplace catalogue for each namespace they own"). The Job collects the distinct namespaces from the entries and applies the relevant subset in each one.

**Alternatives considered**:
- *Single install-namespace only* (initial draft): rejected — fails the multi-tenant use case; platform teams would need to run multiple Helm releases or post-install kubectl scripts.
- *Map shape `marketplaceSources: { namespace: [entries] }`*: cleaner when one namespace has many sources, but harder to template and forces operators to repeat the namespace key. Flat list is more Helm-idiomatic.
- *Bot's original shape `{ defaultSources: [...], namespaces: [...] }`*: broadcasts the SAME list to every listed namespace. Rejected — it doesn't support different catalogues per namespace.
- *Static templated `MarketplaceSource` resources*: would conflict with `helm upgrade` if a user has edited the CR (Helm would revert their change). The post-install Job using server-side apply keeps user edits intact across upgrades for any field the user owns.
- *Bundle into ark-api or ark-dashboard charts*: rejected — `MarketplaceSource` is a CRD-level concern, lives with other CRDs.

**RBAC implication**: the Job's ServiceAccount needs `create/update/patch` on `marketplacesources` in every target namespace. Implemented as a single ClusterRole + ClusterRoleBinding scoped by Helm release ownership labels (cleaner than N RoleBindings); harmless because the Job runs once per release lifecycle and is owned by Helm.

### 9. Migration: silent localStorage discard

**Decision**: On first dashboard load after the upgrade, if the legacy `marketplace-sources` `localStorage` key exists, ignore it and remove it. No write-back to the cluster.

**Rationale**: localStorage entries are per-user-per-browser and may include URLs the user added without sharing with the team. Auto-uploading them to a namespaced cluster resource (which all team members see) leaks personal config. Discarding is the safe default; users can re-add anything they want from the UI, and platform teams should drive the catalogue via Helm anyway.

## Risks / Trade-offs

**[localStorage data loss]** → Users with custom (non-default) sources in `localStorage` lose them on upgrade. Mitigation: docs note the change in the dashboard release notes; default install seeds the same `mckinsey/agents-at-scale-marketplace` URL via Helm so the visible catalogue is identical for users who never customized.

**[CRD schema churn at v1alpha1]** → `spec.authorization` (#2346) and any future field changes will land as additive v1alpha1 patches; if a breaking shape change is needed, a v1alpha2 conversion webhook follows existing Ark CRD conventions. v1alpha1 freedom is intentional — locked by `+kubebuilder:storageversion` on a single served version until #2346 informs the final shape.

**[Dashboard-to-ark-api coupling on Manage Marketplace page]** → The page now fails when ark-api is unreachable (used to fail when the localStorage list was empty, which never happened). Mitigation: the dashboard already depends on ark-api for every other resource page (Agents, Models, MCPServers); marketplace inherits the same coupling, no new operational class.

**[Helm seed Job RBAC]** → The post-install Job needs `create marketplacesources` in the install namespace. Mitigation: the Job uses a dedicated ServiceAccount + Role bound only at install time; teardown leaves no lingering binding (Helm handles via release ownership labels).

**[Per-source fetch failures masked by aggregator]** → If a `marketplace.json` URL is unreachable, the aggregator returns `{ source: <name>, error: "..." }` for that source and successes for others. Users may not notice a stale source. Mitigation: the dashboard renders the per-source error inline on the Manage Marketplace page so the user can see what's broken; this matches today's Next.js behaviour, not a regression.

## Migration Plan

1. **Install / upgrade**: Helm post-install Job creates the default `MarketplaceSource` CR(s) in the install namespace. No-op on upgrades where the CRs already exist.
2. **First dashboard load**: legacy `marketplace-sources` `localStorage` key is read once, removed, and not migrated. The dashboard fetches sources from ark-api.
3. **Rollback**: rolling back to a pre-#2348 dashboard image restores the localStorage path immediately. The CRs left in the cluster are harmless (no consumer). Re-rolling forward picks up the same CRs without re-seeding.

## Open Questions

- **Read access binding**: should the default install bind read-only access on `marketplacesources` to `system:authenticated`, to a specific dashboard role, or only to the namespaces granted via Helm values? Leaning toward per-namespace binding scoped to the install namespace + any in `marketplaceSources[].namespace` — defer the final answer to the implementation review.
- **CRD short name / categories**: `mps` short name and `ark-config` category? Worth a 30-second consistency check against existing Ark CRDs at impl time.
- **Aggregator response shape**: should per-source results be flat (`{ items: [...] }` with source name on each item) or grouped (`[{source, items}]`)? The dashboard's `manage-marketplace-settings.tsx` UI groups by source, which favours the grouped shape; the marketplace browse page is flat. Decide at impl time based on which call site is more expensive to refactor.
