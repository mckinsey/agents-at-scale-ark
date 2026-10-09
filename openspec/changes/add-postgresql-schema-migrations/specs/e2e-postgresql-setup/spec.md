## ADDED Requirements

### Requirement: Setup applies schema migrations before starting the controller
When deploying with `--storage-backend postgresql`, the setup SHALL apply schema migrations (using the privileged migration role) before the ark-controller runtime starts, and SHALL fail the setup if migrations do not complete successfully.

#### Scenario: Migrations run before the controller serves traffic
- **WHEN** `setup-local.sh` is invoked with `--storage-backend postgresql`
- **THEN** the schema migration step SHALL complete successfully before the ark-controller runtime pods become ready
- **AND** the recorded schema version SHALL match the deployed controller build

#### Scenario: Migration failure fails the setup
- **WHEN** the schema migration step fails
- **THEN** the setup SHALL fail with a clear error
- **AND** SHALL NOT report a successful PostgreSQL deployment

## MODIFIED Requirements

### Requirement: PostgreSQL connection values match ark-storage-dev defaults
The PostgreSQL connection values passed to the ark-controller Helm chart SHALL match the `ark-storage-dev` chart's defaults. The dev chart SHALL provision two roles — a privileged migration role used by the migration step and a least-privilege runtime role (row read/write plus `REPLICATION`, no DDL) used by the controller runtime — and the controller runtime SHALL be configured with the runtime role.

#### Scenario: Connection values are consistent
- **WHEN** `--storage-backend postgresql` is used
- **THEN** the following values SHALL be set on the ark-controller install:
  - `storage.postgresql.host=ark-storage-dev`
  - `storage.postgresql.port=5432`
  - `storage.postgresql.database=ark`
- **AND** the controller runtime SHALL connect using the least-privilege runtime role
- **AND** the migration step SHALL use the privileged migration role

#### Scenario: Runtime role is least-privilege
- **WHEN** the ark-controller runtime connects to PostgreSQL
- **THEN** it SHALL use a role that can read/write rows and hold `REPLICATION`
- **AND** that role SHALL NOT hold DDL or schema-ownership privileges
