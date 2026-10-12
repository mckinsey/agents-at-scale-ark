## Context

See `proposal.md` - Why. The PostgreSQL backend's schema is created by `initSchema()` (`ark/internal/storage/postgresql/postgresql.go:355`), executed inside `New()` on every pod startup under advisory lock `schemaInitLockKey`. Relevant current behavior that constrains the design:

- The DDL block creates the `resources` and `storage_metadata` tables, several indexes, and the `ark_cdc` publication, using `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` throughout.
- The runtime **creates and consumes a logical replication slot** (`ensureReplicationSlot`, `wal_connection.go:132`; `StartReplication`, `wal_connection.go:72`) and writes `storage_metadata` rows (`watch_purge_floor`, max RV). Slot creation requires `REPLICATION`; publication creation requires table ownership (DDL).
- Existing deployed databases already have the full schema but no version-tracking table, so any migration framework must *adopt* them without re-creating objects or losing data.
- Stack is `jackc/pgx/v5` + `lib/pq` + `pglogrepl`; no migration library present.

## Goals / Non-Goals

**Goals:**
- Replace startup DDL with ordered, recorded migrations applied by a distinct privileged step.
- Runtime connects with a least-privilege role (DML + `REPLICATION`, no DDL/ownership) and asserts schema compatibility on startup.
- Define an expand/contract compatibility window so mixed old/new pods coexist during a rollout, with a documented rollback path.
- Add an `api_version` column to `resources` as the storage-version marker.
- Zero-downtime, no-data-loss adoption of already-deployed PostgreSQL databases.

**Non-Goals:**
- Changing the etcd/CRD default backend in any way.
- Implementing an actual storage-version conversion (read-old/convert/write-new). This change only lays the marker column and the version-skew machinery; conversions are future work.
- Automatic `down` migrations in production. Rollback is expand/contract + explicit operator action, not auto-revert.

## Decisions

### Decision 1: Migration library — `pressly/goose` (as a library, embedded)
Use `goose` via its Go API with migrations embedded in the controller binary (`//go:embed` + `goose.SetBaseFS`), run through pgx/v5's `stdlib` driver.

- **Why goose over `golang-migrate`:** our baseline DDL contains `DO $$ ... CREATE PUBLICATION ... $$` blocks, trigger drops, and partial unique indexes. Goose supports Go migrations and custom statement delimiters (`-- +goose StatementBegin/End`) and does not get stuck on a "dirty" flag the way golang-migrate does after a partial failure. Goose also has a built-in session/advisory lock to serialize concurrent runners, replacing our hand-rolled `schemaInitLockKey`.
- **Why not `ariga/atlas`:** declarative schema-as-code is a different mental model and heavier operational surface than this single optional backend warrants.
- **Why not `jackc/tern`:** smaller ecosystem, SQL-only; goose's Go-migration escape hatch is worth the larger dependency.
- **Alternatives considered:** keep bespoke versioning in `storage_metadata` — rejected; reimplements a solved problem (ordering, locking, recording, CLI) with no rollback story.

### Decision 2: Baseline migration adopts existing databases idempotently
Migration `00001` is the **current `initSchema()` body verbatim**, keeping all `IF NOT EXISTS` guards. On a fresh DB it builds the schema; on an already-deployed DB every statement is a no-op and goose records version 1. This makes adoption automatic with no separate baselining command. Migrations `00002+` (e.g. the `api_version` column) are written strictly (no `IF NOT EXISTS`) since they only ever run against a DB known to be at a prior tracked version.

- **Alternative considered:** `goose up-to 0 --no-versioning` style stamping — rejected; the idempotent-baseline approach needs no operator intervention and no branching on "is this a new or existing DB".

### Decision 3: DDL runs in a Helm hook Job with a privileged role; runtime drops DDL
A `pre-install`/`pre-upgrade` Helm hook Job runs the controller image with a `migrate` subcommand (`ark migrate up`) using a **migrator role** that owns the tables and publication. The apiserver `New()` no longer calls `initSchema()`; it connects with the **runtime role** (DML + `REPLICATION` only).

- The publication `ark_cdc` moves into a migration (owner-level DDL). The replication **slot** stays runtime-created — slot creation needs only `REPLICATION`, which the runtime role keeps.
- **Why a Helm hook Job over an init container:** migrations must run once per upgrade, not once per replica; a hook Job gates the rollout (chart upgrade fails if migrations fail) and centralizes the privileged credential in one short-lived pod rather than every apiserver pod.
- **Alternative considered:** init container on the apiserver Deployment — rejected; runs N times across replicas, and would require the privileged credential to be mounted into the runtime pod.

### Decision 4: Version-skew contract via compiled-in expected version + expand/contract
The binary carries `expectedSchemaVersion` (highest embedded migration) and `minCompatibleSchemaVersion`. On startup the runtime reads goose's recorded version and:
- **DB version < `minCompatibleSchemaVersion`** → fail fast (the DB is too old for this binary; migrate first).
- **DB version > `expectedSchemaVersion`** → allowed only if the newer migrations are within the declared expand/contract window (additive, backward-compatible); this is what lets an old pod keep running after the migration Job has advanced the schema ahead of the not-yet-upgraded replicas.
- Migrations follow **expand/contract**: additive/backward-compatible changes (new nullable columns, new indexes) in the expand phase; destructive changes (drop column) only in a later release once no running binary depends on them. `minCompatibleSchemaVersion` encodes that window.

- **Why compiled-in constants:** the compatibility window is a property of the code that reads the schema, so it belongs with the binary, not in config.

## Risks / Trade-offs

- **Partial migration failure mid-rollout** → Helm hook Job failure aborts the upgrade before new runtime pods start; expand-only migrations are safe to retry (goose records per-migration success). Forward-fix is the default; `goose down` is operator-initiated and documented.
- **Operator provisioned a single all-privileges DB role (BREAKING)** → ship the two-role split in the `ark-storage-dev` chart defaults, document the migrator/runtime split in the upgrade runbook, and have the runtime fail fast with a clear error if it is handed DDL-capable credentials-that-also-lack-REPLICATION or an unmigrated DB.
- **Goose advisory lock vs multiple concurrent migration Jobs** → Helm runs one hook Job; goose's session lock serializes any accidental concurrency. Removes the need for `schemaInitLockKey`.
- **Runtime still needs `REPLICATION`** → cannot reach pure DML least-privilege; this is inherent to the CDC/WAL design. Documented as the floor for the runtime role.
- **New dependency surface** → goose is widely used and pgx-compatible; scoped to the optional backend only.

## Migration Plan

1. Add goose + embedded migrations; `00001` = current idempotent `initSchema()` DDL; `00002` = `ALTER TABLE resources ADD COLUMN api_version TEXT` (+ backfill default) and move `ark_cdc` publication ownership assertions.
2. Add `ark migrate up` subcommand to the controller image.
3. Remove `initSchema()` from `New()`; add the startup version-skew assertion.
4. Chart: add the `pre-install`/`pre-upgrade` migration hook Job + migrator role; switch the controller Deployment to the runtime role. Update `ark-storage-dev` dev chart with both roles.
5. Deploy order (existing DB): hook Job runs `00001` (no-op adoption, records v1) then `00002`; then runtime pods roll with the runtime role.
6. **Rollback:** expand/contract means prefer forward-fix. If required, scale down, run `ark migrate down-to <version>` with the migrator role, redeploy the prior image. Destructive `down` steps are only defined where safe.

## Open Questions

- Exact initial values of `minCompatibleSchemaVersion` relative to the first shipped release (does the first migrated release accept only v2, or also tolerate a v1 DB during the rollout window?). Deferrable: it is a constant tunable at implementation time and does not change the specs or task breakdown.
