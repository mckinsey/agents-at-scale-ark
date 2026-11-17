# Ark Tenant Chart

Provisions namespaces for Ark workloads with appropriate RBAC permissions and service accounts.

## What it does

- Creates a service account for query execution
- Sets up RBAC permissions for Ark and Kubernetes resources within the namespace
- Provisions builtin tools (terminate, noop) for agent workflows
- Optionally configures resource quotas and network policies
- Optionally prepares the namespace for marketplace installs from the dashboard (`marketplaceInstall.enabled`): an installer service account, the Roles ark-api and the listed installers need, and a ValidatingAdmissionPolicy that keeps everyone else from using that account. Needs Kubernetes 1.31+ and rights on cluster-scoped objects. See [Tenant and Namespace Management](https://mckinsey.github.io/agents-at-scale-ark/operations-guide/tenant-namespace-management#marketplace-installs-opt-in)
- Refuses `helm install` (never `helm upgrade`) when no `ark-broker` Service exists in the namespace, so a tenant is never provisioned without a default Memory

## Installation

```bash
helm install ark-tenant oci://ghcr.io/mckinsey/agents-at-scale-ark/charts/ark-tenant \
  -n tenant-1 \
  --create-namespace
```

Install `ark-broker` in the namespace first, or pass `--set memory.requireBroker=false` to skip the check.

## Configuration

See `values.yaml` for all configuration options including service accounts, builtin tools (terminate, noop), resource quotas, network policies, the broker requirement (`memory.requireBroker`, `memory.brokerService`), and marketplace installs:

| Value | Default | Meaning |
|---|---|---|
| `marketplaceInstall.enabled` | `false` | Create the marketplace install objects |
| `marketplaceInstall.installers` | `[]` | RBAC subjects allowed to install from the dashboard |
| `marketplaceInstall.arkApiServiceAccount` | `{name: ark-api-sa, namespace: default}` | Service account ark-api runs as |
| `marketplaceInstall.extraRules` | `httproutes`, all verbs | Extra Role rules for the installer service account |
| `marketplaceInstall.assumeAdmissionPolicyApi` | `false` | Render without checking for the ValidatingAdmissionPolicy API, for offline renders |