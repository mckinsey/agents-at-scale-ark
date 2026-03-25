## Why

Chainsaw E2E tests only run against the etcd (CRD-based) deployment mode. Ark supports a PostgreSQL-backed aggregated API server mode that uses a fundamentally different storage and API routing path. Without E2E coverage, regressions in the PostgreSQL backend go undetected until manual testing or production.

## What Changes

- Add `storage-backend` matrix (`etcd`, `postgresql`) to all three CI E2E jobs (`e2e-tests-standard`, `e2e-tests-evaluated`, `e2e-tests-llm`)
- Extend `setup-e2e` composite action with a `storage-backend` input
- Extend `setup-local.sh` to install `ark-storage-dev` (PostgreSQL) and configure the ark-controller Helm values when `--storage-backend postgresql` is specified
- All six resulting jobs (3 test categories x 2 backends) run in parallel

## Capabilities

### New Capabilities
- `e2e-postgresql-setup`: CI infrastructure to deploy and configure Ark with the PostgreSQL aggregated API server backend for E2E testing

### Modified Capabilities

## Impact

- `.github/actions/setup-e2e/action.yml` — new input parameter
- `.github/actions/setup-e2e/setup-local.sh` — PostgreSQL deployment and wiring logic
- `.github/workflows/cicd.yaml` — matrix strategy on the three E2E jobs
- CI resource usage roughly doubles for E2E (6 parallel jobs instead of 3)
- `charts/ark-storage-dev/` — already exists, no changes needed
