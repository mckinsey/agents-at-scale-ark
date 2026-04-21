## 1. Operator binary

- [ ] 1.1 Add required `--role={apiserver,controller}` flag to `ark/cmd/main.go`; fail to start with a clear error if the flag is missing
- [ ] 1.2 In `apiserver` role, run `setupEmbeddedApiserver` plus the WAL consumer (leader-elected); skip all reconciler, webhook, and non-apiserver Manager runnables
- [ ] 1.3 In `controller` role, run reconcilers and webhooks; do not call `setupEmbeddedApiserver`; use a plain k8s client for aggregated API access
- [ ] 1.4 Scope leader-election Lease names per role (`ark-apiserver-leader`, `ark-controller-leader`)
- [ ] 1.5 Non-leader replicas in `apiserver` role serve read traffic without opening a PG replication slot
- [ ] 1.6 Add health endpoints: `/readyz` on apiserver returns 200 when PG connected and API serving; on controller returns 200 when informers synced and at least one reconcile has completed
- [ ] 1.7 Unit tests for role dispatch, leader-election scoping, and the non-leader-skips-WAL path

## 2. Helm charts

### ark-controller chart (`ark/dist/chart`)

- [ ] 2.1 Drop apiserver args/ports from the controller Deployment; add `--role=controller` arg
- [ ] 2.2 Add init container `wait-for-apiserver` that runs `kubectl wait apiservice v1alpha1.ark.mckinsey.com --for=condition=Available --timeout=5m`
- [ ] 2.3 Remove apiserver-related values from `values.yaml` and schema; the controller chart no longer knows about the apiserver
- [ ] 2.4 Remove APIService CR, `ark-apiserver` Service, and apiserver RBAC from this chart — they move to the new chart
- [ ] 2.5 Chart template unit tests (`helm template` snapshot) covering etcd and postgresql topologies

### ark-apiserver chart (new, `ark/dist/chart-apiserver`)

- [ ] 2.6 Scaffold `ark/dist/chart-apiserver/` with `Chart.yaml` (name `ark-apiserver`), `values.yaml`, `values.schema.json`, `templates/`
- [ ] 2.7 `templates/deployment.yaml` — runs `--role=apiserver`; image, replicas, resources from values; leader-election enabled via `ark-apiserver-leader` Lease
- [ ] 2.8 `templates/service.yaml` — name `ark-apiserver` (stable, matches today's Service name); selector `app.kubernetes.io/name=ark-apiserver`
- [ ] 2.9 `templates/apiservice.yaml` — `APIService` `v1alpha1.ark.mckinsey.com` targeting the Service; ownership migrates from the controller chart via Helm annotation takeover (`helm.sh/resource-policy: keep` on the controller side during transition, or a one-time manual `kubectl apply` documented in the upgrade notes)
- [ ] 2.10 `templates/rbac.yaml` — ServiceAccount, ClusterRole/Binding with PG secret access; no reconciler permissions
- [ ] 2.11 Chart template unit tests (`helm template` snapshot)
- [ ] 2.12 Release-process update: the apiserver chart is released on the same cadence as the controller chart, version-aligned per release

### Install/upgrade integration

- [ ] 2.13 Update `scripts/deploy/deploy-controller.sh` (and any other deploy scripts) to install `ark-apiserver` first, then `ark-controller`, on postgresql; install only `ark-controller` on etcd
- [ ] 2.14 Update `devspace.yaml` to depend on / deploy both charts in the correct order for local development
- [ ] 2.15 Document the APIService ownership handover for the transition release (existing installs have the APIService owned by the controller chart; first upgrade hands it to the apiserver chart)

## 3. E2E setup

- [ ] 3.1 Strip `.github/actions/setup-e2e/setup-local.sh` lines 132-220 (API-group poll / aggregated-API warmup / probe Model); rely on `kubectl wait` on `ark-apiserver` and `ark-controller` Deployments
- [ ] 3.2 Update the existing `postgresql` E2E matrix leg to use the split-mode chart values (no new matrix entry — the split becomes the only topology)
- [ ] 3.3 Add an upgrade-in-place E2E job: seed a PostgreSQL cluster on the previous release, run `helm upgrade` to this release, assert Agent/Model/Query resources remain reachable and reconciling throughout

## 4. CLI readiness checks

- [ ] 4.1 Add `ark-apiserver` to `tools/ark-cli/src/arkServices.ts` as a core service (PostgreSQL backend only)
- [ ] 4.2 In `readinessChecks.ts`, delete `waitForControllerReconciling`, the probe Model manifest, and the `ark-readiness-probe` namespace handling
- [ ] 4.3 In `readinessChecks.ts`, detect backend from CRD presence as today; on PostgreSQL, layer 0 covers both `ark-apiserver` and `ark-controller` via the existing `waitForServicesReady` path
- [ ] 4.4 Update `readinessChecks.spec.ts` — remove probe-Model tests, add tests for `ark-apiserver` inclusion in core services
- [ ] 4.5 Remove the `--readiness-stable-count` / N=10 aggregated-API probe — per-Deployment `Ready` is now sufficient. Keep the APIService and API-group checks as integration sanity

## 5. Migration and documentation

- [ ] 5.1 Release notes section explaining the topology change, the automated Helm upgrade path, and how to verify post-upgrade
- [ ] 5.2 Document `--role` flag and the new Deployment layout in `docs/`
- [ ] 5.3 Update `SIMPLE-ARCHITECTURE-GUIDE.md` and `ARK-ARCHITECTURE.md` to reflect two Deployments on PostgreSQL / one on etcd
- [ ] 5.4 Explicit callout in release notes that `ark-controller` logs no longer contain aggregated API server log lines on PostgreSQL — operators should check `ark-apiserver` pods

## 6. Performance validation

- [ ] 6.1 Benchmark write latency (reconciler → status) before and after the split, same cluster, 100 and 1 000 Models reconciling in parallel
- [ ] 6.2 Benchmark read latency for API consumers (e.g., `ark list agents` on a 10 k-resource cluster)
- [ ] 6.3 If write latency regression exceeds a threshold (TBD, e.g. 50 ms p99), investigate in-cluster network / APIService proxy overhead before releasing
- [ ] 6.4 Record baseline numbers in the PR description so future regressions are detectable
