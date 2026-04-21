## Why

The ark-controller binary runs two distinct responsibilities in one process: the aggregated API server (`k8s.io/apiserver`) and the controller-runtime Manager (reconcilers, webhooks). The `ark-apiserver` Service selects the same pod via `app.kubernetes.io/name=ark-controller`, so Deployment readiness is ambiguous — `Ready=True` conflates "API serving" with "reconcilers reconciling".

This ambiguity has caused repeated E2E flakiness. PR #1637 / #1763 documented a ~57 s window where the API served CRDs but reconcilers were idle (`tool-type-deprecation-warning`, `team-selector-invalid-agent` failures), requiring a throwaway Model probe in `setup-local.sh` to distinguish the two states. PR #1914 ports that probe into `ark status --wait-for-ready`, inheriting its problems: resource footprint, cleanup leaks on abnormal exit, race conditions between parallel clients.

Splitting into two Deployments makes each pod's Ready condition mean exactly what it says and removes the need for the probe Model entirely.

## What Changes

- `ark/cmd/main.go` takes a required `--role={apiserver,controller}` flag
- In `apiserver` role, the process only starts the embedded aggregated API server + WAL consumer; no reconcilers, no webhooks
- In `controller` role, the process only starts controller-runtime (reconcilers + webhooks) and talks to the aggregated API via the normal k8s client path (kube-apiserver → `APIService` proxy → `ark-apiserver` Service)
- `ark/dist/chart` remains the `ark-controller` chart — reconcilers, webhooks, CRDs. On the split it drops the apiserver args/ports and sets `--role=controller`
- New chart `ark/dist/chart-apiserver` owns the `ark-apiserver` Deployment, the `ark-apiserver` Service (selector `app.kubernetes.io/name=ark-apiserver`), the `APIService` CR, and the apiserver-side RBAC. Installed only on the PostgreSQL backend
- Two Helm releases on PostgreSQL (`ark-apiserver` + `ark-controller`); one Helm release on etcd (`ark-controller` only)
- Two leader-election Leases: `ark-apiserver-leader` (for the WAL consumer singleton) and `ark-controller-leader` (for the reconciler loop)
- Startup ordering via install order (`ark-apiserver` first) plus an `ark-controller` init container that blocks on APIService `Available=True`; no cross-chart Helm hooks
- Upgrade from the current embedded topology is a two-step sequence: (1) `helm install ark-apiserver ark/dist/chart-apiserver --wait` takes ownership of the APIService and flips the endpoints to the new pods; (2) `helm upgrade ark-controller ark/dist/chart` drops the embedded apiserver args. No window where the APIService is unavailable
- `tools/ark-cli/src/lib/readinessChecks.ts` drops the probe Model check entirely — layer 0 covers reconciler readiness via the `ark-controller` Deployment's `Ready` condition
- `setup-local.sh:132-220` is reduced to per-Deployment `kubectl wait` calls, dropping the API-group poll / aggregated-API stability / probe Model blocks
- No `combined` role, no `deployment.split` value, no transitional escape hatch. A clean two-role topology is the single supported production configuration

## Capabilities

### New Capabilities
- `split-apiserver-deployment`: the aggregated API server runs as its own Deployment on the PostgreSQL backend, distinct from the reconciler Deployment, with per-component readiness probes and independent lifecycle

### Modified Capabilities
- `postgresql-backend`: served by a dedicated `ark-apiserver` Deployment. The embedded-in-controller implementation is removed

## Impact

- `ark/cmd/main.go` — `--role` flag becomes required; role-scoped setup paths; no fallthrough
- `ark/internal/apiserver/server.go` — unchanged (already a `Manager.Runnable`)
- `ark/internal/storage/postgresql/wal_consumer.go` — lifecycle scoped to the apiserver role; add leader-election within the apiserver replica set
- `ark/dist/chart/templates/manager/manager.yaml` — drop apiserver args/ports; set `--role=controller`
- `ark/dist/chart/templates/init/wait-for-apiserver.yaml` — `ark-controller` init container block that waits on APIService `Available=True`
- `ark/dist/chart/values.yaml` — drop apiserver-related values; controller-only config remains
- `ark/dist/chart-apiserver/` — new chart directory
- `ark/dist/chart-apiserver/Chart.yaml` — name `ark-apiserver`, version aligned with the operator release
- `ark/dist/chart-apiserver/values.yaml` + `values.schema.json` — apiserver image/replicas/resources, PG connection config, `ark-apiserver-leader` Lease config
- `ark/dist/chart-apiserver/templates/deployment.yaml` — runs `--role=apiserver`
- `ark/dist/chart-apiserver/templates/service.yaml` — selector `app.kubernetes.io/name=ark-apiserver`, name `ark-apiserver` (stable across migrations)
- `ark/dist/chart-apiserver/templates/apiservice.yaml` — `APIService` CR targeting the Service; owned by this chart
- `ark/dist/chart-apiserver/templates/rbac.yaml` — apiserver ServiceAccount + PG secret access
- `.github/actions/setup-e2e/setup-local.sh` — drop lines 132-220 and rely on per-Deployment `kubectl wait`
- `tools/ark-cli/src/lib/readinessChecks.ts` — drop `waitForControllerReconciling`; add `ark-apiserver` to the deployments polled at layer 0 when the PostgreSQL backend is detected
- `tools/ark-cli/src/arkServices.ts` — add `ark-apiserver` as a core service
- No changes to controller reconcilers, webhooks, or CRD definitions
