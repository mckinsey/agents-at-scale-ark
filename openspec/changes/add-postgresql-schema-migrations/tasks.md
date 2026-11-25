## 1. Migration framework foundation

- [x] 1.1 Use golang-migrate via the `ark-controller-migrate` image (no Go migration dependency added to the controller), matching `ark-broker`
- [x] 1.2 Create migrations directory under `ark/internal/storage/postgresql/migrations/` (`*.up.sql`/`*.down.sql` pairs)
- [x] 1.3 Add `000001_baseline.up.sql`/`.down.sql` = current `initSchema()` DDL verbatim (keep all `IF NOT EXISTS` guards; include `resources`, `storage_metadata`, indexes, unique active index, and `ark_cdc` publication)
- [x] 1.4 Add `ark/Dockerfile.migrate` (`FROM migrate/migrate`) baking in `/migrations`; the migrate CLI provides `up`/`down`/`goto`

## 2. Storage-version marker and publication ownership

- [x] 2.1 Add `000002_api_version.up.sql`/`.down.sql`: `ALTER TABLE resources ADD COLUMN IF NOT EXISTS api_version TEXT` with a default, and backfill existing rows (idempotent so golang-migrate adopts an unversioned/goose-migrated DB without failing on a duplicate column)
- [x] 2.2 `ark_cdc` publication creation now lives in the baseline migration (owner-level DDL); removed from runtime with `initSchema()`
- [x] 2.3 Set `api_version` on writes in the resource write path (`Create` INSERT)

## 3. Runtime changes

- [x] 3.1 Remove `initSchema()` and the `schemaInitLockKey` DDL block from `New()` in `postgresql.go`
- [x] 3.2 Add compiled-in `expectedSchemaVersion` and `minCompatibleSchemaVersion` constants
- [x] 3.3 Add startup version-skew assertion: read recorded version from golang-migrate's `schema_migrations`, fail fast when DB is unmigrated, dirty, or below `minCompatibleSchemaVersion`, allow within the compatibility window
- [x] 3.4 Confirm runtime retains only DML + `REPLICATION` (slot creation in `wal_connection.go` still works; no DDL executed at runtime)

## 4. Migrate image

- [x] 4.1 Add `ark/Dockerfile.migrate` (`FROM migrate/migrate`) and build/push it as `ark-controller-migrate` in CI/devspace (matches `ark-broker-migrate`)
- [x] 4.2 The migrate image reads a `-database` URL built from the migration-role credentials, injected by the chart independently of the runtime role (password via `$(PGPASSWORD)`)

## 5. Helm / deployment

- [x] 5.1 Add a `pre-install`/`pre-upgrade` hook Job (`postgres-migrate-job.yaml`) running the `ark-controller-migrate` image (`migrate ... up`) with the migration role
- [x] 5.2 Deployment uses the runtime role (`postgresEnv`); e2e now sets `postgresql.user=ark_runtime`. Cleanup Job switched to the privileged migrate env (it drops the publication)
- [x] 5.3 Update `ark-storage-dev` dev chart to provision two roles (superuser/migrator + least-privilege `ark_runtime` via initdb ConfigMap with default privileges)
- [x] 5.4 `setup-local.sh` passes runtime + migration creds; the pre-install hook + `--wait` makes migrations run before the controller and fails setup on migration failure

## 6. Tests

- [x] 6.1 Fresh DB migrates to current version and records it (integration `TestSchemaVersionRecorded`; migration applied via integration `TestMain`)
- [ ] 6.2 Integration: previously-deployed DB (schema present, no version table) is adopted at baseline with no data loss, then `00002` applies — DEFERRED to CI (needs live PG)
- [ ] 6.3 Integration: partial-failure run is resumable; already-current DB is a no-op — DEFERRED to CI
- [x] 6.4 Runtime version-skew assertion covered by unit tests (`TestAssertSchemaCompatible_*`: compatible, missing table, no rows, too-old); live fail-fast on startup DEFERRED to CI
- [ ] 6.5 Integration: simulated rolling upgrade — previous-release runtime tolerates the advanced (expand) schema — DEFERRED to CI
- [ ] 6.6 Integration: runtime role without DDL privileges can serve traffic and drive the WAL slot; cannot perform DDL — DEFERRED to CI (exercised by the e2e role split)
- [x] 6.7 Integration: `api_version` is set on new rows (`TestAPIVersionColumn_SetOnWrite`)
- [x] 6.8 etcd backend path unchanged: the migration step only exists in the PostgreSQL chart/flow; etcd deploys run no migration Job

## 7. Docs and rollout

- [x] 7.1 Document the migrator/runtime role split and required grants (postgres-storage-backend.mdx requirements)
- [x] 7.2 Document the version-skew/expand-contract contract and the rollback procedure (migrate image `goto`/`down`)
- [x] 7.3 Document BREAKING note for operators using a single all-privileges role (migration values fall back to runtime creds)
- [x] 7.4 `minCompatibleSchemaVersion` fixed at 1 for the first migrated release (tolerates a v1/baseline DB during rollout)

## 8. Gates

- [x] 8.1 `make lint` (golangci-lint: 0 issues) and `make test` (31 packages ok) pass in `ark/`; `gofumpt -l` clean on changed files
