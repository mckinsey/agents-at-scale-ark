## Why

The optional aggregated PostgreSQL apiserver backend (`ark/internal/storage/postgresql`) manages its schema by running idempotent, forward-only DDL on **every pod startup** (`initSchema()` in `postgresql.go`). There is no version-tracking table, no rollback, and changes are bolted on via inline `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. This creates three operability and security problems (issue #2682, P2):

- **No upgrade-safety contract.** During rolling upgrades old and new apiserver pods run against the same database with nothing defining whether they can safely coexist, and no recorded schema version to reason about.
- **Over-privileged runtime role.** Because schema setup runs on every startup, the runtime DB role permanently holds DDL + `REPLICATION` privileges — a least-privilege violation.
- **No storage-version marker.** The `resources` table carries no `api_version` column, so stored rows have no version marker and there is no mechanism for future staged storage-version migrations.

The default etcd/CRD backend is not affected by any of this.

## What Changes

- Introduce a **tracked, versioned schema-migration mechanism**: ordered migrations recorded in a version table, replacing the inline `initSchema()` DDL. The existing schema becomes the baseline migration (no data loss, no behavior change for existing databases).
- **Separate schema changes from the runtime path.** DDL is applied by a distinct privileged step (a migration runner Job / init container). The apiserver runtime no longer executes DDL and connects with a least-privilege role (DML + `REPLICATION` only). **BREAKING** for operators who provisioned a single all-privileges DB role: a separate privileged migration role is now required (default dev setup updated accordingly).
- Define a **version-skew / compatibility contract**: the runtime asserts the database is at an expected schema version on startup and fails fast on incompatible skew, and migrations follow expand/contract rules so mixed old/new pods can coexist during a rollout. A documented rollback path is included.
- **Record a per-row storage/API version** (`api_version` column on `resources`) to enable future read-old / convert / write-new migrations.

## Capabilities

### New Capabilities
- `postgresql-schema-migrations`: Versioned, tracked schema migrations for the PostgreSQL storage backend — migration recording and ordering, separation of DDL from the runtime path with least-privilege runtime role, runtime version-skew assertion and rollout compatibility contract, and the per-row storage-version marker.

### Modified Capabilities
- `e2e-postgresql-setup`: The PostgreSQL dev/e2e setup path SHALL run the migration step (privileged role) before starting the apiserver, and the controller SHALL connect with the least-privilege runtime role. (Delta: setup now provisions two roles and applies migrations as a distinct step.)

## Impact

- **Code**: `ark/internal/storage/postgresql/postgresql.go` (`initSchema()` removed from runtime startup; version assertion added), new migration source (embedded migration files + runner), `ark/go.mod` (new migration library dependency).
- **Dependencies**: adds a Go migration library (candidate: `pressly/goose`; evaluated in design). Existing stack is `jackc/pgx/v5` + `lib/pq` + `pglogrepl`.
- **Deployment**: ark-controller Helm chart and `ark-storage-dev` chart — migration Job / init container, two DB roles (privileged migrator, least-privilege runtime), connection-string wiring.
- **Operators**: upgrade runbook for the role split and rollback path; version-skew behavior during rolling upgrades.
- **Tests**: migration apply/record/rollback, simulated rolling-upgrade skew, least-privilege runtime role, per-row storage-version migration without data loss; confirm the etcd backend is unaffected.
