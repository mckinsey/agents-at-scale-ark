## 1. Operator binary

- [ ] 1.1 Add `--role={combined,apiserver,controller}` flag to `ark/cmd/main.go`, default `combined`
- [ ] 1.2 Skip `setupEmbeddedApiserver()` when role is `controller`; skip reconciler/webhook setup when role is `apiserver`
- [ ] 1.3 Scope leader-election Lease names per role (`ark-apiserver-leader`, `ark-controller-leader`)
- [ ] 1.4 In `apiserver` role, leader-elect the WAL consumer within the apiserver replica set; non-leaders skip WAL setup but continue to serve reads
- [ ] 1.5 Add health endpoints: `/readyz` on apiserver returns 200 when PG connected and API serving; on controller returns 200 when informers synced and at least one reconcile has completed
- [ ] 1.6 Unit tests for role dispatch and leader-election scoping

## 2. Helm chart

- [ ] 2.1 Add `deployment.split` boolean to `ark/dist/chart/values.yaml` (default `false`) and schema
- [ ] 2.2 Render `ark-apiserver` Deployment from `ark/dist/chart/templates/apiserver/deployment.yaml` when `deployment.split=true`
- [ ] 2.3 Flip `ark-apiserver` Service selector to `app.kubernetes.io/name=ark-apiserver` when `deployment.split=true`; keep pointing to controller pods otherwise
- [ ] 2.4 Omit apiserver args/ports from `ark-controller` Deployment when `deployment.split=true`
- [ ] 2.5 Add init container `wait-for-apiserver` on `ark-controller` when `deployment.split=true`
- [ ] 2.6 Add Helm post-install hook that blocks on `APIService v1alpha1.ark.mckinsey.com` condition `Available=True`
- [ ] 2.7 Split RBAC: apiserver ServiceAccount gets PG secret access; controller ServiceAccount drops it
- [ ] 2.8 Chart template unit tests (`helm template` snapshot) for combined and split modes

## 3. E2E setup

- [ ] 3.1 Add `--deployment-split` arg to `.github/actions/setup-e2e/setup-local.sh`; pass through to Helm
- [ ] 3.2 Add E2E matrix leg that runs PostgreSQL backend with `deployment-split=true`
- [ ] 3.3 Once split-mode E2E is green across a release cycle, remove `setup-local.sh:184-220` (probe Model check) and rely on per-Deployment `kubectl wait`

## 4. CLI readiness checks

- [ ] 4.1 Add `ark-apiserver` to `tools/ark-cli/src/arkServices.ts` as a core service (gated on split detection)
- [ ] 4.2 In `readinessChecks.ts`, detect split by checking for `deployment/ark-apiserver` in `ark-system`
- [ ] 4.3 When split is detected, skip `waitForControllerReconciling` (probe Model) — layer 0 covers it
- [ ] 4.4 Unit tests for split detection and probe-skip behaviour
- [ ] 4.5 Remove probe Model code path entirely once combined mode is removed (tracked in §7)

## 5. Migration and documentation

- [ ] 5.1 Release notes section explaining split vs combined, when to use each, how to upgrade
- [ ] 5.2 `helm upgrade` integration test: combined → split on a live cluster with existing Ark resources, assert zero data loss
- [ ] 5.3 Document `--role` flag and `deployment.split` value in `docs/`
- [ ] 5.4 Update `SIMPLE-ARCHITECTURE-GUIDE.md` and `ARK-ARCHITECTURE.md` to reflect the two-deployment topology

## 6. Performance validation

- [ ] 6.1 Benchmark write latency (reconciler → status) on combined vs split, same cluster, 100 and 1 000 Models reconciling in parallel
- [ ] 6.2 Benchmark read latency for API consumers (e.g., `ark list agents` on a 10 k-resource cluster)
- [ ] 6.3 If write latency regression exceeds a threshold (TBD, e.g. 50 ms p99), investigate in-cluster network / APIService proxy overhead before promoting split to default

## 7. Promote split to default and remove combined

- [ ] 7.1 After a release cycle of CI burn-in with `deployment.split=true`, flip the default in `values.yaml`
- [ ] 7.2 Mark `--role=combined` as deprecated in release notes
- [ ] 7.3 After one further release cycle, remove the `combined` role code path
- [ ] 7.4 Remove the probe Model code path from `readinessChecks.ts` and `setup-local.sh` entirely
