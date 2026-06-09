## Context

The dashboard's marketplace source list lives in browser `localStorage` today. The dashboard's Next.js route at `app/api/marketplace/route.ts` reads the list from a client-supplied `X-Marketplace-Sources` HTTP header, fetches every `marketplace.json` server-side, and returns the aggregated items to the browser. The default seed is hard-coded in `atoms/marketplace-sources.ts:12-17` (one URL pointing at `mckinsey/agents-at-scale-marketplace`). Items themselves are not persisted — only the list of source URLs.

ark-api already supports Kubernetes user impersonation (`services/ark-api/ark-api/src/ark_api/auth/`), so any resource stored as a Kubernetes object inherits native RBAC enforcement against the requesting user. The `Model` CRD's `ValueSource` pattern is the prior art for referencing Secrets (relevant to sibling issue #2346).

## Goals / Non-Goals

**Goals:**
- Replace `localStorage` with a cluster-side, per-namespace source of truth that platform teams can seed at deploy time.
- Enforce edit permissions through native Kubernetes RBAC — no parallel authorization layer.
- Move the outbound `marketplace.json` fetch out of the dashboard's Next.js layer so #2346 (auth) and #2347 (install policy) can compose additively.
- Reserve space in the per-source value shape for #2346's authentication block without implementing it.

**Non-Goals:**
- Authenticated source URLs (#2346).
- Per-source install policy / opt-out (#2347).
- Cluster-scoped sources — every source is namespaced.
- Adding a controller — `marketplace-sources` is a config resource read by ark-api, not driven by reconciliation.
- Replacing the existing 1-hour fetch revalidate semantics.

## Decisions

### 1. ConfigMap over CRD

**Decision**: Store sources as entries inside a single namespaced ConfigMap named `marketplace-sources` (one ConfigMap per namespace), not as instances of a custom resource.

**Why ConfigMap is enough**:
- No reconciliation: the resource is config read by ark-api, never driven by a controller.
- RBAC granularity needed by #2348 / #2347 is "platform team can edit the catalogue in this namespace, dashboard users read it" — uniform within a namespace, achievable on a ConfigMap with `resourceNames`-scoped RBAC.
- URL well-formedness validation lives cleanly in ark-api on the write path; a dedicated admission webhook for one resource is overhead that buys little.
- Stock primitive: no CRD generation step, no webhook scaffolding, no Helm chart sync gymnastics.

**Alternatives considered**:
- *`MarketplaceSource` CRD (one CR per source)*: gives stronger schema enforcement at the API layer and prettier `kubectl` ergonomics, but adds Go types, generated CRD YAML, validating webhook scaffolding, and a Helm chart sync step. Rejected as overhead disproportionate to the value, given no controller is needed and the ConfigMap approach handles the actual governance use cases.

**Risks of using ConfigMap**:
- Looser typing: the per-source value is a JSON-encoded string. Mitigated by ark-api Pydantic validation on every write and on read.
- Less self-documenting: `kubectl get cm marketplace-sources -n <ns> -o yaml` shows JSON values, not a typed view. Mitigated by the dashboard being the primary admin surface.

### 2. Namespaced ConfigMap, fixed name

**Decision**: One ConfigMap per namespace with the fixed name `marketplace-sources`.

**Rationale**: Multi-tenant clusters need different catalogues per namespace (e.g. `team-a` sees a curated subset, `team-b` sees a superset). A fixed name across namespaces lets RBAC use `resourceNames: ["marketplace-sources"]` to scope edit permission to exactly this object without granting broad ConfigMap edit rights. Aligns with how `Model`, `Agent`, and `MCPServer` are namespaced.

### 3. Move the outbound fetch to ark-api now, not later

**Decision**: The aggregator endpoint that fetches `marketplace.json` files lives in ark-api in this change. The dashboard's `/api/marketplace` Next.js route is removed entirely.

**Alternatives considered**:
- *Keep the Next.js route, just have it read from ark-api instead of `X-Marketplace-Sources`*: works for #2348 alone but #2346 needs the outbound `Authorization` header to come from a Secret, which puts Secret-reading credentials in the Next.js server. That's a much larger trust boundary expansion than reading the source list.

**Rationale**: ark-api already runs under impersonation. When #2346 adds Secret refs, the resolution happens in the same request as the source list read, under the same impersonated identity. Doing this work now makes #2346 purely additive. Deferring would force a second migration of the dashboard's fetch path within a few weeks.

### 4. ConfigMap data shape: one key per source, JSON-encoded value

**Decision**: Each source is a distinct key in `data`; the value is a JSON-encoded object `{"url": "...", "displayName": "..."}`. Keys are the source name and SHALL match the DNS subdomain rules ConfigMap keys already enforce.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: marketplace-sources
  namespace: team-a
data:
  agents-at-scale-marketplace: |
    {"url":"https://raw.githubusercontent.com/mckinsey/agents-at-scale-marketplace/main/marketplace.json","displayName":"Ark Marketplace"}
  internal-mirror: |
    {"url":"https://internal.example.com/marketplace.json"}
```

**Rationale**: server-side apply tracks ownership at the data-key level. Helm-seeded entries have field manager `helm-marketplace-seeder`; user edits to a seeded entry's `displayName` (via the dashboard or `kubectl`) take ownership of that key, and subsequent `helm upgrade` runs leave the user-owned key alone. Adding or removing a source is a per-key operation rather than rewriting the whole list.

**Alternatives considered**:
- *Single key with JSON array (`data.sources = '[...]'`)*: more compact and slightly easier to read in `kubectl edit`, but SSA owns the whole `sources` value — Helm and users cannot co-edit cleanly, and adds/deletes rewrite the list on every change.
- *Annotation-style flat keys (`sources.<name>.url`, `sources.<name>.displayName`)*: works for SSA but produces N keys per source and is awkward to extend when #2346 adds nested authorization.

**Future fields** (#2346): the per-source JSON value will grow an `authorization` block referencing a Secret:

```jsonc
{"url": "...", "displayName": "...",
 "authorization": {"secretRef": {"name": "...", "key": "..."}}}
```

ark-api Pydantic models gain the new field additively; existing entries without `authorization` keep working.

### 5. ark-api endpoint surface

Two endpoint groups, both impersonated:

- **`/api/v1/namespaces/{namespace}/marketplace-sources`** — REST CRUD over ConfigMap entries. List/get/create/update/delete operate on individual data keys via server-side patch. ark-api validates URL well-formedness on every write (HTTPS-only, parseable absolute URL); validation errors surface as 422. Errors from kube-apiserver (403, 404) bubble through unmodified.
- **`/api/v1/namespaces/{namespace}/marketplace-items`** — aggregator. Reads the namespace's `marketplace-sources` ConfigMap (impersonated), parses each JSON value, fetches every URL concurrently, returns a grouped response: one entry per source, with `items` on success or `error` on failure. Always HTTP 200; partial failure is conveyed per entry.

```jsonc
[
  { "source": "agents-at-scale-marketplace", "displayName": "Ark Marketplace",
    "items": [ /* ... */ ] },
  { "source": "internal-mirror", "displayName": "Internal",
    "error": { "message": "fetch timed out after 10s", "code": "fetch_timeout" } }
]
```

The grouped shape matches `manage-marketplace-settings.tsx` directly; the browse page flattens cheaply at the call site. Errors are first-class — every consumer handles the `error` variant.

**Cache**: 1-hour TTL keyed on `(namespace, source-name, url)`, in-process per ark-api replica. Per-namespace keying matters once #2346 lands and the same URL can resolve under different `Authorization` headers.

**Timeouts**: per-source HTTP fetch ≤ 10s (`error.code: "fetch_timeout"`); aggregator total wall-clock ≤ 30s (un-fetched sources get `error.code: "aggregator_timeout"`). Guards bound dashboard latency against slow or attacker-controlled URLs.

**Permission probe**: `GET .../marketplace-sources/permissions` returns `{canEdit: false}` if the SSAR call itself fails (e.g. ark-api SA lacks `create selfsubjectaccessreviews`). Fail-closed — the dashboard never sees a 500 nor accidentally renders editable controls.

**Alternatives considered**:
- *Flat response shape* (`{items: [...]}` with `source` per item): no natural place for per-source errors; forces the Manage page to reconstruct grouping client-side; harder to extend when #2347 adds per-source policy.
- *Default HTTP client timeouts*: defaults are minutes — an attacker-controlled URL would block the page indefinitely.

### 6. URL validation in ark-api, no admission webhook

**Decision**: ark-api validates `url` on every write request: must parse as an absolute URL, scheme must be `https`. Validation errors return HTTP 422 with the offending field path. No admission webhook is registered.

**Rationale**: a dedicated webhook on `configmaps` would have to filter by name (`marketplace-sources`) on every ConfigMap admission cluster-wide — heavyweight for one resource. ark-api is the only writer the dashboard talks to; direct `kubectl edit` of the ConfigMap by a platform admin remains possible (and the data shape is simple enough that mistakes are obvious in `kubectl describe`). If a regression or security need ever requires kube-apiserver-level validation, a webhook can be added additively without changing the ConfigMap data shape.

### 7. Permission probe: SelfSubjectAccessReview via ark-api

**Decision**: The dashboard's Manage Marketplace page calls a new `GET /api/v1/namespaces/{namespace}/marketplace-sources/permissions` ark-api endpoint that issues a `SelfSubjectAccessReview` for `update configmaps` with `resourceName: "marketplace-sources"` on behalf of the impersonated user, returning `{ canEdit: bool }`.

**Alternatives considered**:
- *Try the write and handle 403 in the UI*: simpler but produces destructive-feeling failure modes (user fills in a form, hits save, gets 403). Bad UX.
- *Encode role in JWT/session*: requires the dashboard auth layer to know about RBAC, breaking the current model where ark-api owns all impersonation.

**Rationale**: SSAR is the canonical way to ask "can I do X?" without doing it. ark-api wraps it in one endpoint so the dashboard stays thin.

### 8. Helm seeding

**Decision**: A new `marketplaceSources` values key on the chart that owns the dashboard install. Each entry is a flat object with `name`, `url`, optional `displayName`, and optional `namespace` (defaulting to the install namespace when omitted). Entries materialise one key inside the target namespace's `marketplace-sources` ConfigMap via a `helm.sh/hook: post-install,post-upgrade` Job that runs `kubectl apply --server-side --field-manager helm-marketplace-seeder`. The Job constructs the ConfigMap in each target namespace if it does not already exist, then merges the values-derived keys.

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

This shape lets a single `helm install` seed different catalogues for different namespaces. The Job groups entries by their target namespace and applies the relevant subset in each one.

**Alternatives considered**:
- *Single install-namespace only*: rejected — fails the multi-tenant use case.
- *Map shape `marketplaceSources: { namespace: [entries] }`*: cleaner when one namespace has many sources, but harder to template and forces operators to repeat the namespace key. Flat list is more Helm-idiomatic.
- *Static templated ConfigMap* (no Job): would conflict with `helm upgrade` if a user has edited a key — Helm's 3-way merge would revert them. The Job using server-side apply with a dedicated field manager keeps user edits intact across upgrades.

**RBAC implication**: the Job's ServiceAccount needs `update/patch/get/create` on `configmaps` with `resourceNames: ["marketplace-sources"]` in every target namespace. Implemented as a single ClusterRole + ClusterRoleBinding scoped by Helm release ownership labels (cleaner than N RoleBindings); harmless because the Job runs once per release lifecycle and is owned by Helm.

### 9. Migration: silent localStorage discard

**Decision**: On first dashboard load after the upgrade, if the legacy `marketplace-sources` `localStorage` key exists, ignore it and remove it. No write-back to the cluster.

**Rationale**: localStorage entries are per-user-per-browser and may include URLs the user added without sharing with the team. Auto-uploading them to a namespaced cluster resource (which all team members see) leaks personal config. Discarding is the safe default; users can re-add anything they want from the UI, and platform teams should drive the catalogue via Helm anyway.

## Risks / Trade-offs

**[localStorage data loss]** → Users with custom (non-default) sources in `localStorage` lose them on upgrade. Mitigation: docs note the change in the dashboard release notes; default install seeds the same `mckinsey/agents-at-scale-marketplace` URL via Helm so the visible catalogue is identical for users who never customized.

**[ConfigMap value typing]** → Per-source values are JSON-encoded strings. Malformed JSON written via `kubectl edit` would surface as a 5xx in ark-api on read. Mitigation: ark-api Pydantic validation on every write keeps malformed entries from being created via the dashboard path; manual `kubectl edit` mistakes are rare in practice and produce a clear error in `kubectl describe`.

**[Dashboard-to-ark-api coupling on Manage Marketplace page]** → The page now fails when ark-api is unreachable (used to fail when the localStorage list was empty, which never happened). Mitigation: the dashboard already depends on ark-api for every other resource page (Agents, Models, MCPServers); marketplace inherits the same coupling, no new operational class.

**[Helm seed Job RBAC]** → The post-install Job needs `update/patch/create` on the `marketplace-sources` ConfigMap in every target namespace. Mitigation: the Job uses a dedicated ServiceAccount + ClusterRole bound only via Helm release ownership labels; teardown leaves no lingering binding.

**[Per-source fetch failures masked by aggregator]** → If a `marketplace.json` URL is unreachable, the aggregator returns `{ source: <name>, error: "..." }` for that source and successes for others. Users may not notice a stale source. Mitigation: the dashboard renders the per-source error inline on the Manage Marketplace page so the user can see what's broken; this matches today's Next.js behaviour, not a regression.

## Migration Plan

1. **Install / upgrade**: Helm post-install Job creates the `marketplace-sources` ConfigMap in each target namespace and seeds the default key(s). No-op on upgrades where the keys already exist (server-side apply with the same field manager is idempotent).
2. **First dashboard load**: legacy `marketplace-sources` `localStorage` key is read once, removed, and not migrated. The dashboard fetches sources from ark-api.
3. **Rollback**: rolling back to a pre-#2348 dashboard image restores the localStorage path immediately. The ConfigMaps left in the cluster are harmless (no consumer). Re-rolling forward picks up the same ConfigMaps without re-seeding.

## Open Questions

- **Read access binding**: should the default install bind read-only access on the `marketplace-sources` ConfigMap to `system:authenticated`, to a specific dashboard role, or only to the namespaces granted via Helm values? Leaning toward per-namespace binding scoped to the install namespace + any in `marketplaceSources[].namespace` — defer the final answer to the implementation review.
