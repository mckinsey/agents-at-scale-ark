## MODIFIED Requirements

### Requirement: ark-api chart RBAC configuration
The ark-api Helm chart SHALL create only namespace-scoped RBAC resources (`Role` + `RoleBinding`). The chart SHALL NOT include any `ClusterRole`, `ClusterRoleBinding`, or toggle for cluster-wide permissions.

The `rbac.clusterWide` key SHALL be removed from `values.yaml`. The conditional ClusterRole/ClusterRoleBinding block SHALL be removed from `templates/rbac.yaml`.

When `impersonation.enabled` is `true` in values, the namespace-scoped `Role` SHALL additionally include:

```yaml
- apiGroups: [""]
  resources: ["users", "groups"]
  verbs: ["impersonate"]
```

When `impersonation.enabled` is `false` (default), no impersonation rules SHALL be present.

#### Scenario: Default ark-api deployment
- **WHEN** the ark-api chart is deployed with default values
- **THEN** only a namespace-scoped `Role` and `RoleBinding` are created
- **AND** no `ClusterRole` or `ClusterRoleBinding` exists for the ark-api service account
- **AND** no impersonation rules are present in the Role

#### Scenario: No cluster-wide toggle available
- **WHEN** an operator sets `rbac.clusterWide: true` in values
- **THEN** the value is ignored (key does not exist in the chart schema)
- **AND** no cluster-scoped RBAC resources are created

#### Scenario: Impersonation enabled
- **WHEN** `impersonation.enabled: true` is set in values
- **THEN** the namespace-scoped `Role` includes `impersonate` verb on `users` and `groups` resources
- **AND** no `ClusterRole` or `ClusterRoleBinding` is created

#### Scenario: Impersonation disabled
- **WHEN** `impersonation.enabled: false` is set in values (or default)
- **THEN** the namespace-scoped `Role` does not include any impersonation rules
