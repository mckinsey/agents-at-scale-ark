## Why

The ark-controller binary runs two distinct responsibilities in one process: the aggregated API server (`k8s.io/apiserver`) and the controller-runtime Manager (reconcilers, webhooks). The `ark-apiserver` Service selects the same pod via `app.kubernetes.io/name=ark-controller`, so Deployment readiness is ambiguous — `Ready=True` conflates "API serving" with "reconcilers reconciling".

This ambiguity has caused repeated E2E flakiness. PR #1637 / #1763 documented a ~57 s window where the API served CRDs but reconcilers were idle (`tool-type-deprecation-warning`, `team-selector-invalid-agent` failures), requiring a throwaway Model probe in `setup-local.sh` to distinguish the two states. PR #1914 ports that probe into `ark status --wait-for-ready`, inheriting its problems: resource footprint, cleanup leaks on abnormal exit, race conditions between parallel clients.

Splitting into two Deployments makes each pod's Ready condition mean exactly what it says and removes the need for the probe Model entirely.

## What Changes

- `ark/cmd/main.go` takes a required `--role={apiserver,controller}` flag
- In `apiserver` role, the process only starts the embedded aggregated API server + WAL consumer; no reconcilers, no webhooks
- In `controller` role, the process only starts controller-runtime (reconcilers + webhooks) and talks to the aggregated API via the normal k8s client path (kube-apiserver → `APIService` proxy → `ark-apiserver` Service)
- Helm chart `ark/dist/chart` always renders a `controller` Deployment. When `storage.backend=postgresql` it additionally renders an `apiserver` Deployment. Etcd backend stays single-Deployment (no aggregated API server is needed on etcd)
- Two leader-election Leases: `ark-apiserver-leader` (for the WAL consumer singleton) and `ark-controller-leader` (for the reconciler loop)
- `ark-apiserver` Service selector points at `app.kubernetes.io/name=ark-apiserver` on PostgreSQL; Service is not rendered on etcd
- Startup ordering: `ark-controller` waits on `ark-apiserver` readiness via init container plus a Helm pre-upgrade hook
- Helm upgrade from the current embedded topology to the split topology is one-way and zero-data-loss: the pre-upgrade hook brings up `ark-apiserver`, the APIService selector flips, then `ark-controller` is upgraded to drop the embedded API server args
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
- `ark/dist/chart/templates/manager/manager.yaml` — renamed/refactored to the controller-only Deployment; drop apiserver args/ports
- `ark/dist/chart/templates/apiserver/deployment.yaml` — new file, rendered only when `storage.backend=postgresql`
- `ark/dist/chart/templates/apiserver/service.yaml` — selector `app.kubernetes.io/name=ark-apiserver`, rendered only when `storage.backend=postgresql`
- `ark/dist/chart/templates/apiserver/apiservice.yaml` — rendered only when `storage.backend=postgresql`; selector flip handled as part of the pre-upgrade hook ordering
- `ark/dist/chart/templates/apiserver/rbac.yaml` — split RBAC: apiserver ServiceAccount gets PG secret access; controller ServiceAccount drops it
- `ark/dist/chart/templates/hooks/pre-upgrade-apiserver.yaml` — new file, pre-upgrade Helm hook that brings up `ark-apiserver` and waits for APIService `Available=True` before the controller Deployment rollout proceeds
- `ark/dist/chart/values.yaml` — per-role image/replicas/resources blocks; no mode flag
- `ark/dist/chart/values.schema.json` — schema updates
- `.github/actions/setup-e2e/setup-local.sh` — drop lines 132-220 and rely on per-Deployment `kubectl wait`
- `tools/ark-cli/src/lib/readinessChecks.ts` — drop `waitForControllerReconciling`; add `ark-apiserver` to the deployments polled at layer 0 when the PostgreSQL backend is detected
- `tools/ark-cli/src/arkServices.ts` — add `ark-apiserver` as a core service
- No changes to controller reconcilers, webhooks, or CRD definitions
