## Why

The ark-api chart currently bundles an optional ClusterRole (`rbac.clusterWide: true`) that grants full CRUD on Ark resources across all namespaces. A misconfiguration could accidentally give a single tenant cluster-wide write access. Multi-namespace access should be an explicit, separate admin operation — never something that ships inside the tenant's own chart. We need sample manifests and documentation so operators can grant namespace access at the right level without touching the ark-api chart.

## What Changes

- **Add `samples/multi-namespace/` directory** with four RBAC manifest files covering escalating levels of namespace access:

  | Manifest | Purpose |
  |----------|---------|
  | `01-namespace-reader.yaml` | Grant a tenant the ability to list namespaces (discovery only). Without this, the API/dashboard gracefully shows only the tenant's own context namespace. |
  | `02-specific-namespaces.yaml` | Grant a tenant Ark resource access in an explicit list of additional namespaces (project switching). |
  | `03-namespace-label-selector.yaml` | Grant a tenant access to namespaces matching a label selector (e.g., `ark.mckinsey.com/tenant: team-alpha`). New namespaces auto-discovered when labelled. |
  | `04-full-admin.yaml` | Grant a tenant full cluster-wide namespace access including creation. For platform admins only. |

  All four are pure RBAC manifests — no code changes, just `ClusterRole`, `Role`, `RoleBinding`, and `ClusterRoleBinding` resources.

- **Add a docs page** at `docs/content/operations-guide/tenant-namespace-management.mdx` covering:
  - Default behaviour (single namespace, no ClusterRole needed)
  - A table linking each sample manifest with its use case
  - When to use each tier
  - A note that the ark-api chart itself should never be deployed with `clusterWide: true` in production

- **Remove the ClusterRole from the ark-api chart** — delete the `rbac.clusterWide` toggle and all ClusterRole/ClusterRoleBinding resources from `services/ark-api/chart/templates/rbac.yaml`. Remove `clusterWide: true` from `services/ark-api/chart/values.yaml`. **BREAKING** for anyone currently setting `rbac.clusterWide: true`.

- **Update `devspace.yaml`** — remove `rbac.clusterWide: true` from `services/ark-api/devspace.yaml`. On minikube the service account already inherits cluster-admin permissions, so no special chart config is needed for local dev.

- **Add graceful fallback in `list_namespaces()` API** — when the service account lacks permission to list namespaces (403), return only the current context namespace instead of erroring. This means the default single-tenant experience works without any RBAC changes.

- **Remove `create_namespace()` from the default API** — or gate it behind the same permission check. Namespace creation is a cluster-admin operation; it should only succeed when the service account has explicit permission.

## Capabilities

### New Capabilities
- `multi-namespace-rbac`: Sample RBAC manifests and documentation for granting tenants escalating levels of cross-namespace access.

### Modified Capabilities
- `ark-api-rbac`: Remove ClusterRole from the ark-api Helm chart. Add graceful 403 fallback to namespace listing. Gate namespace creation behind permission check.

## Impact

- **ark-api chart** (`services/ark-api/chart/`): `rbac.yaml` and `values.yaml` modified. Breaking change for anyone using `rbac.clusterWide: true`.
- **ark-api Python code** (`services/ark-api/ark-api/src/ark_api/api/v1/namespaces.py`): `list_namespaces()` and `create_namespace()` modified.
- **ark-api devspace** (`services/ark-api/devspace.yaml`): Remove `clusterWide` override.
- **samples directory**: New `samples/multi-namespace/` folder with four manifest files.
- **docs**: New page in operations guide under tenant management.
- **Dashboard**: No changes needed — it already passes `?namespace=X` and gracefully shows whatever the API returns.
