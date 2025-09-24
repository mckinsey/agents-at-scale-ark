# Ark Tenant Chart

Helm chart for provisioning Ark tenant namespaces with proper RBAC, service accounts, and optional resource controls.

## Installation

```bash
# Create a new tenant namespace with default settings
helm install ark-tenant ./charts/ark-tenant -n tenant-1 --create-namespace

# Custom service account name
helm install ark-tenant ./charts/ark-tenant -n production \
  --create-namespace \
  --set serviceAccount.name=prod-sa

# With resource quotas
helm install ark-tenant ./charts/ark-tenant -n limited-tenant \
  --create-namespace \
  --set resourceQuota.enabled=true \
  --set resourceQuota.limits.cpu=5

# With network isolation
helm install ark-tenant ./charts/ark-tenant -n secure-tenant \
  --create-namespace \
  --set networkPolicy.enabled=true \
  --set 'networkPolicy.allowNamespaces={ark-system,monitoring}'
```

## Prerequisites

The Ark controller must have impersonation enabled (default). The controller can then impersonate any service account specified in queries.

To disable impersonation entirely (single-tenant mode):
```bash
helm upgrade ark-controller oci://ghcr.io/mckinsey/agents-at-scale-ark/charts/ark-controller \
  --namespace ark-system \
  --set rbac.impersonation.enabled=false
```

## Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `serviceAccount.create` | Create a service account | `true` |
| `serviceAccount.name` | Name of the service account | `ark-tenant` |
| `rbac.create` | Create RBAC resources | `true` |
| `rbac.additionalSubjects` | Additional subjects for RoleBinding | `[]` |
| `resourceQuota.enabled` | Enable resource quotas | `false` |
| `resourceQuota.limits` | Resource quota limits | See values.yaml |
| `networkPolicy.enabled` | Enable network isolation | `false` |
| `networkPolicy.allowNamespaces` | Namespaces to allow traffic from | `[]` |

## What Gets Created

1. ServiceAccount (optional) - For query execution
2. Role - Permissions for Ark and K8s resources
3. RoleBinding - Binds role to service account
4. ResourceQuota (optional) - Namespace resource limits
5. NetworkPolicy (optional) - Network isolation rules

## Usage

After installation, create Ark resources in the namespace:

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Query
metadata:
  name: my-query
  namespace: tenant-1
spec:
  serviceAccount: ark-tenant  # Or your custom service account name
  input: "Hello from tenant"
  targets:
    - type: agent
      name: my-agent
```