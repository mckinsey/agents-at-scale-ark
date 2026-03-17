## ADDED Requirements

### Requirement: Namespace reader sample manifest
The repository SHALL include a sample manifest at `samples/multi-namespace/01-namespace-reader.yaml` that grants a tenant service account the ability to list Kubernetes namespaces.

The manifest SHALL contain:
- A `ClusterRole` with `get` and `list` verbs on the `namespaces` resource in the core API group
- A `ClusterRoleBinding` binding the ClusterRole to a configurable service account name and namespace
- Comments explaining what to change (service account name, namespace)

#### Scenario: Tenant applies namespace reader
- **WHEN** an operator applies `01-namespace-reader.yaml` with the tenant's service account details
- **THEN** the ark-api `GET /api/v1/namespaces` endpoint returns all namespaces visible to the service account
- **AND** the dashboard namespace switcher shows the discovered namespaces

#### Scenario: Tenant without namespace reader
- **WHEN** no namespace reader ClusterRole is applied
- **THEN** the ark-api `GET /api/v1/namespaces` endpoint returns only the tenant's own context namespace
- **AND** the dashboard namespace switcher shows only the current namespace

### Requirement: Specific namespaces sample manifest
The repository SHALL include a sample manifest at `samples/multi-namespace/02-specific-namespaces.yaml` that grants a tenant service account Ark resource access in explicitly named namespaces.

The manifest SHALL contain:
- A `RoleBinding` in each target namespace referencing the existing `ark-tenant-role` ClusterRole
- The `subjects` field referencing the tenant's service account from its home namespace
- Comments explaining how to add or remove target namespaces

#### Scenario: Tenant accesses resources in granted namespace
- **WHEN** an operator applies `02-specific-namespaces.yaml` granting access to namespace `project-b`
- **AND** the tenant calls `GET /api/v1/agents?namespace=project-b`
- **THEN** the API returns agents from namespace `project-b`

#### Scenario: Tenant cannot access resources in non-granted namespace
- **WHEN** `02-specific-namespaces.yaml` grants access to `project-b` only
- **AND** the tenant calls `GET /api/v1/agents?namespace=project-c`
- **THEN** the API returns a 403 error

### Requirement: Label-based namespace sample manifest
The repository SHALL include a sample manifest at `samples/multi-namespace/03-namespace-label-selector.yaml` that demonstrates granting access to namespaces matching a label convention.

The manifest SHALL contain:
- A `RoleBinding` template that references the existing `ark-tenant-role` ClusterRole
- Namespace labels (e.g., `ark.mckinsey.com/tenant: team-alpha`) as the convention for grouping
- Comments explaining that the admin applies a RoleBinding in each labelled namespace and that this is an operator convention, not auto-enforced by Kubernetes RBAC

#### Scenario: Tenant accesses labelled namespace
- **WHEN** an operator labels namespace `finance` with `ark.mckinsey.com/tenant: team-alpha`
- **AND** applies the RoleBinding from `03-namespace-label-selector.yaml` in namespace `finance`
- **THEN** the tenant service account can access Ark resources in namespace `finance`

#### Scenario: New namespace added by label convention
- **WHEN** an operator creates namespace `analytics` with label `ark.mckinsey.com/tenant: team-alpha`
- **AND** applies the RoleBinding from the sample in namespace `analytics`
- **THEN** the tenant automatically sees `analytics` in the namespace list (if tier 1 is also applied)

### Requirement: Full admin sample manifest
The repository SHALL include a sample manifest at `samples/multi-namespace/04-full-admin.yaml` that grants a tenant full cluster-wide Ark access including namespace creation.

The manifest SHALL contain:
- A `ClusterRole` granting `get`, `list`, `create` on `namespaces`
- A `ClusterRole` granting full CRUD on all Ark CRD resources (`ark.mckinsey.com` API group) across all namespaces
- A `ClusterRoleBinding` binding both to the tenant service account
- Comments warning this is for platform admins only

#### Scenario: Admin creates namespace via API
- **WHEN** the full admin manifest is applied
- **AND** the tenant calls `POST /api/v1/namespaces` with `{"name": "new-project"}`
- **THEN** the namespace is created successfully

#### Scenario: Admin lists all namespaces
- **WHEN** the full admin manifest is applied
- **THEN** `GET /api/v1/namespaces` returns all namespaces in the cluster

### Requirement: Documentation page for tenant namespace management
The documentation SHALL include a page at `docs/content/operations-guide/tenant-namespace-management.mdx` that:
- Explains the default single-namespace behaviour (no ClusterRole needed)
- Presents a table with columns for manifest name, description, and link to the sample file
- Describes when to use each tier
- Notes that the ark-api chart itself should never be deployed with cluster-wide permissions in production

#### Scenario: Operator reads documentation
- **WHEN** an operator navigates to the operations guide
- **THEN** they find a "Tenant Namespace Management" page under "Platform operations"
- **AND** the page contains a table linking all four sample manifests with descriptions
