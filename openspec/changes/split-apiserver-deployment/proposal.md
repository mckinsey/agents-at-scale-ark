## Why

The ark-controller binary runs two distinct responsibilities in one process: the aggregated API server (`k8s.io/apiserver`) and the controller-runtime Manager (reconcilers, webhooks). The `ark-apiserver` Service selects the same pod via `app.kubernetes.io/name=ark-controller`, so Deployment readiness is ambiguous — `Ready=True` conflates "API serving" with "reconcilers reconciling".

This ambiguity has caused repeated E2E flakiness. PR #1637 / #1763 documented a ~57 s window where the API served CRDs but reconcilers were idle (`tool-type-deprecation-warning`, `team-selector-invalid-agent` failures), requiring a throwaway Model probe in `setup-local.sh` to distinguish the two states. PR #1914 ports that probe into `ark status --wait-for-ready`, inheriting its problems: resource footprint, cleanup leaks on abnormal exit, race conditions between parallel clients.

Splitting into two Deployments makes each pod's Ready condition mean exactly what it says and removes the need for the probe Model entirely.

## What Changes

- `ark/cmd/main.go` gains a `--role={combined,apiserver,controller}` flag (default `combined` for backward compatibility)
- In `apiserver` mode, the process only starts the embedded aggregated API server + WAL consumer; no reconcilers, no webhooks
- In `controller` mode, the process only starts controller-runtime (reconcilers + webhooks) and talks to the aggregated API via the normal k8s client path (kube-apiserver → `APIService` proxy → `ark-apiserver` Service)
- Helm chart `ark/dist/chart` adds a second `Deployment` (`ark-apiserver`) when `storage.backend=postgresql` and `deployment.split=true`; `ark-controller` Deployment stops serving the API in that mode
- Two leader-election Leases: `ark-apiserver-leader` (for the WAL consumer singleton) and `ark-controller-leader` (for the reconciler loop)
- `ark-apiserver` Service selector flips to `app.kubernetes.io/name=ark-apiserver` when split is enabled
- Startup ordering: `ark-controller` waits on `ark-apiserver` readiness (init container or Helm hook)
- `tools/ark-cli/src/lib/readinessChecks.ts` drops layer 5 when both Deployments exist and are Ready — the probe Model is no longer needed
- Migration path: `storage.backend=postgresql` + `deployment.split=false` (default) keeps the embedded behaviour; CI flips `deployment.split=true` first; docs/defaults follow after a release cycle of burn-in

## Capabilities

### New Capabilities
- `split-apiserver-deployment`: the aggregated API server runs as its own Deployment, distinct from the reconciler Deployment, with per-component readiness probes and independent lifecycle

### Modified Capabilities
- `postgresql-backend`: no longer implies "embedded in ark-controller" — the backend is served by the dedicated `ark-apiserver` Deployment when split is enabled

## Impact

- `ark/cmd/main.go` — `--role` flag, conditional setup paths
- `ark/cmd/apiserver/` — optional new entrypoint (or keep single binary with role flag)
- `ark/internal/apiserver/server.go` — no changes expected; already a `Manager.Runnable`
- `ark/internal/storage/postgresql/wal_consumer.go` — confirm WAL consumer belongs on the apiserver side; add leader-election within the apiserver fleet
- `ark/dist/chart/templates/manager/manager.yaml` — skip API server ports/args when `deployment.split=true`
- `ark/dist/chart/templates/apiserver/deployment.yaml` — new file, rendered only when `deployment.split=true`
- `ark/dist/chart/templates/apiserver/service.yaml` — selector flips based on split mode
- `ark/dist/chart/templates/apiserver/apiservice.yaml` — unchanged target, selector follows the Service
- `ark/dist/chart/templates/apiserver/rbac.yaml` — split RBAC: API-side gets PG secrets, controller-side drops them
- `ark/dist/chart/values.yaml` — `deployment.split` flag and per-role image/replicas/resources
- `ark/dist/chart/values.schema.json` — schema updates
- `.github/actions/setup-e2e/setup-local.sh` — add `DEPLOYMENT_SPLIT` arg and pass-through to Helm; lines 184-220 (probe Model) can be removed once split is the default
- `tools/ark-cli/src/lib/readinessChecks.ts` — when split is detected (both Deployments exist), skip `waitForControllerReconciling`; rely on `kubectl wait` against each Deployment
- `tools/ark-cli/src/arkServices.ts` — add `ark-apiserver` as a core service so layer 0 covers it automatically
- No changes to controller reconcilers, webhooks, or CRD definitions
