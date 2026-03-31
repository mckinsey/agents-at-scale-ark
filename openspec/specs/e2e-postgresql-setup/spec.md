## ADDED Requirements

### Requirement: setup-local.sh accepts storage-backend flag
The `setup-local.sh` script SHALL accept a `--storage-backend` flag with values `etcd` (default) or `postgresql`.

#### Scenario: Default behavior unchanged
- **WHEN** `setup-local.sh` is invoked without `--storage-backend`
- **THEN** Ark is deployed with etcd storage (existing behavior, no changes)

#### Scenario: PostgreSQL backend requested
- **WHEN** `setup-local.sh` is invoked with `--storage-backend postgresql`
- **THEN** the script SHALL install the `ark-storage-dev` Helm chart in the `ark-system` namespace
- **AND** wait for the PostgreSQL pod to be ready
- **AND** install the ark-controller Helm chart with `storage.backend=postgresql` and PostgreSQL connection values matching the `ark-storage-dev` chart defaults

### Requirement: PostgreSQL backend is verified after deploy
After deploying with `--storage-backend postgresql`, the setup script SHALL verify the controller is actually running with the PostgreSQL backend.

#### Scenario: Backend verification succeeds
- **WHEN** `setup-local.sh` completes the ark-controller install with `--storage-backend postgresql`
- **THEN** the script SHALL verify the active storage backend is PostgreSQL (e.g., by inspecting controller pod logs or a diagnostic endpoint)
- **AND** fail the setup step if the verification does not confirm PostgreSQL is active

#### Scenario: Backend verification prevents silent fallback
- **WHEN** the `storage.backend=postgresql` Helm value is dropped or misspelled
- **THEN** the verification step SHALL detect the controller is not using PostgreSQL
- **AND** fail the setup with a clear error message

### Requirement: setup-e2e action exposes storage-backend input
The `setup-e2e` composite action SHALL accept a `storage-backend` input parameter and forward it to `setup-local.sh`.

#### Scenario: Input forwarded to script
- **WHEN** the action is called with `storage-backend: postgresql`
- **THEN** `setup-local.sh` is invoked with `--storage-backend postgresql`

#### Scenario: Default value is etcd
- **WHEN** the action is called without specifying `storage-backend`
- **THEN** `setup-local.sh` is invoked without `--storage-backend` (defaults to etcd)

### Requirement: CI matrix runs E2E tests against both backends
Each of the three E2E jobs (`e2e-tests-standard`, `e2e-tests-evaluated`, `e2e-tests-llm`) SHALL use a matrix strategy with `storage-backend: [etcd, postgresql]`.

#### Scenario: All six jobs run in parallel
- **WHEN** the CI pipeline triggers E2E tests
- **THEN** six jobs are created (3 test categories x 2 storage backends)
- **AND** all six jobs run in parallel (no dependencies between matrix entries)

#### Scenario: Job names indicate backend
- **WHEN** viewing CI results
- **THEN** each job name SHALL include the storage backend (e.g., "E2E Standard (postgresql)")

#### Scenario: Same chainsaw tests run on both backends
- **WHEN** chainsaw tests execute against the postgresql backend
- **THEN** the same test selectors and configs are used as the etcd backend (no test filtering by backend)

### Requirement: PostgreSQL connection values match ark-storage-dev defaults
The PostgreSQL connection values passed to the ark-controller Helm chart SHALL match the `ark-storage-dev` chart's defaults.

#### Scenario: Connection values are consistent
- **WHEN** `--storage-backend postgresql` is used
- **THEN** the following values SHALL be set on the ark-controller install:
  - `storage.postgresql.host=ark-storage-dev`
  - `storage.postgresql.port=5432`
  - `storage.postgresql.database=ark`
  - `storage.postgresql.user=postgres`
  - `storage.postgresql.passwordSecretName=ark-storage-dev-password`
