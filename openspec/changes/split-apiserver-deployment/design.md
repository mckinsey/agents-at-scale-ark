## Context

Ark supports two storage backends: the default etcd (CRDs registered directly, served by kube-apiserver) and PostgreSQL (served by an embedded aggregated API server via `k8s.io/apiserver`, `APIService` resource, PG-backed storage, `pglogrepl` WAL streaming for watch notifications).

In the PostgreSQL path, the same ark-controller pod runs:
- The aggregated API server as a `Manager.Runnable` (`ark/cmd/main.go:setupEmbeddedApiserver` calls `mgr.Add(server)`)
- The controller-runtime Manager with reconcilers for Agent/Model/Query/Team/MCPServer/ExecutionEngine/A2AServer
- Webhooks for validation and mutation
- The WAL consumer (`ark/internal/storage/postgresql/wal_consumer.go`) that streams PG change events to informer caches

`ark-apiserver` Service selects `app.kubernetes.io/name=ark-controller` — proving the same pod hosts both responsibilities. Readiness probes and Deployment `Available` conditions therefore cannot distinguish "API serving" from "reconcilers reconciling".

This ambiguity has driven three notable incidents:
- PR #1527 — aggregated API accepted reads while reconcilers were not yet caught up; needed warmup loop in `setup-local.sh`
- PR #1637 — `kubectl patch` + `rollout restart` for coverage config killed the controller pod mid-test, leaving a ~57 s window where API served but reconcilers were idle; needed a probe Model write to detect
- PR #1841 — intermittent 503s under load; needed to disable protobuf support in the apiserver

The 10-consecutive-probe aggregated-API stability check and the probe Model check in `setup-local.sh:132-220` exist because the pod's readiness signal is coarser than the failure modes it sees.

## Goals / Non-Goals

**Goals:**
- Deployment readiness means exactly what it says: `ark-apiserver` Ready = API is serving; `ark-controller` Ready = reconcilers started
- Remove the probe Model check from both `ark status --wait-for-ready` and `setup-local.sh`
- Enable independent horizontal scaling of the API server (read-heavy) separately from reconcilers (leader-elected singleton)
- Independent rolling upgrades (a server-side fix like #1841 lands without touching reconcilers)
- Zero-data-loss Helm upgrade from the current embedded topology to the split topology

**Non-Goals:**
- Changing the etcd-backed path (CRDs continue to be served by kube-apiserver; no split needed, single Deployment stays)
- Multi-writer WAL consumers — WAL consumption stays singleton, scaling the API Deployment does not imply N WAL consumers
- API schema changes — the `ark.mckinsey.com/v1alpha1` and `v1prealpha1` groups are untouched
- Moving webhooks out of the controller process — webhooks stay with reconcilers
- Preserving the embedded-in-controller topology as a supported production configuration

## Decisions

### Decision: Single binary with required `--role={apiserver,controller}` flag

One binary avoids a second image build, a second release artefact, and a second place where version drift can occur. `--role` branches at startup. There is no `combined` fallback — operators explicitly choose a role, and the Helm chart wires them correctly for each backend.

**Alternative considered**: two binaries (`ark-apiserver`, `ark-controller`). Rejected — Go code is shared (schemes, storage, validation), separate binaries would either duplicate it or need a shared lib package. The `--role` flag is strictly simpler.

**Alternative considered**: keep a `combined` role as an escape hatch for migration. Rejected — it preserves the readiness ambiguity that motivates this work, forces three-way branching through `main.go` / the Helm chart / the CLI, and keeps a deprecated code path alive indefinitely. The cost of solving upgrade as a one-way Helm-hook problem (see below) is lower than the cost of carrying a legacy mode.

### Decision: Etcd backend stays single-Deployment

On etcd, CRDs are registered in kube-apiserver directly and there is no aggregated API server. Running a second Deployment in `apiserver` mode would have nothing to do. Etcd backend deploys only the `controller` role Deployment, which is indistinguishable from today's etcd install except that `--role=controller` is now passed explicitly.

### Decision: WAL consumer lives on the apiserver side, not the controller side

The WAL consumer's job is to translate PG change events into watch notifications for API-server-side WATCH streams. Conceptually it is part of the API server. After the split, watchers opened by the reconciler's informer go through the full k8s API path (kube-apiserver → APIService proxy → ark-apiserver → WAL consumer → stream back). This matches how every other aggregated API works.

**Alternative considered**: WAL consumer on the controller side, with reconcilers reading PG directly. Rejected — breaks the single-source-of-truth model (API server becomes advisory), and makes `kubectl watch agents` from outside the cluster see a different stream than what the reconciler sees.

### Decision: Single WAL consumer even when the apiserver Deployment has N replicas

WAL logical replication uses a named replication slot. Multiple consumers on the same slot corrupt the stream. Therefore:
- The apiserver Deployment may have N replicas for read scaling
- Only one replica runs the WAL consumer; the others serve reads only
- Leader election within the apiserver Deployment picks the WAL-consumer replica (`ark-apiserver-leader` Lease)
- Non-leader replicas still serve API reads — they just skip the WAL setup path

### Decision: Two separate Helm charts, not one chart with conditional templates

`ark/dist/chart` remains the ark-controller chart (reconcilers, webhooks, CRDs). A new chart `ark/dist/chart-apiserver` owns the apiserver Deployment, the `ark-apiserver` Service, the `APIService` CR, and the apiserver-side RBAC. Operators install one chart on etcd (`ark-controller` only) and two charts on PostgreSQL (`ark-apiserver` first, then `ark-controller`).

Rationale:
- The two Deployments have independent lifecycles (upgrades, rollbacks, scale decisions). Independent Helm releases match that.
- Values schemas diverge: `ark-apiserver` needs PG connection config and replica count; `ark-controller` needs neither.
- RBAC is naturally split: each chart creates the ServiceAccount it needs and only the permissions that role requires.
- Upgrade ordering is expressed directly as "install/upgrade `ark-apiserver` first, then `ark-controller`" instead of smuggled through template conditionals and hooks inside one chart.

**Alternative considered**: one chart with `.Values.storage.backend` gating conditional templates for the apiserver Deployment. Rejected — it couples two release lifecycles, hides the apiserver upgrade path inside hooks of a chart named `ark-controller`, and makes it harder to version the apiserver independently (e.g., ship an apiserver-only patch for a perf fix without bumping the controller chart).

**Alternative considered**: an umbrella `ark-operator` chart that depends on both. Deferred — not needed for v1 of the split; operators can install both charts with a two-line `helm install` script. An umbrella chart can be added later without blocking this change.

### Decision: Upgrade path is a two-step Helm install, no cross-chart hooks

The migration from the current embedded topology to the split topology is:

1. `helm install ark-apiserver ark/dist/chart-apiserver --wait` — creates the new Deployment, Service, and RBAC. The chart also takes ownership of the `APIService` CR, updating its selector to `app.kubernetes.io/name=ark-apiserver`. At this point the APIService endpoints flip from the old controller pods (which are still running the embedded apiserver) to the new apiserver pods.
2. `helm upgrade ark-controller ark/dist/chart` — the new chart version drops the apiserver args/ports from the controller Deployment and sets `--role=controller`. Existing reconcilers continue as the pod rolls.

Between step 1 and step 2 the cluster is briefly in a mixed state: the new apiserver pods serve the API, the old controller pods still have the embedded apiserver running but it is no longer reachable because the Service no longer selects them. This is intentional — there is no window where the APIService is unavailable, because step 1 completes before step 2 begins. The embedded apiserver in the old controller pods is harmless until those pods roll out of existence in step 2.

Rollback is per-chart: `helm rollback ark-controller` reverts the controller changes; if the apiserver chart also needs rollback, `helm rollback ark-apiserver` reverses step 1 and the APIService selector returns to the old controller pods.

**Alternative considered**: a single-chart pre-upgrade hook that installs the apiserver resources and flips the APIService selector in one Helm transaction. Rejected — it smuggles two release lifecycles through one hook. It also makes it hard to upgrade the apiserver without touching the controller chart (and vice versa) once the migration is complete.

### Decision: Controller waits for apiserver via init container

Startup ordering matters: if `ark-controller` starts its informers before `ark-apiserver` is serving, LIST+WATCH requests fail and restart backoff kicks in. The `ark-controller` Deployment includes an init container `wait-for-apiserver` that runs `kubectl wait apiservice v1alpha1.ark.mckinsey.com --for=condition=Available`. This covers both the initial install (where `helm install ark-apiserver` runs before `helm install ark-controller`) and any controller pod restart after the split is established.

We do not need a cross-chart Helm hook: the two-step install ordering plus the init container is sufficient. Operators or CI who run the commands out of order are caught by the init container blocking.

### Decision: `ark-apiserver` Service name stable across backends

The `APIService` CR points to `ark-system/ark-apiserver`. On the PostgreSQL backend that Service is rendered with selector `app.kubernetes.io/name=ark-apiserver`. On etcd the Service is not rendered because there is no aggregated API server. Users who reference `ark-apiserver.ark-system.svc` in code keep working on PostgreSQL.

### Decision: `readinessChecks.ts` drops the probe Model path entirely

With split deployments mandatory on the backend that used to need the probe Model, there is no scenario where the probe is required. Layer 5 (`waitForControllerReconciling`) is deleted. `ark-apiserver` is added to the list of core services that layer 0 waits for when the PostgreSQL backend is detected (no CRD present).

## Risks / Trade-offs

- **Extra network hops for reconciler writes**: today the reconciler's k8s client talks to the embedded API server in-process (µs). After the split, writes go client → kube-apiserver → APIService proxy → ark-apiserver pod → PG (likely 1–5 ms). Reads stay on local informer cache, so latency is only on writes (status updates). For a busy cluster with high status-update frequency, this is measurable. Benchmark before cutting over.
- **Two sets of logs/metrics**: debugging becomes "which Deployment has the problem?". Partially offset by clearer signals (each Deployment now reports its own readiness accurately).
- **Helm upgrade blast radius**: the pre-upgrade hook is critical path. A bug in the hook script means the upgrade fails and operators must roll back. Mitigation: CI integration test that runs `helm upgrade` from an existing PostgreSQL install with seeded Agent/Model/Query resources and verifies all resources are still queryable after the upgrade.
- **WAL leader election adds moving parts**: replication slot races are a known class of bug (see PR #1763). The switchover from one WAL consumer pod to another during a split-mode rolling upgrade must be tested under load.
- **"embedded" pattern disappears**: some users may have workflows that assume the API server lives in `ark-controller` logs. Communicate via release notes and docs.

## Open Questions

- Does the reconciler's client-side informer cache need any tuning now that watches traverse more hops (resync intervals, throttling)?
- Should we measure the write-latency impact on a representative benchmark (e.g., 1 k Models reconciling in parallel) before cutting over, or is "works in E2E" sufficient evidence?
- Do we ship the change in a single release (operators run the two `helm install` / `helm upgrade` commands themselves) or provide an umbrella `ark-operator` chart that encapsulates the two-step install? Current proposal: two separate installs, umbrella chart deferred.
- Does `make dev` / `devspace dev` need to spin up both charts, or do we keep a single-process local-dev path that bypasses the split? Likely the former (honour the production topology), but confirm with the dev-experience owners.
- Who owns WAL leader failover testing under load? §6 covers perf but not the reliability case of the apiserver leader pod dying mid-reconcile.
- What does post-split log grep look like for operators whose runbooks assume `kubectl logs deployment/ark-controller` contains API server messages? §5.4 flags it; need to decide whether to ship a migration helper (e.g., a `docs/operator-migration.md`).
