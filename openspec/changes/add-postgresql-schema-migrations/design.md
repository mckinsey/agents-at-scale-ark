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

### Decision 1: Migration library — `golang-migrate` (dedicated CLI image)
Use `golang-migrate` packaged as a dedicated `ark-controller-migrate` image (`FROM migrate/migrate`, SQL files baked in at `/migrations`), run by the migration hook Job. The controller binary carries no migration library.

- **Why golang-migrate, and why the image:** consistency with `ark-broker`, which already ships a `migrate/migrate`-based `Dockerfile.migrate` and applies `NNNNNN_name.up.sql`/`.down.sql` pairs. Using the same tool, file layout, and packaging across the two Postgres-backed components keeps the operational story uniform. The baseline DDL (`DO $$ ... CREATE PUBLICATION ... $$`, trigger drops, partial unique indexes) runs fine as a single statement under golang-migrate's postgres driver, so no custom delimiters are needed.
- **Dirty flag:** golang-migrate marks `schema_migrations.dirty` on a failed migration; the runtime refuses to start against a dirty schema, and the operator resolves it with `force`/`goto`. The baseline being idempotent makes a re-run safe.
- **Why not `pressly/goose`:** functionally fine (and was the first cut), but it is a second migration tool in the repo; the broker's golang-migrate is the established convention.
- **Alternatives considered:** keep bespoke versioning in `storage_metadata` — rejected; reimplements a solved problem (ordering, recording, CLI) with no rollback story.

### Decision 2: Baseline migration adopts existing databases idempotently
Migration `000001_baseline` is the **current `initSchema()` body verbatim**, keeping all `IF NOT EXISTS` guards. On a fresh DB it builds the schema; on an already-deployed DB every statement is a no-op and golang-migrate records version 1 in `schema_migrations`. This makes adoption automatic with no separate baselining command. Migration `000002_api_version` is **also idempotent** (`ADD COLUMN IF NOT EXISTS`): when golang-migrate adopts an unversioned database it replays from version 0, so every migration — not just the baseline — must tolerate objects that already exist. This matters at the goose→golang-migrate switchover, where a database migrated by the earlier goose build already has `api_version` but no `schema_migrations` table; the idempotent `000002` adopts it cleanly instead of failing on a duplicate column. Each migration is a `*.up.sql`/`*.down.sql` pair, matching the broker.

- **Alternative considered:** `force`-stamping an existing DB at a baseline version without running the idempotent DDL — rejected; the idempotent-baseline approach needs no operator intervention and no branching on "is this a new or existing DB".

### Decision 3: DDL runs in a Helm hook Job with a privileged role; runtime drops DDL
A `pre-install`/`pre-upgrade` Helm hook Job runs the `ark-controller-migrate` image (`migrate ... up`) using a **migrator role** that owns the tables and publication. The apiserver `New()` no longer calls `initSchema()`; it connects with the **runtime role** (DML + `REPLICATION` only).

- The publication `ark_cdc` moves into a migration (owner-level DDL). The replication **slot** stays runtime-created — slot creation needs only `REPLICATION`, which the runtime role keeps.
- **Why a Helm hook Job over an init container:** migrations must run once per upgrade, not once per replica; a hook Job gates the rollout (chart upgrade fails if migrations fail) and centralizes the privileged credential in one short-lived pod rather than every apiserver pod.
- **Alternative considered:** init container on the apiserver Deployment — rejected; runs N times across replicas, and would require the privileged credential to be mounted into the runtime pod.

### Decision 4: Version-skew contract via compiled-in expected version + expand/contract
The binary carries `expectedSchemaVersion` (highest shipped migration) and `minCompatibleSchemaVersion`. On startup the runtime reads golang-migrate's recorded version from `schema_migrations` and:
- **DB version < `minCompatibleSchemaVersion`** → fail fast (the DB is too old for this binary; migrate first).
- **DB version > `expectedSchemaVersion`** → allowed only if the newer migrations are within the declared expand/contract window (additive, backward-compatible); this is what lets an old pod keep running after the migration Job has advanced the schema ahead of the not-yet-upgraded replicas.
- Migrations follow **expand/contract**: additive/backward-compatible changes (new nullable columns, new indexes) in the expand phase; destructive changes (drop column) only in a later release once no running binary depends on them. `minCompatibleSchemaVersion` encodes that window.

- **Why compiled-in constants:** the compatibility window is a property of the code that reads the schema, so it belongs with the binary, not in config.

## Risks / Trade-offs

- **Partial migration failure mid-rollout** → Helm hook Job failure aborts the upgrade before new runtime pods start; golang-migrate marks the schema `dirty` and the runtime refuses to start against it. Expand-only migrations are safe to re-run after clearing dirty (`force`/`goto`); the idempotent baseline tolerates a re-run. Forward-fix is the default; `migrate down`/`goto` is operator-initiated and documented.
- **Operator provisioned a single all-privileges DB role (BREAKING)** → ship the two-role split in the `ark-storage-dev` chart defaults, document the migrator/runtime split in the upgrade runbook, and have the runtime fail fast with a clear error if it is handed DDL-capable credentials-that-also-lack-REPLICATION or an unmigrated DB.
- **Concurrent migration Jobs** → Helm runs one hook Job; golang-migrate also takes a Postgres advisory lock for the run, serializing any accidental concurrency. Removes the need for the old `schemaInitLockKey`.
- **Runtime still needs `REPLICATION`** → cannot reach pure DML least-privilege; this is inherent to the CDC/WAL design. Documented as the floor for the runtime role.
- **New dependency surface** → golang-migrate is a prebuilt image (no Go dependency added to the controller) and the same tool the broker already uses; scoped to the optional backend only.

## Migration Plan

1. Add golang-migrate `*.up.sql`/`*.down.sql` pairs; `000001_baseline` = current idempotent `initSchema()` DDL (including `ark_cdc` publication ownership); `000002_api_version` = `ALTER TABLE resources ADD COLUMN api_version TEXT` (+ backfill default).
2. Add `ark/Dockerfile.migrate` (`FROM migrate/migrate`) baking in `/migrations`; build/push it as `ark-controller-migrate`.
3. Remove `initSchema()` from `New()`; add the startup version-skew assertion reading `schema_migrations`.
4. Chart: add the `pre-install`/`pre-upgrade` migration hook Job running the migrate image + migrator role; switch the controller Deployment to the runtime role. Update `ark-storage-dev` dev chart with both roles.
5. Deploy order (existing DB): hook Job runs `000001` (no-op adoption, records v1) then `000002`; then runtime pods roll with the runtime role.
6. **Rollback:** expand/contract means prefer forward-fix. If required, scale down, run the migrate image's `goto <version>` (or `down`) with the migrator role, redeploy the prior image. Destructive `down` steps are only defined where safe.

## Open Questions

- Exact initial values of `minCompatibleSchemaVersion` relative to the first shipped release (does the first migrated release accept only v2, or also tolerate a v1 DB during the rollout window?). Deferrable: it is a constant tunable at implementation time and does not change the specs or task breakdown.
