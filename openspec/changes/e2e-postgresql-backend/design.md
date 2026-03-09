## Context

Ark supports two deployment modes: etcd (CRD-based, default) and PostgreSQL (aggregated API server). The CI pipeline runs all E2E chainsaw tests exclusively against etcd. The PostgreSQL path is exercised only locally via `devspace dev` with the `storage-postgresql` profile. The `ark-storage-dev` Helm chart and devspace wiring already exist and work.

The three existing E2E jobs are: `e2e-tests-standard` (selector `!evaluated,!llm`), `e2e-tests-evaluated` (selector `evaluated=true`), and `e2e-tests-llm` (selector `llm=true`). Each uses the `setup-e2e` composite action which calls `setup-local.sh`.

## Goals / Non-Goals

**Goals:**
- Run all existing chainsaw E2E tests against both etcd and PostgreSQL backends
- All six jobs (3 categories x 2 backends) run in parallel
- Reuse existing `ark-storage-dev` chart for PostgreSQL deployment in CI

**Non-Goals:**
- Writing tests for PostgreSQL-specific data semantics (LISTEN/NOTIFY timing, connection pooling, PG-native features)
- Testing PostgreSQL-specific features beyond what the aggregated API server exposes
- Changing the default deployment mode
- Performance benchmarking between backends

## Decisions

### 1. Matrix strategy on storage-backend

Add `strategy.matrix.storage-backend: [etcd, postgresql]` to each of the three E2E jobs. This keeps the workflow DRY — one job definition runs twice with different backends.

Alternative: Duplicate jobs (e.g., `e2e-tests-standard-pg`). Rejected because it doubles the YAML and creates maintenance burden.

### 2. Parameterize setup-e2e action

Add a `storage-backend` input (default: `etcd`) to the `setup-e2e` composite action and forward it to `setup-local.sh` as `--storage-backend <value>`.

### 3. PostgreSQL setup in setup-local.sh

When `--storage-backend postgresql`:
1. Install `ark-storage-dev` Helm chart in `ark-system` namespace (deploys PostgreSQL 16-alpine)
2. Wait for PostgreSQL pod readiness
3. Pass additional `--set` values to the ark-controller Helm install:
   - `storage.backend=postgresql`
   - `storage.postgresql.host=ark-storage-dev`
   - `storage.postgresql.port=5432`
   - `storage.postgresql.database=ark`
   - `storage.postgresql.user=postgres`
   - `storage.postgresql.passwordSecretName=ark-storage-dev-password`

These values mirror the existing devspace `storage-postgresql` profile.

### 4. Job naming includes backend

Use `name: E2E Standard (${{ matrix.storage-backend }})` so CI output clearly shows which backend failed.

### 5. CRD installation is handled by the Helm chart

The ark-controller Helm chart already conditionally skips CRDs when `storage.backend != "etcd"` (see `_helpers.tpl:71`). No special handling needed.

## Risks / Trade-offs

- **[CI time/cost doubles for E2E]** → Acceptable since jobs run in parallel. Total wall-clock time unchanged. GitHub-hosted runner cost increases.
- **[PostgreSQL startup adds ~30s to setup]** → Minimal impact. The `helm install --wait` handles readiness.
- **[Flaky PostgreSQL pod in CI]** → Mitigated by `--wait --timeout` on helm install. The `ark-storage-dev` chart uses a simple single-pod deployment with no complex dependencies.
- **[Tests that assume etcd-specific behavior]** → Investigation shows no chainsaw tests reference Ark CRDs directly. Only `prometheus-tls-config` touches CRDs (cert-manager, not Ark).
- **[LISTEN/NOTIFY latency vs etcd watches]** → etcd watches are native to Kubernetes; PostgreSQL watches are synthesized over LISTEN/NOTIFY with a different latency profile. Chainsaw asserts with tight timeouts may pass consistently on etcd but flake on PostgreSQL due to event delivery timing, not feature breakage. If PG matrix jobs show intermittent failures, investigate watch notification latency before assuming a regression.
- **[Silent fallback to etcd]** → If the `storage.backend=postgresql` Helm value is dropped or misspelled, tests pass against etcd and give false confidence. A post-deploy verification step is required to confirm the controller is actually running with the PostgreSQL backend.
