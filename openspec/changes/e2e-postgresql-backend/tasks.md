## 1. Setup Script

- [ ] 1.1 Add `--storage-backend` flag parsing to `setup-local.sh` (default: `etcd`, accept `postgresql`)
- [ ] 1.2 When `postgresql`, install `ark-storage-dev` Helm chart in `ark-system` namespace with `--wait --timeout=120s`
- [ ] 1.3 When `postgresql`, wait for PostgreSQL pod readiness
- [ ] 1.4 When `postgresql`, add `--set storage.backend=postgresql` and PostgreSQL connection `--set` values to the ark-controller `helm upgrade --install` command

## 2. Composite Action

- [ ] 2.1 Add `storage-backend` input to `setup-e2e/action.yml` with default `etcd`
- [ ] 2.2 Forward the input to `setup-local.sh` as `--storage-backend ${{ inputs.storage-backend }}`

## 3. CI Workflow

- [ ] 3.1 Add `strategy.matrix.storage-backend: [etcd, postgresql]` to `e2e-tests-standard` job
- [ ] 3.2 Add `strategy.matrix.storage-backend: [etcd, postgresql]` to `e2e-tests-evaluated` job
- [ ] 3.3 Add `strategy.matrix.storage-backend: [etcd, postgresql]` to `e2e-tests-llm` job
- [ ] 3.4 Pass `storage-backend: ${{ matrix.storage-backend }}` to `setup-e2e` action in all three jobs
- [ ] 3.5 Update job names to include backend: e.g., `E2E Standard (${{ matrix.storage-backend }})`
