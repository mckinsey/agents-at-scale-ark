## MODIFIED Requirements

### Requirement: ark-api chart RBAC configuration
The ark-api Helm chart SHALL create only namespace-scoped RBAC resources (`Role` + `RoleBinding`). The chart SHALL NOT include any `ClusterRole`, `ClusterRoleBinding`, or toggle for cluster-wide permissions.

The `rbac.clusterWide` key SHALL be removed from `values.yaml`. The conditional ClusterRole/ClusterRoleBinding block SHALL be removed from `templates/rbac.yaml`.

#### Scenario: Default ark-api deployment
- **WHEN** the ark-api chart is deployed with default values
- **THEN** only a namespace-scoped `Role` and `RoleBinding` are created
- **AND** no `ClusterRole` or `ClusterRoleBinding` exists for the ark-api service account

#### Scenario: No cluster-wide toggle available
- **WHEN** an operator sets `rbac.clusterWide: true` in values
- **THEN** the value is ignored (key does not exist in the chart schema)
- **AND** no cluster-scoped RBAC resources are created

### Requirement: Namespace listing graceful fallback
The `GET /api/v1/namespaces` endpoint SHALL return a list of namespaces the service account can see. When the service account lacks cluster-level permission to list namespaces, the endpoint SHALL return a list containing only the current context namespace instead of returning an error.

#### Scenario: Service account with namespace list permission
- **WHEN** the service account has a ClusterRole granting `list` on `namespaces`
- **AND** a client calls `GET /api/v1/namespaces`
- **THEN** the endpoint returns all namespaces the service account can list

#### Scenario: Service account without namespace list permission
- **WHEN** the service account has only namespace-scoped permissions (no ClusterRole)
- **AND** a client calls `GET /api/v1/namespaces`
- **THEN** the endpoint returns a list containing only the current context namespace
- **AND** the response status is 200 (not 403)

#### Scenario: Local development on minikube
- **WHEN** the ark-api runs on minikube where the service account inherits cluster-admin
- **AND** a client calls `GET /api/v1/namespaces`
- **THEN** the endpoint returns all namespaces in the cluster

### Requirement: Namespace creation permission gated
The `POST /api/v1/namespaces` endpoint SHALL only succeed when the service account has explicit Kubernetes permission to create namespaces. When the service account lacks this permission, the endpoint SHALL return a clear error.

#### Scenario: Service account with namespace create permission
- **WHEN** the service account has a ClusterRole granting `create` on `namespaces`
- **AND** a client calls `POST /api/v1/namespaces` with `{"name": "new-ns"}`
- **THEN** the namespace is created and a success response is returned

#### Scenario: Service account without namespace create permission
- **WHEN** the service account has only namespace-scoped permissions
- **AND** a client calls `POST /api/v1/namespaces` with `{"name": "new-ns"}`
- **THEN** the endpoint returns a 403 error with a message indicating insufficient permissions

### Requirement: devspace.yaml does not set cluster-wide RBAC
The `services/ark-api/devspace.yaml` SHALL NOT set `rbac.clusterWide` or any cluster-scoped RBAC configuration. Local development on minikube works without explicit cluster RBAC because the minikube user has cluster-admin permissions.

#### Scenario: Local development RBAC
- **WHEN** a developer runs `devspace dev` for ark-api
- **THEN** the deployed chart does not create any ClusterRole or ClusterRoleBinding
- **AND** namespace listing works because minikube grants cluster-admin to the service account
