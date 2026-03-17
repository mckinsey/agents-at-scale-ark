## ADDED Requirements

### Requirement: Namespace reader sample manifest
The repository SHALL include a sample manifest at `samples/tenant-management/01-namespace-reader.yaml` that grants a tenant service account the ability to list Kubernetes namespaces.

The manifest SHALL contain:
- A `ClusterRole` with `get` and `list` verbs on the `namespaces` resource in the core API group
- A `ClusterRoleBinding` binding the ClusterRole to a configurable service account name and namespace
- Comments explaining what to change (service account name, namespace)
- A comment noting that without this manifest, the API and dashboard still work but only show the tenant's own context namespace

#### Scenario: Tenant applies namespace reader
- **WHEN** an operator applies `01-namespace-reader.yaml` with the tenant's service account details
- **THEN** the ark-api `GET /api/v1/namespaces` endpoint returns all namespaces visible to the service account
- **AND** the dashboard namespace dropdown shows the discovered namespaces

#### Scenario: Tenant without namespace reader
- **WHEN** no namespace reader ClusterRole is applied
- **THEN** the ark-api `GET /api/v1/namespaces` endpoint returns only the tenant's own context namespace
- **AND** the dashboard namespace dropdown shows only the current namespace

### Requirement: Specific namespaces sample manifest
The repository SHALL include a sample manifest at `samples/tenant-management/02-specific-namespaces.yaml` that grants a tenant service account Ark resource access in explicitly named namespaces.

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
The repository SHALL include a sample manifest at `samples/tenant-management/03-namespace-label-selector.yaml` that demonstrates granting access to namespaces matching a label convention.

The manifest SHALL contain:
- A `RoleBinding` template that references the existing `ark-tenant-role` ClusterRole
- Namespace labels (e.g., `ark.mckinsey.com/tenant: team-alpha`) as the convention for grouping
- Comments explaining that the admin applies a RoleBinding in each labelled namespace
- A comment noting this is an operator convention, not auto-enforced by Kubernetes RBAC

#### Scenario: Tenant accesses labelled namespace
- **WHEN** an operator labels namespace `finance` with `ark.mckinsey.com/tenant: team-alpha`
- **AND** applies the RoleBinding from `03-namespace-label-selector.yaml` in namespace `finance`
- **THEN** the tenant service account can access Ark resources in namespace `finance`

#### Scenario: New namespace added by label convention
- **WHEN** an operator creates namespace `analytics` with label `ark.mckinsey.com/tenant: team-alpha`
- **AND** applies the RoleBinding from the sample in namespace `analytics`
- **AND** the namespace reader manifest (tier 1) is also applied
- **THEN** the tenant sees `analytics` in the namespace list

### Requirement: Full admin sample manifest
The repository SHALL include a sample manifest at `samples/tenant-management/04-full-admin.yaml` that grants a tenant full cluster-wide Ark access including namespace creation.

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

### Requirement: Tenant namespace management documentation
The documentation SHALL include a page at `docs/content/operations-guide/tenant-namespace-management.mdx` that opens with:

1. A simple ASCII or Mermaid diagram showing the tenant isolation model:
   - A cluster containing multiple isolated tenants (namespaces)
   - A cluster administrator who manages tenants
   - Visual separation between tenants to convey isolation
2. A brief explanation that:
   - Tenants are the fundamental isolation unit in Ark — each tenant is a Kubernetes namespace
   - Tenants can represent projects, teams, or environments
   - By default tenants are fully isolated from each other
   - Cluster administrators manage tenants and can grant cross-namespace access via RBAC
   - More empowered tenants (e.g., those that can see multiple namespaces) are created by the cluster administrator applying additional RBAC manifests

The page SHALL then continue with:
- Default single-namespace behaviour (no ClusterRole needed)
- A table with columns for manifest name, description, and link to the sample file in the repository
- When to use each tier
- A note that the ark-api chart itself should never be deployed with cluster-wide permissions in production
- The "Setting Up Tenant Namespaces" and "Using the Tenant Service Account" content currently in `deploying-ark.mdx`

The `deploying-ark.mdx` page SHALL be updated to replace the moved sections with a brief note and link to the new tenant management page.

The `_meta.js` SHALL include the new page under the "Platform operations" separator.

#### Scenario: Operator reads documentation
- **WHEN** an operator navigates to the operations guide
- **THEN** they find a "Tenant Namespace Management" page under "Platform operations"
- **AND** the page opens with a diagram showing isolated tenants in a cluster
- **AND** the page contains a table linking all four sample manifests with descriptions

#### Scenario: Deploying Ark page cross-links
- **WHEN** an operator reads the deploying Ark page
- **THEN** the tenant namespace section contains a link to the tenant management page
- **AND** the detailed setup instructions are on the tenant management page, not duplicated

### Requirement: Dashboard namespace dropdown
The dashboard sidebar SHALL include a namespace dropdown in the header area that allows users to switch between available namespaces.

The dropdown SHALL:
- Fetch the list of available namespaces from `GET /api/v1/namespaces` on mount
- Display the current namespace as the selected value
- Allow the user to select a different namespace, which updates the `?namespace=X` query parameter
- Show a "Create Namespace" option when the context API reports `capabilities.can_create_namespace` is true
- When only one namespace is available, show the dropdown with that single option

The `NamespaceProvider` SHALL be updated to fetch available namespaces from the API (using the existing `useGetAllNamespaces` hook) instead of the current hardcoded single-item array.

#### Scenario: Single namespace tenant
- **WHEN** the tenant has no namespace reader ClusterRole
- **THEN** the dropdown shows only the current context namespace
- **AND** no "Create Namespace" option is shown

#### Scenario: Multi-namespace tenant
- **WHEN** the tenant has a namespace reader ClusterRole and access to namespaces `default`, `project-a`, `project-b`
- **THEN** the dropdown shows all three namespaces
- **AND** selecting `project-a` navigates to the same page with `?namespace=project-a`

#### Scenario: Admin with create permission
- **WHEN** the context API returns `capabilities.can_create_namespace: true`
- **THEN** the dropdown includes a "Create Namespace" option
- **AND** clicking it opens the existing `NamespaceEditor` dialog
