# Marketplace Install RBAC

Checks the opt-in marketplace install objects of `charts/ark-tenant` (`marketplaceInstall.enabled`). See [#3968](https://github.com/mckinsey/agents-at-scale-ark/issues/3968).

## What it tests

- With the flag off the chart renders no marketplace install objects.
- With the flag on, `helm template` fails without the ValidatingAdmissionPolicy API, and renders with `--api-versions admissionregistration.k8s.io/v1/ValidatingAdmissionPolicy` or `marketplaceInstall.assumeAdmissionPolicyApi=true`.
- Installs the chart in the test namespace with the flag on and `memory.requireBroker=false`, and checks the `ark-marketplace-installer` service account exists.
- Both the release policy and the `-bootstrap` copy, with their bindings, pass the structural checks of the ark-api capability: binding named after its policy, with `Deny`, no `resourceRules`, `excludeResourceRules` or `objectSelector`, and a `namespaceSelector` on this namespace; policy with `failurePolicy: Fail`, no `excludeResourceRules` or `objectSelector`, and no `namespaceSelector` that misses this namespace.
- carol, bound only to the tenant Role, cannot create a Job, CronJob, Deployment or token Secret that uses the installer service account, nor patch a Deployment or CronJob to use it. The cluster admin is refused too, including for a bare Pod (also through the legacy `serviceAccount` field), a StatefulSet and a ReplicationController. Every refusal must come from the namespace's admission policy, not from RBAC.
- carol can still create a Job with the `default` service account, and it completes.
- A second namespace gets its own policy, and uninstalling the chart there leaves the first namespace protected.
- While two `helm upgrade` runs change the chart, carol keeps trying to create a Job with the installer service account, and never gets one through.
- `helm uninstall` removes the release policy and leaves only the `-bootstrap` copy, which on its own still refuses a pod with a recreated installer service account. A new install over that leftover succeeds. The test deletes the leftover in its cleanup.
- Turning the flag off removes the policy and the service account. After deleting the bootstrap copy, as the cleanup runbook does, and waiting until it no longer applies, a rollback to the revision with the flag brings the policy back with the service account.

## Running

```bash
chainsaw test ./marketplace-install-rbac
```

Needs a cluster with the ValidatingAdmissionPolicy API (Kubernetes 1.31+) and `helm` on the path.
