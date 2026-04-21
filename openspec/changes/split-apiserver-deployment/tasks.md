## 1. Operator binary

- [ ] 1.1 Add required `--role={apiserver,controller}` flag to `ark/cmd/main.go`; fail to start with a clear error if the flag is missing
- [ ] 1.2 In `apiserver` role, run `setupEmbeddedApiserver` plus the WAL consumer (leader-elected); skip all reconciler, webhook, and non-apiserver Manager runnables
- [ ] 1.3 In `controller` role, run reconcilers and webhooks; do not call `setupEmbeddedApiserver`; use a plain k8s client for aggregated API access
- [ ] 1.4 Scope leader-election Lease names per role (`ark-apiserver-leader`, `ark-controller-leader`)
- [ ] 1.5 Non-leader replicas in `apiserver` role serve read traffic without opening a PG replication slot
- [ ] 1.6 Add health endpoints: `/readyz` on apiserver returns 200 when PG connected and API serving; on controller returns 200 when informers synced and at least one reconcile has completed
- [ ] 1.7 Unit tests for role dispatch, leader-election scoping, and the non-leader-skips-WAL path

## 2. Helm chart

- [ ] 2.1 Rename the existing controller Deployment template to reflect its controller-only responsibility; drop apiserver args/ports from it; set `--role=controller`
- [ ] 2.2 New `ark/dist/chart/templates/apiserver/deployment.yaml` rendered when `storage.backend=postgresql`; `--role=apiserver` arg; per-replica image and resources from values
- [ ] 2.3 New `ark/dist/chart/templates/apiserver/service.yaml` with selector `app.kubernetes.io/name=ark-apiserver`, rendered when `storage.backend=postgresql`
- [ ] 2.4 `apiservice.yaml` rendered when `storage.backend=postgresql`; target the apiserver Service
- [ ] 2.5 Split RBAC: apiserver ServiceAccount gets PG secret access; controller ServiceAccount drops it
- [ ] 2.6 `templates/hooks/pre-upgrade-apiserver.yaml` — Helm pre-upgrade hook that applies the apiserver Deployment/Service, waits for `APIService v1alpha1.ark.mckinsey.com` condition `Available=True`, flips the APIService selector, then returns
- [ ] 2.7 `ark-controller` Deployment init container `wait-for-apiserver` that blocks on the APIService condition (covers pod restarts after initial upgrade)
- [ ] 2.8 Chart template unit tests (`helm template` snapshot) for etcd and postgresql backends

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
