# Marketplace Install RBAC

Checks the opt-in marketplace install objects of `charts/ark-tenant` (`marketplaceInstall.enabled`). See [#3968](https://github.com/mckinsey/agents-at-scale-ark/issues/3968).

## What it tests

- With the flag off the chart renders no marketplace install objects.
- With the flag on, `helm template` fails without the ValidatingAdmissionPolicy API, and renders with `--api-versions admissionregistration.k8s.io/v1/ValidatingAdmissionPolicy` or `marketplaceInstall.assumeAdmissionPolicyApi=true`.
- Installs the chart in the test namespace with the flag on and `memory.requireBroker=false`, and checks the `ark-marketplace-installer` service account exists.

## Running

```bash
chainsaw test ./marketplace-install-rbac
```

Needs a cluster with the ValidatingAdmissionPolicy API (Kubernetes 1.31+) and `helm` on the path.
