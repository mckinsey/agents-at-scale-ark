## Context

Each Ark tenant is deployed into its own Kubernetes namespace via the `ark-tenant` Helm chart. The ark-api service runs with a namespace-scoped `Role` and `RoleBinding`, giving it access only to resources in its own namespace. The API already accepts a `?namespace=X` query parameter on all resource endpoints.

Currently, the ark-api chart includes an optional `rbac.clusterWide: true` toggle that creates a `ClusterRole` granting full CRUD on Ark resources across all namespaces. This is bundled inside the tenant's own chart, meaning a single misconfiguration gives a tenant cluster-wide write access. The `devspace.yaml` for local development sets this to `true` by default.

The `list_namespaces()` API endpoint calls `v1.list_namespace()` (a cluster-scoped Kubernetes API) and returns a hard 403 error when the service account lacks cluster permissions. The `create_namespace()` endpoint can create arbitrary Kubernetes namespaces.

## Goals / Non-Goals

**Goals:**
- Provide sample RBAC manifests for four tiers of namespace access (discovery, explicit list, label-based, full admin)
- Document when to use each tier under operations guide / tenant management
- Remove the ClusterRole from the ark-api chart so tenants can never accidentally get cluster-wide access from their own deployment
- Make `list_namespaces()` gracefully return the context namespace when cluster permissions are unavailable
- Gate `create_namespace()` so it only works when the service account has explicit permission

**Non-Goals:**
- Building a Helm chart or CLI for applying these RBAC manifests (samples are `kubectl apply` only)
- Changing how the dashboard tracks or switches namespaces (it already works via `?namespace=X`)
- Implementing namespace-level authorization in the ark-api beyond what Kubernetes RBAC provides
- Multi-cluster support

## Decisions

### 1. Sample manifests over a Helm chart

Provide raw YAML manifests in `samples/multi-namespace/` rather than a Helm chart.

**Rationale:** RBAC grants are a one-shot admin operation. Raw manifests are transparent, auditable, and require no additional tooling. Operators can see exactly what permissions are being granted. A Helm chart can be added later if there's demand.

**Alternative considered:** Small Helm chart with a values file listing target namespaces. Rejected because it adds complexity for what is typically a one-time operation, and obscures the actual RBAC resources being created.

### 2. Four tiers of access

Structure the samples as four escalating tiers rather than a single configurable manifest.

| Tier | Manifest | What it grants |
|------|----------|---------------|
| 1 | `01-namespace-reader.yaml` | `ClusterRole` + `ClusterRoleBinding` granting only `get, list` on namespaces. Enables namespace discovery in dashboard. |
| 2 | `02-specific-namespaces.yaml` | `RoleBinding` in each target namespace referencing the existing `ark-tenant-role` `ClusterRole`. Grants Ark resource access in named namespaces. |
| 3 | `03-namespace-label-selector.yaml` | Same as tier 2 but uses namespace labels and a `ClusterRole` scoped to namespaces with a specific label. Demonstrates auto-discovery pattern. |
| 4 | `04-full-admin.yaml` | `ClusterRole` + `ClusterRoleBinding` granting full Ark access across all namespaces plus namespace creation. Platform admin only. |

**Rationale:** Each tier is independently applicable. An operator can apply tier 1 alone (discovery), or tier 1 + tier 2 (discovery + specific access). Clear escalation path.

**Note on tier 3:** Kubernetes RBAC does not natively support label-based namespace scoping on Roles/RoleBindings. The manifest will demonstrate the pattern using namespace labels as a convention — the admin applies a `RoleBinding` in each labelled namespace. The docs will note this is a convention enforced by the operator, not by Kubernetes itself.

### 3. Graceful 403 fallback in list_namespaces()

Catch `ApiException` with status 403 in the `list_namespaces()` endpoint and return only the current context namespace.

**Rationale:** This makes the default single-tenant experience work without any RBAC changes. The dashboard calls this endpoint to populate the namespace switcher; returning one namespace means it shows just the tenant's own namespace. When a ClusterRole is added (tier 1+), the endpoint returns whatever namespaces the service account can see.

### 4. Remove ClusterRole from ark-api chart entirely

Delete the `{{- if .Values.rbac.clusterWide }}` block from `rbac.yaml` and the `rbac.clusterWide` key from `values.yaml`.

**Rationale:** The ark-api chart should never ship with the ability to grant itself cluster-wide permissions. Multi-namespace access is a separate admin concern. For local development on minikube, the service account inherits the cluster-admin permissions of the minikube user, so the `list_namespace()` call succeeds naturally.

**Alternative considered:** Keep the toggle but default to `false`. Rejected because even having the option in the chart creates risk — it's one `--set rbac.clusterWide=true` away from a security issue.

### 5. Documentation location

Add a new page at `docs/content/operations-guide/tenant-namespace-management.mdx` with a table linking each sample manifest.

**Rationale:** The operations guide already has a "Setting Up Tenant Namespaces" section in `deploying-ark.mdx`. A dedicated page for multi-namespace management keeps the deployment docs focused on initial setup while giving namespace management the space it needs. The `_meta.js` will place it under the "Platform operations" separator near "Deploying ARK".

## Risks / Trade-offs

**Breaking change for `rbac.clusterWide` users** → Document in release notes. Migration path: apply `04-full-admin.yaml` sample to restore equivalent permissions externally.

**Tier 3 (label-based) is a convention, not enforced by Kubernetes** → Clearly document that the admin must apply RoleBindings to matching namespaces. Kubernetes RBAC doesn't auto-bind based on namespace labels. Future work could automate this with an operator.

**`create_namespace()` will fail for most tenants** → This is the desired behaviour. The endpoint returns a clear error when permissions are insufficient. Document that namespace creation requires tier 4 (full admin) access.

**Local dev on non-minikube clusters** → If a developer uses a cluster where their service account doesn't have cluster-admin, `list_namespaces()` will gracefully return just their namespace. This is correct behaviour, not a bug.
