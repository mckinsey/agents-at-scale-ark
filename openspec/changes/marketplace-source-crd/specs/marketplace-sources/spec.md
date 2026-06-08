## ADDED Requirements

### Requirement: Marketplace sources ConfigMap

Each namespace SHALL store its marketplace sources in a single ConfigMap named `marketplace-sources`. The ConfigMap's `data` field SHALL contain one key per source, where the key is the source name and the value is a JSON-encoded object with required `url` (string, HTTPS URL) and optional `displayName` (string).

The per-source value JSON SHALL match the schema:

```jsonc
{ "url": "<absolute https URL>", "displayName": "<optional human label>" }
```

Source names SHALL conform to the ConfigMap key naming rules already enforced by Kubernetes (alphanumeric, dashes, dots, underscores).

#### Scenario: Read sources from ConfigMap
- **WHEN** ark-api lists marketplace sources for namespace `team-a`
- **AND** the `marketplace-sources` ConfigMap in `team-a` contains key `internal-mirror` with value `'{"url":"https://example.com/marketplace.json","displayName":"Internal"}'`
- **THEN** ark-api parses the value and returns the source with `name: "internal-mirror"`, `url: "https://example.com/marketplace.json"`, `displayName: "Internal"`

#### Scenario: ConfigMap absent
- **WHEN** ark-api lists marketplace sources for a namespace where the `marketplace-sources` ConfigMap does not exist
- **THEN** ark-api returns an empty list with HTTP 200

### Requirement: URL validation on write

ark-api SHALL validate the `url` field on every create or update of a marketplace source. The URL SHALL parse as an absolute URL with scheme `https`. Validation failures SHALL return HTTP 422 with a message identifying the offending field. ark-api SHALL NOT write a malformed URL to the ConfigMap.

#### Scenario: Reject non-HTTPS URL
- **WHEN** an authenticated user calls `POST /api/v1/namespaces/team-a/marketplace-sources` with body `{"name": "x", "url": "http://example.com/marketplace.json"}`
- **THEN** ark-api returns HTTP 422 with a message identifying `url` as the invalid field
- **AND** the `marketplace-sources` ConfigMap is not modified

#### Scenario: Reject malformed URL
- **WHEN** an authenticated user calls `POST /api/v1/namespaces/team-a/marketplace-sources` with body `{"name": "x", "url": "https://"}`
- **THEN** ark-api returns HTTP 422
- **AND** the ConfigMap is not modified

#### Scenario: Accept well-formed HTTPS URL
- **WHEN** an authenticated user with edit permission calls `POST /api/v1/namespaces/team-a/marketplace-sources` with body `{"name": "x", "url": "https://raw.githubusercontent.com/org/repo/main/marketplace.json"}`
- **THEN** ark-api creates the corresponding key in the ConfigMap and returns HTTP 201

### Requirement: Marketplace source RBAC role

The Ark install SHALL provide a `ClusterRole` named `marketplace-source-editor` granting `get`, `update`, and `patch` verbs on the `configmaps` resource scoped to `resourceNames: ["marketplace-sources"]`. The default install SHALL NOT bind this role to any user or group — operators bind it per namespace.

The Ark install SHALL grant `get` on the `marketplace-sources` ConfigMap to the existing dashboard tenant role(s) so every dashboard user can read the catalogue regardless of edit permission.

#### Scenario: Editor binding allows write
- **WHEN** an operator binds `marketplace-source-editor` to user `alice` in namespace `team-a` via a `RoleBinding`
- **AND** `alice` calls `POST /api/v1/namespaces/team-a/marketplace-sources` with a valid body
- **THEN** the request succeeds and the corresponding key appears in the `marketplace-sources` ConfigMap

#### Scenario: No binding denies write
- **WHEN** user `bob` is not bound to `marketplace-source-editor` in namespace `team-a`
- **AND** `bob` calls `POST /api/v1/namespaces/team-a/marketplace-sources`
- **THEN** the request fails with HTTP 403

#### Scenario: Read access by default
- **WHEN** user `bob` (no editor binding) calls `GET /api/v1/namespaces/team-a/marketplace-sources`
- **THEN** the request succeeds and returns the list

### Requirement: Marketplace source CRUD endpoints

ark-api SHALL expose REST CRUD endpoints under `/api/v1/namespaces/{namespace}/marketplace-sources` covering list, get, create, update, and delete of individual marketplace source entries. All operations SHALL execute under the requesting user's identity via the existing impersonation middleware. CRUD operations SHALL be expressed as server-side patches against the namespace's `marketplace-sources` ConfigMap data keys, so concurrent edits to different sources do not conflict. Errors from kube-apiserver SHALL be propagated to the caller with their original HTTP status (403, 404).

#### Scenario: List sources
- **WHEN** an authenticated user calls `GET /api/v1/namespaces/team-a/marketplace-sources`
- **THEN** ark-api returns a JSON list containing every source entry parsed from the namespace's `marketplace-sources` ConfigMap

#### Scenario: Create source
- **WHEN** an authenticated user with edit permission calls `POST /api/v1/namespaces/team-a/marketplace-sources` with body `{"name": "internal", "url": "https://example.com/marketplace.json", "displayName": "Internal"}`
- **THEN** ark-api server-side patches the `marketplace-sources` ConfigMap to add key `internal` with the JSON-encoded value
- **AND** returns HTTP 201 with the created source representation

#### Scenario: Delete source without permission
- **WHEN** an authenticated user without edit permission calls `DELETE /api/v1/namespaces/team-a/marketplace-sources/internal`
- **THEN** ark-api returns HTTP 403 with the kube-apiserver error message

#### Scenario: Create source when ConfigMap does not yet exist
- **WHEN** the `marketplace-sources` ConfigMap does not exist in `team-a`
- **AND** an authenticated user with create permission calls `POST /api/v1/namespaces/team-a/marketplace-sources` with a valid body
- **THEN** ark-api creates the ConfigMap and adds the key in a single server-side apply
- **AND** returns HTTP 201

### Requirement: Marketplace items aggregator endpoint

ark-api SHALL expose `GET /api/v1/namespaces/{namespace}/marketplace-items` returning marketplace items aggregated across every source in the namespace's `marketplace-sources` ConfigMap that the requesting user can read. Each source's `marketplace.json` is fetched server-side and cached for 1 hour, keyed on `(namespace, source-name, url)`.

The response SHALL be a JSON array with one entry per source in the grouped shape:

```jsonc
{ "source": "<key in ConfigMap data>", "displayName": "<value.displayName | source>", "items": [ /* ... */ ] }
{ "source": "<key>", "displayName": "<...>", "error": { "message": "<...>", "code": "<...>" } }
```

`error.code` SHALL be one of: `fetch_timeout`, `aggregator_timeout`, `http_error`, `parse_error`, `network_error`. The endpoint SHALL return HTTP 200 even when every source fails — per-source state is conveyed by the entry shape.

#### Scenario: All sources reachable
- **WHEN** every source in the namespace's `marketplace-sources` ConfigMap returns a valid `marketplace.json`
- **AND** the user calls `GET /api/v1/namespaces/team-a/marketplace-items`
- **THEN** ark-api returns HTTP 200 with one entry per source, each containing `source`, `displayName`, and `items`

#### Scenario: One source unreachable
- **WHEN** one source URL returns HTTP 404 while others succeed
- **THEN** ark-api returns HTTP 200
- **AND** the failed source entry contains an `error` field with `code: "http_error"`
- **AND** other sources return their items normally

#### Scenario: User cannot read ConfigMap
- **WHEN** a user without `get` on `configmaps/marketplace-sources` calls `GET /api/v1/namespaces/team-a/marketplace-items`
- **THEN** ark-api returns HTTP 403

### Requirement: Aggregator timeout guards

The aggregator endpoint SHALL enforce two independent timeouts: per-source HTTP fetch ≤ **10 seconds** and aggregator total wall-clock ≤ **30 seconds**. Sources exceeding the per-source budget SHALL return `error.code: "fetch_timeout"`. Sources still in-flight when the aggregator budget expires SHALL return `error.code: "aggregator_timeout"`. The endpoint SHALL return HTTP 200 in both cases.

#### Scenario: Slow source times out individually
- **WHEN** one source takes 15s to respond and two others return within 1s
- **THEN** the slow source returns `error.code: "fetch_timeout"`
- **AND** the other two sources return their items in the same HTTP 200 response

#### Scenario: Aggregator total budget exhausted
- **WHEN** more sources are pending than the 30s aggregator budget allows
- **THEN** sources completing within 30s return their items
- **AND** still-pending sources return `error.code: "aggregator_timeout"`
- **AND** the response is HTTP 200

### Requirement: Marketplace permission probe endpoint

ark-api SHALL expose `GET /api/v1/namespaces/{namespace}/marketplace-sources/permissions` issuing a `SelfSubjectAccessReview` for verb `update` on `configmaps` with `resourceName: "marketplace-sources"` and returning `{"canEdit": <bool>}`. If the SSAR call itself fails (e.g. ark-api ServiceAccount lacks `create selfsubjectaccessreviews`, kube-apiserver 5xx), the endpoint SHALL fail closed — return HTTP 200 with `{"canEdit": false}` and log the underlying error. The dashboard SHALL never see a 5xx from this endpoint.

#### Scenario: User can edit
- **WHEN** user `alice` (bound to `marketplace-source-editor` in `team-a`) calls `GET /api/v1/namespaces/team-a/marketplace-sources/permissions`
- **THEN** ark-api returns `{"canEdit": true}`

#### Scenario: User cannot edit
- **WHEN** user `bob` (no edit binding) calls the same endpoint
- **THEN** ark-api returns `{"canEdit": false}`

#### Scenario: SSAR call itself fails — fail closed
- **WHEN** the SSAR call to kube-apiserver fails (e.g. ark-api SA missing `create selfsubjectaccessreviews`, or kube-apiserver returns 5xx)
- **THEN** ark-api returns HTTP 200 with `{"canEdit": false}`
- **AND** the underlying error is logged at warn level

### Requirement: Helm-seeded default sources

The Ark Helm chart SHALL accept a `marketplaceSources` values key, a list of objects with `name`, `url`, optional `displayName`, and optional `namespace` fields. At install and upgrade time, the chart SHALL apply each entry as a key in the `marketplace-sources` ConfigMap of the entry's `namespace` (defaulting to the install namespace when `namespace` is omitted) using server-side apply with the field manager `helm-marketplace-seeder`. Helm upgrades SHALL NOT revert user edits to keys whose ownership has transferred to another field manager.

The default `marketplaceSources` value SHALL contain a single entry pointing at the canonical `mckinsey/agents-at-scale-marketplace` URL, replacing the hard-coded default formerly in `services/ark-dashboard/ark-dashboard/atoms/marketplace-sources.ts`.

#### Scenario: Default install
- **WHEN** an operator runs `helm install ark` with default values
- **THEN** the `marketplace-sources` ConfigMap exists in the install namespace with one key `agents-at-scale-marketplace` whose JSON value contains the canonical URL

#### Scenario: Helm upgrade preserves user edits
- **WHEN** an operator manually patches a Helm-seeded source entry to change its `displayName` (transferring ownership of that key to another field manager)
- **AND** subsequently runs `helm upgrade` with the same values
- **THEN** the user's `displayName` edit is preserved
- **AND** keys still owned by the `helm-marketplace-seeder` field manager are reconciled to chart values

#### Scenario: Custom seed in install namespace
- **WHEN** an operator runs `helm install ark --set 'marketplaceSources[0].name=internal' --set 'marketplaceSources[0].url=https://example.com/marketplace.json'`
- **THEN** the `marketplace-sources` ConfigMap in the install namespace contains a key `internal` pointing at the custom URL

#### Scenario: Multi-namespace seeding from one install
- **WHEN** an operator installs with `marketplaceSources` containing entries in `team-a` and `team-b` (different `namespace` values per entry)
- **THEN** each namespace receives a `marketplace-sources` ConfigMap with the namespace's entries
- **AND** namespaces not referenced by any entry receive no ConfigMaps from the chart

### Requirement: Dashboard reads sources from cluster

The dashboard SHALL load marketplace source data from ark-api via the CRUD and items endpoints. The dashboard SHALL NOT persist the source list in `localStorage` and SHALL NOT carry an `X-Marketplace-Sources` HTTP header on any outbound request. The Next.js route at `services/ark-dashboard/ark-dashboard/app/api/marketplace/route.ts` SHALL be removed.

When the user switches the active namespace, the dashboard SHALL refetch the source list and items for the new namespace.

#### Scenario: Dashboard fetches sources on load
- **WHEN** an authenticated user opens the marketplace page in namespace `team-a`
- **THEN** the dashboard issues `GET /api/v1/namespaces/team-a/marketplace-sources` against ark-api
- **AND** renders items returned by `GET /api/v1/namespaces/team-a/marketplace-items`

#### Scenario: Namespace switch reloads
- **WHEN** the user switches the active namespace from `team-a` to `team-b`
- **THEN** the dashboard refetches both source list and items for `team-b`
- **AND** stops displaying any data scoped to `team-a`

#### Scenario: No legacy header sent
- **WHEN** the dashboard issues any request to ark-api
- **THEN** the request SHALL NOT include an `X-Marketplace-Sources` header

### Requirement: RBAC-aware Manage Marketplace UI

The dashboard's Manage Marketplace settings page SHALL render add / edit / delete controls only when the requesting user has edit permission, as reported by the permission probe endpoint. Without edit permission, the page SHALL display the source list as a read-only view.

#### Scenario: Editor sees controls
- **WHEN** the permission probe returns `{"canEdit": true}` for the active namespace
- **THEN** the Manage Marketplace page renders add / edit / delete controls

#### Scenario: Reader sees read-only view
- **WHEN** the permission probe returns `{"canEdit": false}` for the active namespace
- **THEN** the Manage Marketplace page renders the source list with no add / edit / delete controls

### Requirement: Silent localStorage migration

On first dashboard load after the upgrade, if a `marketplace-sources` key exists in `localStorage`, the dashboard SHALL remove the key without uploading its contents to the cluster. The dashboard SHALL NOT prompt the user about the discarded data.

#### Scenario: Legacy localStorage entry on upgrade
- **WHEN** a user with a pre-upgrade `marketplace-sources` `localStorage` entry opens the dashboard for the first time after the upgrade
- **THEN** the `marketplace-sources` key is removed from `localStorage`
- **AND** no entries are written to the cluster as a result of the read
- **AND** the user sees no migration prompt or notification
