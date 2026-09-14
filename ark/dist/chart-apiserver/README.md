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

### Admission enforcement

The main kube-apiserver does not run its webhook chain on aggregated resources, so Kyverno, OPA/Gatekeeper and any other `ValidatingWebhookConfiguration` never fire on `ark.mckinsey.com` resources *via the host*. This apiserver can enforce policy itself, two independent ways — in-process CEL (`policy.cel.enabled`, on by default) and the webhook chain (`policy.thirdPartyWebhooks.enabled`, off by default). Both cover the direct service path.

Each mechanism takes the same two knobs. `enabled` wires it; `required` decides what happens when it cannot be wired. They are separate per mechanism because the two fail for unrelated reasons and a deployment can depend on either alone — an external engine can be the compliance control on Ark resources in a cluster that uses no CEL policy at all. Setting `required: true` on a mechanism whose `enabled` is `false` is rejected at template time.

A Kubernetes-native [`ValidatingAdmissionPolicy`](https://kubernetes.io/docs/reference/access-authn-authz/validating-admission-policy/) (CEL) is evaluated in-process and requires the **host cluster at k8s ≥1.30**.

- `policy.cel.enabled` (default `true`) — set `false` to skip CEL enforcement entirely, which also drops the cluster-wide watch on `validatingadmissionpolicies`, `validatingadmissionpolicybindings` and `namespaces` along with its RBAC. For deployments that would rather the apiserver not read cluster-scoped policy objects at all. Ark's in-process validation and audit are unaffected.
- `policy.cel.required` (default `false`) — when false the apiserver still starts if CEL enforcement cannot be wired (older host, a discovery probe that never succeeded, or missing RBAC) and logs the reason. Set it `true` where policy is a compliance control: startup then fails loudly instead of serving unenforced, which is otherwise visible only in the logs.

`required` means the same thing at runtime as it does at startup, for either mechanism:

| | startup | runtime (informers stall — revoked RBAC, blocked egress, swapped ServiceAccount) |
|---|---|---|
| `required: false` | log the reason, serve unenforced | admit without CEL evaluation, serve unenforced |
| `required: true` | fail startup | fail closed (upstream 10s wait, then `Forbidden`) |

The best-effort path is a decorator around that mechanism's plugins, applied per mechanism so requiring one does not harden the other. It exists because the upstream plugins do not degrade — it holds each write in `WaitForReady` for 10s and then rejects it. The decorator's readiness check approximates the plugin's own (informer `HasSynced` rather than the plugin's internal ready func) and is deliberately biased toward "not ready": a false negative skips enforcement for one request, a false positive is the 10s stall it exists to avoid.

**Alert on `ark_apiserver_admission_enforcement_active`.** One series per mechanism (`mechanism="cel"`, `mechanism="webhooks"`), `1` only while that mechanism is wired *and* its informers have synced — so `min(ark_apiserver_admission_enforcement_active) == 0` catches either one lapsing. Both series are always exported, a mechanism that was never wired reporting `0` rather than going absent. The kubelet readiness probe deliberately stays on `:8081` (controller-runtime's health server) rather than the aggregated apiserver's own `/readyz` on `:6443` — pointing it at `:6443` would gate Service endpoint membership on informer sync, taking reads down too on a deployment that opted into serving unenforced. The metric gives the same signal without the blast radius. If you do move the probe for a `required: true` deployment, pick `failureThreshold`/`periodSeconds` deliberately: the defaults (3 × 10s) mean a ~30s sync blip takes the whole API down, reads included.

### Third-party policy engines (Kyverno, OPA/Gatekeeper)

`policy.thirdPartyWebhooks.enabled=true` runs the `ValidatingAdmissionWebhook` and `MutatingAdmissionWebhook` plugins in this apiserver, so webhook configurations registered by Kyverno, Gatekeeper and similar apply to Ark resources — on the proxied path *and* the direct service path.

Off by default, for two reasons worth understanding before enabling it:

- **It changes the write path.** Every matching webhook becomes a synchronous call on create/update. A webhook with `failurePolicy: Fail` couples Ark writes to that engine's availability, where today Ark's validation is in-process with no network hop.
- **It requires the controller chart at `storage.backend=postgresql`.** That is what stops Ark's own webhook configurations from being rendered. Left in place they would make Ark's validation run twice — once in-process in the storage path, once over the webhook — and re-introduce the `failurePolicy: Fail` coupling for Ark's own validation. On the etcd backend they are still rendered and still needed, since Ark resources are CRDs there.

Enabling it adds a second ClusterRole, `ark-apiserver-admission-webhooks`, granting read on `validatingwebhookconfigurations`, `mutatingwebhookconfigurations` and `namespaces` — the plugins' informers, plus `namespaces` because webhook matching evaluates `namespaceSelector`. These go through the same preflight and best-effort degradation as the policy watches, governed by `policy.thirdPartyWebhooks.required` rather than the CEL flag: a missing `ark-apiserver-admission-webhooks` ClusterRoleBinding logs and degrades at `required: false`, and fails startup at `required: true`.

Before wiring either mechanism the apiserver runs a `SelfSubjectAccessReview` for each of its watches. A missing or deleted `ark-apiserver-admission-policy` ClusterRoleBinding therefore lands on the same fallback as an unsupported host, naming the binding — rather than leaving the plugin's informers unable to sync, which upstream turns into a 10-second stall and an opaque `Forbidden` on **every write**. The review needs no extra RBAC (`system:basic-user` grants it to all authenticated identities). It confirms the grant exists at startup only; a binding removed while the process is running still fails at request time, which is what that mechanism's `required` is for.
- `policy.extraParamRules` — extra RBAC rules for policies that use `paramKind`. The plugin builds a dynamic informer per `paramKind` and the policy silently never matches if it cannot read that resource. ConfigMaps and Secrets are already covered by the parameter-resolution role, so ConfigMap-based params work out of the box; **any other `paramKind` needs a rule here.**

### Metrics

`metrics.enabled=true` (default `false`) serves Prometheus metrics on `metrics.port` (default `8443`) and adds a `metrics` port to the Service (and to the NetworkPolicy when enabled). The endpoint exposes the Ark apiserver collectors (`ark_apiserver_storage_*`, `ark_apiserver_requests_*`, `ark_apiserver_admission_enforcement_active`), the watch broadcaster collectors (`ark_apiserver_watch_*`) and the PostgreSQL backend gauges:

- `ark_apiserver_wal_consumer_active` — `1` on the replica running the WAL consumer; across a healthy deployment the sum is exactly `1`.
- `ark_apiserver_wal_last_message_timestamp_seconds` — staleness means the consumer is wedged. `NaN` on replicas not running the consumer (including a leader that just lost the lease), so a `time() - ark_apiserver_wal_last_message_timestamp_seconds > 300` alert stays quiet on followers; if you scope it anyway, join on `ark_apiserver_wal_consumer_active == 1`.
- `ark_apiserver_replication_slot_lag_bytes` — WAL pinned by the `ark_cdc` slot; a climbing value is the disk-filling condition described under "Replication slot lifecycle". Sampled every 30s on the leader; `NaN` elsewhere. The query reads `pg_replication_slots`, which works for the slot owner by default — a locked-down role needs `GRANT pg_monitor TO <role>`.
- `ark_apiserver_db_pool_*` — connection pool stats (`sql.DBStats`); `wait_count_total` rising means pool exhaustion.

`metrics.secure=true` (default) serves HTTPS and requires a bearer token authorized via TokenReview/SubjectAccessReview; the RBAC is already covered by the `system:auth-delegator` binding. `metrics.serviceMonitor.enabled=true` renders a ServiceMonitor (requires the Prometheus Operator CRDs) scraping every `metrics.serviceMonitor.interval` (default `30s`).

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
