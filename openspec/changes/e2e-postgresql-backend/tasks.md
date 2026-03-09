## 1. Setup Script

- [ ] 1.1 Add `--storage-backend` flag parsing to `setup-local.sh` (default: `etcd`, accept `postgresql`)
- [ ] 1.2 When `postgresql`, install `ark-storage-dev` Helm chart in `ark-system` namespace with `--wait --timeout=120s`
- [ ] 1.3 When `postgresql`, wait for PostgreSQL pod readiness
- [ ] 1.4 When `postgresql`, add `--set storage.backend=postgresql` and PostgreSQL connection `--set` values to the ark-controller `helm upgrade --install` command

## 2. Backend Verification

- [ ] 2.1 After ark-controller starts with `--storage-backend postgresql`, verify the controller is actually using the PostgreSQL backend (e.g., grep controller pod logs for storage backend confirmation or check a diagnostic endpoint)
- [ ] 2.2 Fail the setup step if the verification check does not confirm PostgreSQL is active

## 3. Composite Action

- [ ] 3.1 Add `storage-backend` input to `setup-e2e/action.yml` with default `etcd`
- [ ] 3.2 Forward the input to `setup-local.sh` as `--storage-backend ${{ inputs.storage-backend }}`

## 4. CI Workflow

- [ ] 4.1 Add `strategy.matrix.storage-backend: [etcd, postgresql]` to `e2e-tests-standard` job
- [ ] 4.2 Add `strategy.matrix.storage-backend: [etcd, postgresql]` to `e2e-tests-evaluated` job
- [ ] 4.3 Add `strategy.matrix.storage-backend: [etcd, postgresql]` to `e2e-tests-llm` job
- [ ] 4.4 Pass `storage-backend: ${{ matrix.storage-backend }}` to `setup-e2e` action in all three jobs
- [ ] 4.5 Update job names to include backend: e.g., `E2E Standard (${{ matrix.storage-backend }})`

## 5. Follow-up: Aggregation Smoke Test

- [ ] 5.1 Write a basic aggregation plumbing smoke test that exercises API discovery via the aggregated path, watch routing, and a storage round-trip — ensuring the aggregation layer itself is covered beyond what existing etcd-oriented tests exercise
