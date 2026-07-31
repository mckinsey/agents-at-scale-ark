# ark-apiserver

Helm chart for the aggregated API server that backs the `ark.mckinsey.com` API groups when the storage backend is `postgresql`. Pairs with the `ark-controller` chart, which runs the reconciler manager.

## Quickstart

```bash
helm upgrade --install ark-apiserver ./dist/chart-apiserver \
  --namespace ark-system \
  --create-namespace \
  --set image.repository=<registry>/ark-controller \
  --set image.tag=<tag> \
  --set postgresql.host=ark-storage-dev \
  --set postgresql.user=postgres \
  --set postgresql.passwordSecretName=ark-storage-dev-password
```

## Operational notes

### Authentication, authorization and TLS

Requests are authenticated and authorized against the kube-apiserver (TokenReview + SubjectAccessReview), so Kubernetes RBAC applies to direct service access, not only to the kubectl path. The chart ships the required `system:auth-delegator` and `extension-apiserver-authentication-reader` bindings.

With `certManager.enabled` (default `true`, requires cert-manager) the serving certificate is issued by cert-manager and its CA is injected into the APIServices, so the kube-apiserver verifies the aggregated apiserver's identity. Set `certManager.enabled=false` to fall back to an ephemeral self-signed certificate with `insecureSkipTLSVerify` on the APIServices.

`networkPolicy.enabled=true` adds an ingress policy for the serving and health ports; restrict serving-port sources with `networkPolicy.extraIngressFrom`.

### Audit log

`audit.enabled` (default `true`) makes the aggregated apiserver emit its own Kubernetes audit trail as JSON on stdout, collected like any other pod log. Because the records are produced in-process, they cover requests arriving over the **direct service path**, which never transits the main kube-apiserver. Audit does not depend on the host's Kubernetes version.

A policy file is **mandatory** whenever audit is enabled — the upstream audit backend records nothing without one — so the apiserver refuses to start rather than report audit as active while emitting nothing. The chart always mounts one.

- `audit.level` (default `Metadata`) sets the catch-all rule: `None`, `Metadata`, `Request` or `RequestResponse`. An unknown value is rejected at template time. `Request`/`RequestResponse` include request and response bodies, which for Ark means Query `.spec.input` and model output reach your log pipeline — treat that as a data classification decision.
- `audit.policy` supplies a complete `audit.k8s.io/v1` Policy and overrides `audit.level` **and** the default exclusions; you then own the whole policy.

The default policy emits one record per Ark API request (`omitStages: [RequestReceived]`) and drops health probes, metrics scrapes and discovery polls, which are continuous background traffic with no audit value.

### Policy enforcement (ValidatingAdmissionPolicy)

The main kube-apiserver does not run its webhook chain on aggregated resources, so Kyverno, OPA/Gatekeeper and any other `ValidatingWebhookConfiguration` **never fire** on `ark.mckinsey.com` resources. The supported enforcement point is a Kubernetes-native [`ValidatingAdmissionPolicy`](https://kubernetes.io/docs/reference/access-authn-authz/validating-admission-policy/) (CEL), which this apiserver evaluates in-process — including on the direct service path. It requires the **host cluster at k8s ≥1.30**.

- `policy.enabled` (default `true`) — set `false` to skip enforcement entirely, which also drops the cluster-wide watch on `validatingadmissionpolicies`, `validatingadmissionpolicybindings` and `namespaces` along with its RBAC. For deployments that would rather the apiserver not read cluster-scoped policy objects at all. Ark's in-process validation and audit are unaffected. Combining it with `policy.required=true` is rejected at template time.
- `policy.required` (default `false`) — when false the apiserver still starts if enforcement cannot be wired (older host, a discovery probe that never succeeded, or missing RBAC) and logs the reason. Set it `true` where policy is a compliance control: startup then fails loudly instead of serving unenforced, which is otherwise visible only in the logs.

Before wiring the plugin the apiserver runs a `SelfSubjectAccessReview` for each of the three watches. A missing or deleted `ark-apiserver-admission-policy` ClusterRoleBinding therefore lands on the same fallback as an unsupported host, naming the binding — rather than leaving the plugin's informers unable to sync, which upstream turns into a 10-second stall and an opaque `Forbidden` on **every write**. The review needs no extra RBAC (`system:basic-user` grants it to all authenticated identities). It confirms the grant exists at startup only; a binding removed while the process is running still fails at request time, which is what `policy.required` is for.
- `policy.extraParamRules` — extra RBAC rules for policies that use `paramKind`. The plugin builds a dynamic informer per `paramKind` and the policy silently never matches if it cannot read that resource. ConfigMaps and Secrets are already covered by the parameter-resolution role, so ConfigMap-based params work out of the box; **any other `paramKind` needs a rule here.**

### Replication slot lifecycle

The apiserver creates a **persistent** logical replication slot named `ark_cdc` on the configured PostgreSQL database to drive its watch stream. The slot survives apiserver pod restarts, which is what lets watchers resume from the last confirmed WAL position rather than missing events from the restart gap.

Because the slot is persistent, **it is not removed by `helm uninstall`**. An orphaned slot will pin WAL retention on the postgres database indefinitely and can fill the disk. After uninstalling ark-apiserver, drop the slot manually:

```sql
SELECT pg_drop_replication_slot('ark_cdc');
```

If you redeploy the apiserver later, it detects the existing slot on startup and reuses it; if the slot was invalidated (`wal_status = 'lost'`, e.g. after `max_slot_wal_keep_size` was exceeded), it is dropped and recreated automatically.

### Multi-replica behaviour

The chart defaults to a single replica — note that an unavailable aggregated apiserver degrades kube-apiserver discovery and garbage collection cluster-wide, so for production run `replicas=2` with `podDisruptionBudget.enabled=true`.

All replicas serve API traffic; only the leader (`Lease/ark-apiserver-leader`) runs the WAL consumer, since the replication slot admits a single connection (the slot's `active` flag is a backstop). Non-leader replicas do not touch the slot and serve watches from a periodic relist (up to ~120s stale) until they acquire the lease.

### Required PostgreSQL configuration

The database must allow logical replication. Typical settings:

```
wal_level = logical
max_replication_slots >= 1
max_wal_senders >= 1
```

The `ark-storage-dev` Helm chart in this repo sets these for development; production deployments must verify them on the managed postgres service.
