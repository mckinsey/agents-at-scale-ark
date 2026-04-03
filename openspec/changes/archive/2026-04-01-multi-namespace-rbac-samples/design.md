## Context

Each Ark tenant is deployed into its own Kubernetes namespace via the `ark-tenant` Helm chart. The ark-api service runs with a namespace-scoped `Role` and `RoleBinding`, giving it access only to resources in its own namespace. The API already accepts a `?namespace=X` query parameter on all resource endpoints.

Currently, the ark-api chart includes an optional `rbac.clusterWide: true` toggle that creates a `ClusterRole` granting full CRUD on Ark resources across all namespaces. This is bundled inside the tenant's own chart, meaning a single misconfiguration gives a tenant cluster-wide write access. The `devspace.yaml` for local development sets this to `true` by default.

The `list_namespaces()` API endpoint calls `v1.list_namespace()` (a cluster-scoped Kubernetes API) and returns a hard error when the service account lacks cluster permissions. The `create_namespace()` endpoint can create arbitrary Kubernetes namespaces — this is fine, but should be documented as requiring explicit permission.

The dashboard sidebar currently shows the namespace as static text. There is no UI to switch between namespaces.

Existing docs have tenant setup content split across `deploying-ark.mdx` (Setting Up Tenant Namespaces, Using the Tenant Service Account) and `authentication.mdx` (API Key Namespace Scoping). The tenant setup content should be consolidated into a dedicated page.

## Goals / Non-Goals

**Goals:**
- Provide sample RBAC manifests in `samples/tenant-management/` for four tiers of namespace access
- Consolidate tenant management docs into a dedicated operations guide page
- Remove the ClusterRole from the ark-api chart so tenants can never accidentally get cluster-wide access from their own deployment
- Make `list_namespaces()` gracefully return the context namespace when cluster permissions are unavailable
- Extend `GET /api/v1/context` to report whether the service account can create namespaces
- Add a namespace dropdown to the dashboard sidebar for switching between available namespaces

**Non-Goals:**
- Building a Helm chart or CLI for applying these RBAC manifests (samples are `kubectl apply` only)
- Multi-cluster support
- Automating RoleBinding creation based on namespace labels (convention only, documented)
- Changing how the ark-api handles the `?namespace=X` parameter on resource endpoints (already works)

## Decisions

### 1. Sample manifests over a Helm chart

Provide raw YAML manifests in `samples/tenant-management/` rather than a Helm chart.

**Rationale:** RBAC grants are a one-shot admin operation. Raw manifests are transparent, auditable, and require no additional tooling. Operators can see exactly what permissions are being granted. A Helm chart can be added later if there's demand.

**Alternative considered:** Small Helm chart with a values file listing target namespaces. Rejected because it adds complexity for what is typically a one-time operation, and obscures the actual RBAC resources being created.

### 2. Four tiers of access

Structure the samples as four escalating tiers rather than a single configurable manifest.

| Tier | Manifest | What it grants |
|------|----------|---------------|
| 1 | `01-namespace-reader.yaml` | `ClusterRole` + `ClusterRoleBinding` granting only `get, list` on namespaces. Enables namespace discovery in dashboard. |
| 2 | `02-specific-namespaces.yaml` | `RoleBinding` in each target namespace referencing the existing `ark-tenant-role` ClusterRole. Grants Ark resource access in named namespaces. |
| 3 | `03-namespace-label-selector.yaml` | Same as tier 2 but uses namespace labels as a convention. The admin applies a RoleBinding in each labelled namespace. |
| 4 | `04-full-admin.yaml` | `ClusterRole` + `ClusterRoleBinding` granting full Ark access across all namespaces plus namespace creation. Platform admin only. |

**Rationale:** Each tier is independently applicable. An operator can apply tier 1 alone (discovery), or tier 1 + tier 2 (discovery + specific access). Clear escalation path.

**Note on tier 3:** Kubernetes RBAC does not natively support label-based namespace scoping on Roles/RoleBindings. The manifest demonstrates the pattern using namespace labels as a convention — the admin applies a RoleBinding in each labelled namespace. The docs note this is a convention enforced by the operator, not by Kubernetes itself.

### 3. Graceful 403 fallback in list_namespaces()

Catch `ApiException` with status 403 in the `list_namespaces()` endpoint and return only the current context namespace.

**Rationale:** This makes the default single-tenant experience work without any RBAC changes. The dashboard calls this endpoint to populate the namespace switcher; returning one namespace means it shows just the tenant's own namespace. When a ClusterRole is added (tier 1+), the endpoint returns whatever namespaces the service account can see.

### 4. Remove ClusterRole from ark-api chart entirely

Delete the `{{- if .Values.rbac.clusterWide }}` block from `rbac.yaml` and the `rbac.clusterWide` key from `values.yaml`.

**Rationale:** The ark-api chart should never ship with the ability to grant itself cluster-wide permissions. Multi-namespace access is a separate admin concern. For local development on minikube, the service account inherits the cluster-admin permissions of the minikube user, so the `list_namespace()` call succeeds naturally.

**Alternative considered:** Keep the toggle but default to `false`. Rejected because even having the option in the chart creates risk — it's one `--set rbac.clusterWide=true` away from a security issue.

### 5. Capabilities in the context response

Extend `GET /api/v1/context` to return a `capabilities` object:

```json
{
  "namespace": "default",
  "cluster": "minikube",
  "read_only_mode": false,
  "capabilities": {
    "can_create_namespace": true
  }
}
```

The API checks whether the service account has `create` permission on namespaces using a Kubernetes `SelfSubjectAccessReview` (or a try/catch on a dry-run create). This is better than checking in the `list_namespaces()` endpoint because the context endpoint is already the place the dashboard goes to understand "what can I do?".

**Rationale:** The dashboard needs to know whether to show the "Create Namespace" button. Rather than attempting a create and handling the error, the context response tells the dashboard up front what's available. This is a read-only permission check, not an action.

### 6. Dashboard namespace dropdown

Replace the static namespace text in the sidebar header (currently lines 256-273 of `app-sidebar.tsx`) with a dropdown/select that:

1. On mount, calls `GET /api/v1/namespaces` to get the list of available namespaces
2. Shows a dropdown with the current namespace selected
3. On selection, updates `?namespace=X` via the existing `setNamespace()` from `NamespaceProvider`
4. Shows a "Create Namespace" option at the bottom when `capabilities.can_create_namespace` is true (opens the existing `NamespaceEditor`)
5. When only one namespace is available, still shows the dropdown but with just one option (consistent UI)

The `NamespaceProvider` will be updated to actually call `namespacesService.getAll()` (the `useGetAllNamespaces` hook already exists but is unused) and populate `availableNamespaces` from the API response instead of the current hardcoded single-item array.

### 7. Documentation consolidation

Create a new page at `docs/content/operations-guide/tenant-namespace-management.mdx` that:

- Moves the "Setting Up Tenant Namespaces" and "Using the Tenant Service Account" sections from `deploying-ark.mdx`
- Adds the multi-namespace access tiers with a table linking to each sample manifest
- Leaves a brief note + link in `deploying-ark.mdx` pointing to the new page
- Does NOT move the API Key Namespace Scoping section from `authentication.mdx` (it's correctly in the auth context, but should cross-link)

Add the page to `_meta.js` under the "Platform operations" separator, after "Deploying ARK".

## Risks / Trade-offs

**Breaking change for `rbac.clusterWide` users** → Document in release notes. Migration path: apply `04-full-admin.yaml` sample to restore equivalent permissions externally.

**Tier 3 (label-based) is a convention, not enforced by Kubernetes** → Clearly document that the admin must apply RoleBindings to matching namespaces. Kubernetes RBAC doesn't auto-bind based on namespace labels. Future work could automate this with an operator.

**SelfSubjectAccessReview may not be available in all clusters** → Fall back to `can_create_namespace: false` if the check fails. This is the safe default.

**Local dev on non-minikube clusters** → If a developer uses a cluster where their service account doesn't have cluster-admin, `list_namespaces()` will gracefully return just their namespace. This is correct behaviour, not a bug.
