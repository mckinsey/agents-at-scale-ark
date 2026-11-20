# Marketplace Install RBAC

Checks the opt-in marketplace install objects of `charts/ark-tenant` (`marketplaceInstall.enabled`). See [#3968](https://github.com/mckinsey/agents-at-scale-ark/issues/3968).

## What it tests

- With the flag off the chart renders no marketplace install objects.
- With the flag on, `helm template` fails without the ValidatingAdmissionPolicy API, and renders with `--api-versions admissionregistration.k8s.io/v1/ValidatingAdmissionPolicy` or `marketplaceInstall.assumeAdmissionPolicyApi=true`.
- An `arkApiServiceAccount` in the tenant namespace makes the render fail.
- With no `installers`, the chart renders no installer RoleBinding.
- Installs the chart in the test namespace with the flag on and `memory.requireBroker=false`, and checks the `ark-marketplace-installer` service account exists.
- SelfSubjectAccessReviews: alice, listed in `installers`, can `create` `marketplaceinstalls` in group `ark.mckinsey.com` and nothing more; bob and carol, who has the tenant Role, cannot.
- Both the release policy and the `-bootstrap` copy, with their bindings, pass the structural checks of the ark-api capability: binding named after its policy, with `Deny`, no `resourceRules`, `excludeResourceRules` or `objectSelector`, and a `namespaceSelector` on this namespace; policy with `failurePolicy: Fail`, no `excludeResourceRules` or `objectSelector`, and no `namespaceSelector` that misses this namespace.
- carol, bound only to the tenant Role, cannot create a Job, CronJob, Deployment or token Secret that uses the installer service account, nor patch a Deployment or CronJob to use it. The cluster admin is refused too, including for a bare Pod (also through the legacy `serviceAccount` field), a StatefulSet and a ReplicationController. Every refusal must come from the namespace's admission policy, not from RBAC.
- carol can still create a Job with the `default` service account, and it completes.
- A second namespace gets its own policy, and uninstalling the chart there leaves the first namespace protected. That namespace is then deleted while it still holds the install lock Lease, and the deletion completes.
- SelfSubjectAccessReviews as the installer service account: no `patch` or `delete` on its Namespace and no `create` on `resourcequotas`; `create` on `deployments`, `rolebindings`, `agents`, `events` and `httproutes`; nothing in the second namespace. `kubectl label namespace` as the installer gets `403`.
- Jobs created by impersonating the installer service account, as ark-api will, run to completion. A Deployment with one replica created the same way rolls out, so the deployment and replica set controllers are trusted. Deleting one with `--cascade=orphan` and one with `--cascade=background` finishes: the policy does not block the garbage collector.
- SelfSubjectAccessReviews as `ark-api-sa`: it can impersonate only the installer service account, create Leases, and read, update and delete only `marketplace-install-lock`. Nothing else.
- Only `ark-api-sa` can create, update or delete the `marketplace-install-lock` Lease: the installer service account, which gets Leases from `admin`, and the cluster admin are refused by the policy. A collection delete of Leases is refused too, since it would take the lock with it. ark-api can update and delete the lock, and the installer can still create, update and delete a Lease with another name.
- A Job running as the installer service account checks that its projected token carries the `authentication.kubernetes.io/pod-name` extra. The other cases run as the installer with that extra set through impersonation (`kubectl --as … --as-user-extra`, which needs kubectl 1.35 or later); the policy sees the same user, groups and extra as for helm in the install pod. The policy refuses RoleBindings to a ClusterRole, to the tenant chart's Roles, to a Group, to a service account of another namespace or to a `system:` user; Roles with a wildcard in groups, resources, subresources or verbs (including `agents/*`), rules on RBAC, any rule on Secrets (read or write), `pods/exec`, `pods/attach`, `serviceaccounts/token`, `impersonate`, `escalate` or `bind` (Roles on `pods/ephemeralcontainers`, `*/token`, `pods/*`, `serviceaccounts/*` or a bare `*` group, resource or verb on core resources are refused too, already by RBAC since the installer does not hold those permissions); a Deployment or token Secret for the installer service account; Secrets named `u-<16 hex>-…` or with a non-shared `ark.mckinsey.com/scope`; and the install lock Lease. It allows a read-only Role on ConfigMaps and its RoleBindings to a local service account and to a user, a Deployment with the `default` service account, and Secrets with `scope: shared`, no label, or a name that only contains `u-<16 hex>-`.
- With the same extra, patching the tenant chart's Role or RoleBinding is refused while patching the probe's own Role works, and the tenant Role keeps its rules. The installer cannot request a token for itself or for `default`, with or without the extra; the install pods still get their projected tokens from the kubelet.
- With the same extra, deleting the tenant chart's Roles and RoleBindings, a personal secret, a Secret with a user scope label, or a whole collection of Secrets or RoleBindings is refused. Deleting the probe's own RoleBinding and an unlabelled Secret works. Afterwards the cluster admin deletes the user-scoped Secret, so deletes from anyone else are not affected.
- The same Deployment with the installer service account, created by impersonation without the pod extra, is allowed.
- A third namespace installed with the flag off and then upgraded to turn it on gets the `-bootstrap` copy at that upgrade. After an upgrade that changes `marketplaceInstall.arkApiServiceAccount`, the new service account can take the install lock: both copies of the policy follow the new value.
- In a fourth namespace with the flag off, carol creates a Deployment with the installer service account, which cannot run yet. Turning the flag on with `helm upgrade` then fails and names the Deployment and its ReplicaSet, without creating the service account. Once the Deployment is gone the upgrade succeeds.
- While two `helm upgrade` runs change the chart, carol keeps trying to create a Job with the installer service account, and never gets one through. The first upgrade empties `extraRules`, and the installer loses `httproutes`.
- `helm uninstall` removes the release policy and leaves only the `-bootstrap` copy, which on its own still refuses a pod with a recreated installer service account. After deleting the Jobs and Deployment that used the installer service account, a new install over that leftover succeeds. The test deletes the leftover in its cleanup.
- Turning the flag off removes the policy and the service account. After deleting the bootstrap copy, as the cleanup runbook does, and waiting until it no longer applies, a rollback to the revision with the flag brings the policy back with the service account.

## Running

```bash
chainsaw test ./marketplace-install-rbac
```

Needs a cluster with the ValidatingAdmissionPolicy API (Kubernetes 1.31+) and `helm` on the path.
