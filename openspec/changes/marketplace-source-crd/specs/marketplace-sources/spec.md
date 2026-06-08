## ADDED Requirements

### Requirement: MarketplaceSource CRD

The Ark API SHALL define a namespaced CRD named `MarketplaceSource` in the `ark.mckinsey.com/v1alpha1` API group. Each `MarketplaceSource` represents one URL pointing at a `marketplace.json` manifest.

The CRD spec SHALL include:

- `spec.url` (required, string) — the absolute URL of the `marketplace.json` manifest. SHALL match the regex `^https://` (HTTPS-only) at OpenAPI validation.
- `spec.displayName` (optional, string) — the user-facing label for the source. When omitted, consumers SHALL fall back to `metadata.name`.

The CRD SHALL NOT include a `status` subresource in `v1alpha1` (no controller reconciles `MarketplaceSource`). The CRD SHALL be cluster-scope-rejecting — attempts to create cluster-scoped instances are rejected by kube-apiserver.

#### Scenario: Create a valid MarketplaceSource
- **WHEN** an operator applies a `MarketplaceSource` with `spec.url: "https://example.com/marketplace.json"` in namespace `team-a`
- **THEN** kube-apiserver accepts the resource
- **AND** `kubectl get marketplacesources -n team-a` lists it

#### Scenario: Reject non-HTTPS URLs
- **WHEN** an operator applies a `MarketplaceSource` with `spec.url: "http://example.com/marketplace.json"`
- **THEN** kube-apiserver rejects the request with an OpenAPI validation error referencing the `^https://` pattern

#### Scenario: Reject missing url
- **WHEN** an operator applies a `MarketplaceSource` without `spec.url`
- **THEN** kube-apiserver rejects the request with a required-field validation error

### Requirement: URL well-formedness webhook

The Ark validating webhook SHALL reject `MarketplaceSource` resources whose `spec.url` is not a syntactically valid absolute URL, in addition to the OpenAPI HTTPS check.

#### Scenario: Reject malformed URL
- **WHEN** an operator applies a `MarketplaceSource` with `spec.url: "https://"`
- **THEN** the validating webhook rejects the request with a message identifying the malformed URL

#### Scenario: Accept well-formed URL
- **WHEN** an operator applies a `MarketplaceSource` with `spec.url: "https://raw.githubusercontent.com/org/repo/main/marketplace.json"`
- **THEN** the validating webhook accepts the request

### Requirement: Marketplace source RBAC role

The Ark install SHALL provide a `ClusterRole` named `marketplace-source-editor` granting `get`, `list`, `watch`, `create`, `update`, `patch`, and `delete` verbs on the `marketplacesources` resource in the `ark.mckinsey.com` API group. The default install SHALL NOT bind this role to any user or group — operators bind it per namespace.

The Ark install SHALL grant `get`, `list`, `watch` on `marketplacesources` to the existing dashboard tenant role(s) so every dashboard user can read the catalogue regardless of edit permission.

#### Scenario: Editor binding allows write
- **WHEN** an operator binds `marketplace-source-editor` to user `alice` in namespace `team-a` via a `RoleBinding`
- **AND** `alice` calls `POST /api/v1/namespaces/team-a/marketplace-sources` with a valid body
- **THEN** the request succeeds and the resource is created

#### Scenario: No binding denies write
- **WHEN** user `bob` is not bound to `marketplace-source-editor` in namespace `team-a`
- **AND** `bob` calls `POST /api/v1/namespaces/team-a/marketplace-sources`
- **THEN** the request fails with HTTP 403

#### Scenario: Read access by default
- **WHEN** user `bob` (no editor binding) calls `GET /api/v1/namespaces/team-a/marketplace-sources`
- **THEN** the request succeeds and returns the list

### Requirement: Marketplace source CRUD endpoints

ark-api SHALL expose REST CRUD endpoints under `/api/v1/namespaces/{namespace}/marketplace-sources` covering list, get, create, update, and delete of `MarketplaceSource` resources. All operations SHALL execute under the requesting user's identity via the existing impersonation middleware. Errors from kube-apiserver SHALL be propagated to the caller with their original HTTP status (403, 404, 422).

#### Scenario: List sources
- **WHEN** an authenticated user calls `GET /api/v1/namespaces/team-a/marketplace-sources`
- **THEN** ark-api returns a JSON list containing every `MarketplaceSource` in `team-a` the user can read

#### Scenario: Create source
- **WHEN** an authenticated user with edit permission calls `POST /api/v1/namespaces/team-a/marketplace-sources` with body `{"name": "internal", "url": "https://example.com/marketplace.json", "displayName": "Internal"}`
- **THEN** ark-api creates the corresponding `MarketplaceSource` CR
- **AND** returns HTTP 201 with the created resource representation

#### Scenario: Delete source without permission
- **WHEN** an authenticated user without edit permission calls `DELETE /api/v1/namespaces/team-a/marketplace-sources/internal`
- **THEN** ark-api returns HTTP 403 with the kube-apiserver error message

### Requirement: Marketplace items aggregator endpoint

ark-api SHALL expose `GET /api/v1/namespaces/{namespace}/marketplace-items` returning the marketplace items aggregated across every `MarketplaceSource` the requesting user can read in that namespace. The endpoint SHALL fetch each source's `marketplace.json` server-side, with the same 1-hour cache semantics as the legacy dashboard route. Per-source fetch failures SHALL NOT fail the whole response — failed sources SHALL appear with an `error` field while successful sources return their items.

The response SHALL include the source identity for each entry so the dashboard can group items by source.

#### Scenario: All sources reachable
- **WHEN** the user calls `GET /api/v1/namespaces/team-a/marketplace-items`
- **AND** every `MarketplaceSource` in `team-a` returns a valid `marketplace.json`
- **THEN** ark-api returns HTTP 200 with all aggregated items grouped by source

#### Scenario: One source unreachable
- **WHEN** the user calls `GET /api/v1/namespaces/team-a/marketplace-items`
- **AND** one source URL returns HTTP 404 while others succeed
- **THEN** ark-api returns HTTP 200
- **AND** the failed source appears in the response with an `error` field
- **AND** all other sources return their items normally

#### Scenario: User cannot list sources
- **WHEN** a user without `list marketplacesources` permission calls `GET /api/v1/namespaces/team-a/marketplace-items`
- **THEN** ark-api returns HTTP 403

### Requirement: Marketplace permission probe endpoint

ark-api SHALL expose `GET /api/v1/namespaces/{namespace}/marketplace-sources/permissions` returning whether the requesting user has edit permission on `marketplacesources` in that namespace. The endpoint SHALL issue a `SelfSubjectAccessReview` for the verb `update` on resource `marketplacesources` and return `{"canEdit": <bool>}`.

#### Scenario: User can edit
- **WHEN** user `alice` (bound to `marketplace-source-editor` in `team-a`) calls `GET /api/v1/namespaces/team-a/marketplace-sources/permissions`
- **THEN** ark-api returns `{"canEdit": true}`

#### Scenario: User cannot edit
- **WHEN** user `bob` (no edit binding) calls the same endpoint
- **THEN** ark-api returns `{"canEdit": false}`

### Requirement: Helm-seeded default sources

The Ark Helm chart SHALL accept a `marketplaceSources` values key, a list of objects with `name`, `url`, optional `displayName`, and optional `namespace` fields. At install and upgrade time, the chart SHALL create one `MarketplaceSource` CR per entry in the entry's `namespace` (defaulting to the install namespace when `namespace` is omitted) using server-side apply with a dedicated field manager. Helm upgrades SHALL NOT revert user edits to fields the user owns under server-side apply semantics.

The default `marketplaceSources` value SHALL contain a single entry pointing at the canonical `mckinsey/agents-at-scale-marketplace` URL, replacing the hard-coded default formerly in `services/ark-dashboard/ark-dashboard/atoms/marketplace-sources.ts`.

#### Scenario: Default install
- **WHEN** an operator runs `helm install ark` with default values
- **THEN** one `MarketplaceSource` named `agents-at-scale-marketplace` exists in the install namespace pointing at the canonical URL

#### Scenario: Helm upgrade preserves user edits
- **WHEN** an operator manually patches a Helm-seeded `MarketplaceSource` to change `spec.displayName`
- **AND** subsequently runs `helm upgrade` with the same values
- **THEN** `spec.displayName` retains the user's edit
- **AND** fields owned by the Helm field manager are reconciled to chart values

#### Scenario: Custom seed in install namespace
- **WHEN** an operator runs `helm install ark --set 'marketplaceSources[0].name=internal' --set 'marketplaceSources[0].url=https://example.com/marketplace.json'`
- **THEN** a `MarketplaceSource` named `internal` exists in the install namespace pointing at the custom URL

#### Scenario: Multi-namespace seeding from one install
- **WHEN** an operator installs with `marketplaceSources` containing entries in `team-a` and `team-b` (different `namespace` values per entry)
- **THEN** each entry produces a `MarketplaceSource` CR in its specified namespace
- **AND** namespaces not referenced by any entry receive no CRs from the chart

### Requirement: Dashboard reads sources from cluster

The dashboard SHALL load `MarketplaceSource` data from ark-api via the CRUD and items endpoints. The dashboard SHALL NOT persist the source list in `localStorage` and SHALL NOT carry an `X-Marketplace-Sources` HTTP header on any outbound request. The Next.js route at `services/ark-dashboard/ark-dashboard/app/api/marketplace/route.ts` SHALL be removed.

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
