## ADDED Requirements

### Requirement: Generic resource update (PUT) endpoint

ark-api SHALL add a generic resource update endpoint to the existing resources passthrough, with `replace` semantics, in both the core path variant (`PUT /api/v1/resources/api/{version}/{kind}/{resource_name}`) and the grouped path variant (`PUT /api/v1/resources/apis/{group}/{version}/{kind}/{resource_name}`), mirroring the existing create/delete handlers. It SHALL honour the optional `?namespace=<ns>` query parameter the same way the existing handlers do, defaulting to the current context namespace when omitted, and execute under the requesting user's identity via the existing impersonation middleware. No argo-make-specific or author-agent-specific endpoint SHALL be added; Agent creation (Install) and template create/load reuse the existing passthrough (`POST` / `GET`).

#### Scenario: Replace an existing resource
- **WHEN** an authenticated user calls `PUT /api/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate/{name}` with a manifest body
- **THEN** ark-api replaces the named resource in place and returns the updated object

#### Scenario: Core and grouped variants both present
- **WHEN** the resources passthrough is inspected
- **THEN** it exposes a PUT handler for both the core (`/api/{version}/...`) and grouped (`/apis/{group}/{version}/...`) path forms

#### Scenario: No argo-make-specific endpoint
- **WHEN** ark-api's routes are inspected
- **THEN** there is no argo-make or author-agent specific endpoint; the author-agent manifest is bundled in the dashboard and Agent creation reuses the resources passthrough

### Requirement: Generic access-review endpoint

ark-api SHALL add a generic access-review endpoint that answers whether the requesting user may perform a given verb on a given resource in a given namespace, so the dashboard can gate write affordances before offering them. It SHALL create a Kubernetes `SelfSubjectAccessReview` under the requesting user's identity via the existing impersonation middleware — so the answer reflects the user's own RBAC, not the ark-api service account's — and return a minimal `{ "allowed": <bool> }` body. The endpoint SHALL accept `group`, `resource`, and `verb`, and SHALL honour the optional `?namespace=<ns>` query parameter the same way the resources passthrough does, defaulting to the current context namespace when omitted. No argo-make-specific or WorkflowTemplate-specific endpoint SHALL be added; the endpoint SHALL be generic over `group`/`resource`/`verb`.

When impersonation is disabled, the `SelfSubjectAccessReview` runs as the ark-api service account, so the result honestly reflects the effective identity the user's requests run as.

#### Scenario: Allowed write returns allowed true
- **WHEN** a user permitted to create `workflowtemplates` in namespace `team-a` calls the access-review endpoint with `group=argoproj.io`, `resource=workflowtemplates`, `verb=create`, `namespace=team-a`
- **THEN** ark-api creates a `SelfSubjectAccessReview` under that user's identity and returns `{ "allowed": true }`

#### Scenario: Denied write returns allowed false
- **WHEN** a user without permission to update `workflowtemplates` in namespace `team-a` calls the access-review endpoint with `verb=update` for that resource and namespace
- **THEN** ark-api returns `{ "allowed": false }`

#### Scenario: Namespace defaults to context namespace
- **WHEN** the access-review endpoint is called without a `?namespace=` parameter
- **THEN** the `SelfSubjectAccessReview` is scoped to the current context namespace

#### Scenario: Endpoint is generic, not WorkflowTemplate-specific
- **WHEN** ark-api's routes are inspected
- **THEN** the access-review endpoint is generic over `group`/`resource`/`verb` and there is no argo-make or WorkflowTemplate-specific access-review route

### Requirement: resourceVersion reconciliation on replace

Because a hand-edited or agent-regenerated `draftYaml` carries no usable `metadata.resourceVersion`, the update (PUT) handler SHALL reconcile the `resourceVersion` itself: it SHALL `get` the live object, copy its `metadata.resourceVersion` onto the submitted body, and then `replace`. A submitted body with no `resourceVersion` SHALL therefore succeed against an existing object rather than being rejected.

#### Scenario: Body without resourceVersion succeeds
- **WHEN** a PUT is issued with a body whose `metadata.resourceVersion` is absent
- **AND** the named resource already exists
- **THEN** the handler reads the live object, copies its `metadata.resourceVersion` onto the body, replaces the object, and returns the updated representation

#### Scenario: Last-write-wins on concurrent edit
- **WHEN** two clients save edits to the same template in sequence
- **THEN** each PUT reads the current `resourceVersion` and replaces, so the later save wins (no versioning is maintained for v1)
