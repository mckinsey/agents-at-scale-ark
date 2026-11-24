# Ark Tenant Chart

Provisions namespaces for Ark workloads with appropriate RBAC permissions and service accounts.

## What it does

- Creates a service account for query execution
- Sets up RBAC permissions for Ark and Kubernetes resources within the namespace
- Provisions builtin tools (terminate, noop) for agent workflows
- Optionally configures resource quotas and network policies
- Refuses `helm install` (never `helm upgrade`) when no `ark-broker` Service exists in the namespace, so a tenant is never provisioned without a default Memory

## Installation

```bash
helm install ark-tenant oci://ghcr.io/mckinsey/agents-at-scale-ark/charts/ark-tenant \
  -n tenant-1 \
  --create-namespace
```

Install `ark-broker` in the namespace first, or pass `--set memory.requireBroker=false` to skip the check.

## Configuration

See `values.yaml` for all configuration options including service accounts, builtin tools (terminate, noop), resource quotas, network policies, and the broker requirement (`memory.requireBroker`, `memory.brokerService`).