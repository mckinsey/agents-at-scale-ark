# ark-api RBAC tenant-isolation audit

Audit of `services/ark-api/chart/templates/rbac.yaml` as it relates to deploying one `ark-api` Helm release per tenant namespace under the multi-tenant dashboard hosting model.

## Resources granted

The chart installs **two distinct identities** per release: a namespace-scoped `Role` + `RoleBinding`, and a cluster-scoped `ClusterRole` + `ClusterRoleBinding`.

### Namespace-scoped Role (tenant-isolated)

Bound to `{{ .Release.Namespace }}`. Grants access only inside the tenant namespace.

| Resource | Verbs |
| --- | --- |
| `secrets` (core) | get, list, create, update, patch, delete |
| `events` (core) | get, list, create, update, patch, delete |
| `configmaps` (core) | get, list |
| `configmaps/ark-export-metadata` | update, patch |
| `services` (core) | get, list |
| `pods`, `pods/log` (core) | get, list |
| `httproutes`, `gateways` (gateway.networking.k8s.io) | get, list |
| Ark CRDs (`models`, `agents`, `queries`, `teams`, `tools`, `workflows`, `arktemplates`, `mcpservers`, `a2aservers`, `memories`, `a2atasks`, `executionengines`) | get, list, watch, create, update, patch, delete |
| Argo Workflows (`workflows`, `workflowtemplates`, `cronworkflows`, `clusterworkflowtemplates`) | get, list, watch, create, update, patch, delete |

These are **tenant-isolated** by RoleBinding: `ark-api-ns1` cannot read or write resources in `namespace2`.

### Cluster-scoped ClusterRole

Bound by a `ClusterRoleBinding` to the tenant's `ServiceAccount`. The ClusterRole's name is suffixed with the release namespace (so the role itself is per-tenant), but the resources it grants are cluster-scoped:

| Resource | Verbs | Tenant-isolated? |
| --- | --- | --- |
| `arkconfigs` (ark.mckinsey.com) | get, list, watch, create, update, patch, delete | **No** — cluster-scoped resource shared by all tenants |
| `users`, `groups` (`impersonate` verb, only if `impersonation.enabled`) | impersonate | **No** — cluster-wide identity surface |

## Findings

### Finding 1 — `arkconfigs` full CRUD is not tenant-isolated (medium severity for multi-tenant)

`ArkConfig` is a cluster-scoped Ark singleton used for global defaults. The current ClusterRole grants every tenant's `ark-api` full CRUD on it. Consequences for the multi-tenant model:

- Tenant 1 can read every `ArkConfig` resource in the cluster (including any default-model credentials or settings other tenants depend on).
- Tenant 1 can create, modify, or delete `ArkConfig` resources — affecting tenant 2's runtime behaviour.
- This is not a hosting-correctness issue (dashboard subpath routing still works) but it is a real tenant-isolation gap.

**Recommendation (not in scope for this change):**
- Restrict the cluster-scoped grant to `verbs: ["get", "list", "watch"]` so tenants can read but not mutate the singleton.
- If write access is genuinely needed by `ark-api` for some flow, scope it down with `resourceNames:` to a tenant-specific ArkConfig name once such a convention exists.

### Finding 2 — `users` / `groups` impersonation (conditional)

When `impersonation.enabled=true`, every tenant's `ark-api` ServiceAccount can `impersonate` arbitrary users and groups cluster-wide. In a multi-tenant deployment, this means tenant 1's compromised API could impersonate users that belong to tenant 2's organisation.

**Recommendation:** treat `impersonation.enabled` as cluster-wide and only enable it where a single trust boundary owns the entire cluster. For a multi-tenant install across multiple organisations, keep impersonation disabled. Document this in the multi-tenant hosting guide.

### Finding 3 — Namespace-scoped Role is correctly isolated

Every namespace-scoped grant uses `Role` + `RoleBinding` in `{{ .Release.Namespace }}`. Two tenants installed in `namespace1` and `namespace2` cannot read or write each other's Secrets, ConfigMaps, Pods, or Ark CRDs through their respective `ark-api` instances. **No action required.**

## Decisions for this change

- **Do not modify** `services/ark-api/chart/templates/rbac.yaml` as part of `dashboard-runtime-basepath`. The findings above are real tenant-isolation gaps but do not block the multi-tenant dashboard hosting story.
- **Document** the trust model in the multi-tenant hosting guide so operators understand what the per-tenant deployment guarantees:
  - Per-tenant Ark CRDs, secrets, pods, etc. are isolated.
  - `ArkConfig` (cluster singleton) is *not* isolated under the current chart.
  - User impersonation, if enabled, is cluster-wide and should not be enabled for cross-organisation multi-tenancy.
- **File a follow-up issue** to scope the `arkconfigs` cluster grant to read-only by default, and to gate `impersonation.enabled` behind a clear single-tenant guard.
