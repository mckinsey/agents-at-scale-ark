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
- Remove the probe Model check from `ark status --wait-for-ready` and `setup-local.sh` once the split is the default
- Enable independent horizontal scaling of the API server (read-heavy) separately from reconcilers (leader-elected singleton)
- Independent rolling upgrades (a server-side fix like #1841 lands without touching reconcilers)
- Backward compatibility: existing installs keep working on `combined` mode until the next major

**Non-Goals:**
- Changing the etcd-backed path (CRDs continue to be served by kube-apiserver; no split needed)
- Multi-writer WAL consumers — WAL consumption stays singleton, scaling the API Deployment does not imply N WAL consumers
- API schema changes — the `ark.mckinsey.com/v1alpha1` and `v1prealpha1` groups are untouched
- Moving webhooks out of the controller process — webhooks stay with reconcilers

## Decisions

### Decision: Single binary with `--role` flag, not two separate binaries

Keeping one binary avoids a second image build, a second entry in the release process, and a second place where version drift can occur. `--role={combined,apiserver,controller}` branches at startup. The `combined` role preserves today's behaviour byte-for-byte.

**Alternative considered**: two binaries (`ark-apiserver`, `ark-controller`). Rejected — the Go code is shared (schemes, storage, validation), and separate binaries would either duplicate it or require a shared lib package. The `--role` flag is strictly simpler.

### Decision: WAL consumer lives on the apiserver side, not the controller side

The WAL consumer's job is to translate PG change events into watch notifications for API-server-side WATCH streams. In `combined` mode it happens to be in the same process as the reconciler; conceptually it is part of the API server. After the split, watchers that the reconciler's informer opens go through the full k8s API path (kube-apiserver → APIService proxy → ark-apiserver → WAL consumer → stream back). This matches how every other aggregated API works.

**Alternative considered**: WAL consumer on the controller side, with reconcilers reading PG directly. Rejected — breaks the single-source-of-truth model (API server becomes advisory), and makes `kubectl watch agents` from outside the cluster see a different stream than what the reconciler sees.

### Decision: Single WAL consumer even when API Deployment has N replicas

WAL logical replication uses a named replication slot. Multiple consumers on the same slot corrupt the stream. Therefore:
- The API Deployment may have N replicas for read scaling
- Only one replica runs the WAL consumer; the others serve reads only
- Leader election within the API Deployment picks the WAL-consumer replica (`ark-apiserver-leader` Lease)
- Non-leader replicas still serve API reads — they just skip the WAL setup path

### Decision: Controller waits for apiserver via Helm hook + init container

Startup ordering matters: if `ark-controller` starts its informers before `ark-apiserver` is serving, LIST+WATCH requests fail and restart backoff kicks in. Two mechanisms in defence:
1. Helm post-install hook `ark-apiserver-wait` that blocks until the APIService reports `Available=True`
2. `ark-controller` Deployment uses an init container `wait-for-apiserver` that runs `kubectl wait apiservice v1alpha1.ark.mckinsey.com --for=condition=Available`

Either alone is probably sufficient; both together is cheap insurance.

### Decision: `deployment.split` is a per-release Helm value, not auto-detected

Making the chart behave differently based on cluster state introduces implicit behaviour that is hard to debug. An explicit `deployment.split: true|false` in values, defaulting `false` for one release, CI-flipped in the same release, and promoted to `true` default in the following release, makes the rollout observable and revertable.

### Decision: Keep `ark-apiserver` Service name stable across modes

The `APIService` CR points to `ark-system/ark-apiserver`. That Service exists today with a selector that matches `ark-controller` pods. After split, the same Service name persists but its selector flips to `app.kubernetes.io/name=ark-apiserver`. The APIService CR is unchanged. Users who reference `ark-apiserver.ark-system.svc` in code keep working.

### Decision: `readinessChecks.ts` collapses layer 5 into layer 0 when split is detected

Detection is cheap: `kubectl get deployment ark-apiserver -n ark-system` succeeds iff split is enabled. When both `ark-apiserver` and `ark-controller` Deployments exist, layer 0 (`waitForDeploymentReady` per service) covers what layer 5 previously needed. The probe Model code path is kept for the transition period (combined mode) and removed when combined mode is deprecated.

## Risks / Trade-offs

- **Extra network hops for reconciler writes**: today the reconciler's k8s client talks to the embedded API server in-process (µs). After the split, writes go client → kube-apiserver → APIService proxy → ark-apiserver pod → PG (likely 1–5 ms). Reads stay on local informer cache, so latency is only on writes (status updates). For a busy cluster with high status-update frequency, this is measurable. Benchmark before making split the default.
- **Two sets of logs/metrics**: debugging becomes "which Deployment has the problem?". Partially offset by clearer signals (each Deployment now reports its own readiness accurately).
- **Helm complexity**: conditional template rendering, two Deployments, two Services (or one with flipped selector), init container, Helm hook. More to review, more to break.
- **Migration risk**: existing clusters running `combined` must flip to `split` at some point. If the flip is not in-place-upgradeable (e.g., PG connection pool collision), operators need a documented downtime window. Acceptance criterion: `helm upgrade` from combined to split must succeed on a live cluster with zero data loss.
- **WAL leader election adds moving parts**: replication slot races are a known class of bug (see PR #1763 context). The switchover from one WAL consumer pod to another during a split-mode rolling upgrade must be tested under load.
- **"embedded" pattern disappears**: some users may have workflows that assume the API server lives in `ark-controller` logs. Communicate via release notes and docs.

## Open Questions

- Does the reconciler's client-side informer cache need any tuning now that watches traverse more hops (resync intervals, throttling)?
- For `combined` mode during the transition, should the `ark-apiserver` Service selector remain `ark-controller` (as today) or switch to a label added to both Deployments (e.g., `ark.mckinsey.com/component=apiserver`)? The latter future-proofs without breaking today.
- Should we measure the write-latency impact on a representative benchmark (e.g., 1 k Models reconciling in parallel) before promoting split to default, or is "works in E2E" sufficient evidence?
- Separate Helm chart (`ark-apiserver`) vs. same chart with conditional templates? Separate chart is cleaner for versioning but adds a new release artefact.
- When combined mode is removed, do we also remove the `--role=combined` code path, or keep it as a dev convenience (single process = easier local debugging)?
