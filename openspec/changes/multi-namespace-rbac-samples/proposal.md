## Why

The ark-api chart currently bundles an optional ClusterRole (`rbac.clusterWide: true`) that grants full CRUD on Ark resources across all namespaces. A misconfiguration could accidentally give a single tenant cluster-wide write access. Multi-namespace access should be an explicit, separate admin operation — never something that ships inside the tenant's own chart. We need sample manifests, documentation, and a dashboard namespace switcher so operators can grant namespace access at the right level and users can switch between namespaces they have access to.

## What Changes

- **Add `samples/tenant-management/` directory** with four RBAC manifest files covering escalating levels of namespace access:

  | Manifest | Purpose |
  |----------|---------|
  | `01-namespace-reader.yaml` | Grant a tenant the ability to list namespaces (discovery only). Without this, the API/dashboard gracefully shows only the tenant's own context namespace. |
  | `02-specific-namespaces.yaml` | Grant a tenant Ark resource access in an explicit list of additional namespaces (project switching). |
  | `03-namespace-label-selector.yaml` | Grant a tenant access to namespaces matching a label convention (e.g., `ark.mckinsey.com/tenant: team-alpha`). New namespaces discovered when labelled and RoleBinding applied. |
  | `04-full-admin.yaml` | Grant a tenant full cluster-wide namespace access including creation. For platform admins only. |

  All four are pure RBAC manifests — no code changes, just `ClusterRole`, `Role`, `RoleBinding`, and `ClusterRoleBinding` resources.

- **Add a docs page** at `docs/content/operations-guide/tenant-namespace-management.mdx` covering:
  - Default behaviour (single namespace, no ClusterRole needed)
  - A table linking each sample manifest with its use case
  - When to use each tier
  - A note that the ark-api chart itself should never be deployed with `clusterWide: true` in production
  - Move the "Setting Up Tenant Namespaces" and "Using the Tenant Service Account" sections from `deploying-ark.mdx` into this page (leaving a cross-link in deploying-ark)

- **Remove the ClusterRole from the ark-api chart** — delete the `rbac.clusterWide` toggle and all ClusterRole/ClusterRoleBinding resources from `services/ark-api/chart/templates/rbac.yaml`. Remove `clusterWide: true` from `services/ark-api/chart/values.yaml`. **BREAKING** for anyone currently setting `rbac.clusterWide: true`.

- **Update `devspace.yaml`** — remove `rbac.clusterWide: true` from `services/ark-api/devspace.yaml`. On minikube the service account already inherits cluster-admin permissions, so no special chart config is needed for local dev.

- **Add graceful fallback in `list_namespaces()` API** — when the service account lacks permission to list namespaces (403), return only the current context namespace instead of erroring. This means the default single-tenant experience works without any RBAC changes.

- **Keep `create_namespace()` in the API** — it will naturally succeed or fail based on the service account's Kubernetes permissions. Document that it requires explicit namespace creation permission (tier 4).

- **Extend `GET /api/v1/context` response** — add a `capabilities` object to the `ContextResponse` that includes `can_create_namespace: bool`. The API checks whether the service account has permission to create namespaces (via a Kubernetes SelfSubjectAccessReview or similar). This allows the dashboard to show/hide the "Create Namespace" UI based on actual permissions.

- **Add namespace dropdown to the dashboard sidebar** — replace the static namespace text in the sidebar header with a dropdown that:
  - Fetches available namespaces from `GET /api/v1/namespaces`
  - Allows switching between namespaces (updates `?namespace=X` query param)
  - Shows a "Create Namespace" option when `context.capabilities.can_create_namespace` is true
  - Falls back to showing only the current namespace when only one is available

## Capabilities

### New Capabilities
- `tenant-management`: Sample RBAC manifests, documentation for granting tenants escalating levels of cross-namespace access, and dashboard namespace switcher.

### Modified Capabilities
- `ark-api-rbac`: Remove ClusterRole from the ark-api Helm chart. Add graceful 403 fallback to namespace listing. Add capabilities to context response.

## Impact

- **ark-api chart** (`services/ark-api/chart/`): `rbac.yaml` and `values.yaml` modified. Breaking change for anyone using `rbac.clusterWide: true`.
- **ark-api Python code** (`services/ark-api/ark-api/src/ark_api/api/v1/namespaces.py`): `list_namespaces()` modified with 403 fallback.
- **ark-api Python code** (`services/ark-api/ark-api/src/ark_api/models/context.py`): `ContextResponse` extended with `capabilities`.
- **ark-api devspace** (`services/ark-api/devspace.yaml`): Remove `clusterWide` override.
- **samples directory**: New `samples/tenant-management/` folder with four manifest files.
- **docs**: New tenant management page in operations guide. Content moved from `deploying-ark.mdx`.
- **Dashboard sidebar** (`services/ark-dashboard/ark-dashboard/components/app-sidebar.tsx`): Namespace dropdown replacing static text.
- **Dashboard provider** (`services/ark-dashboard/ark-dashboard/providers/NamespaceProvider.tsx`): Fetch available namespaces from API.
