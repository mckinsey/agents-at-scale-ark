## Purpose

Defines versioned, tracked schema management for the optional PostgreSQL storage backend so schema changes are ordered and recorded, applied under least privilege separately from the runtime, safe across rolling upgrades, and carry a per-row storage-version marker.

## ADDED Requirements

### Requirement: Schema changes are versioned and recorded
The PostgreSQL backend SHALL manage its schema through ordered, forward migrations whose applied versions are recorded in a version-tracking table in the same database. The set of applied migrations SHALL be inspectable.

#### Scenario: Fresh database is migrated to the current version
- **WHEN** the migration step runs against an empty database
- **THEN** all migrations SHALL be applied in order
- **AND** the version-tracking table SHALL record each applied migration
- **AND** the recorded version SHALL equal the highest migration shipped in that build

#### Scenario: Already-current database is a no-op
- **WHEN** the migration step runs against a database already at the current version
- **THEN** no migration SHALL be re-applied
- **AND** the step SHALL succeed without error

#### Scenario: Partial failure is recoverable
- **WHEN** a migration fails midway through a multi-migration run
- **THEN** migrations applied before the failure SHALL remain recorded as applied
- **AND** re-running the migration step SHALL resume from the first unapplied migration

### Requirement: Existing databases are adopted without data loss
The migration mechanism SHALL adopt databases provisioned by the previous startup-DDL scheme (which have the full schema but no version-tracking table) without recreating objects or deleting data.

#### Scenario: Previously-deployed database is adopted
- **WHEN** the migration step runs against a database that already contains the `resources` and `storage_metadata` tables and the `ark_cdc` publication but has no version-tracking table
- **THEN** existing tables, indexes, data, and the publication SHALL be preserved
- **AND** the baseline version SHALL be recorded as applied
- **AND** subsequent migrations SHALL apply on top of the adopted baseline

### Requirement: Schema changes are separated from the runtime path
The apiserver runtime SHALL NOT execute schema DDL on startup. Schema DDL SHALL be applied only by a distinct migration step that runs before runtime pods serve traffic.

#### Scenario: Runtime startup performs no DDL
- **WHEN** an apiserver pod starts
- **THEN** it SHALL NOT create, alter, or drop tables, indexes, or publications
- **AND** it SHALL rely on the migration step having already established the schema

#### Scenario: Migration step gates the rollout
- **WHEN** the migration step fails
- **THEN** the deployment SHALL NOT proceed to start new runtime pods against the unmigrated schema
- **AND** the failure SHALL be surfaced to the operator

### Requirement: Runtime connects with a least-privilege role
The apiserver runtime SHALL connect using a database role that holds only the privileges it needs at runtime — row-level read/write on the schema objects and `REPLICATION` — and SHALL NOT hold schema-ownership or DDL privileges. Schema DDL privileges SHALL belong to a separate migration role used only by the migration step.

#### Scenario: Runtime role cannot perform DDL
- **WHEN** the runtime role is provisioned
- **THEN** it SHALL be able to perform row read/write on `resources` and `storage_metadata`
- **AND** it SHALL retain `REPLICATION` so it can create and consume the logical replication slot
- **AND** it SHALL NOT be able to create, alter, or drop tables, indexes, or publications

#### Scenario: Migration role is distinct and privileged
- **WHEN** the migration step runs
- **THEN** it SHALL use a migration role that owns the schema objects and can apply DDL
- **AND** that role SHALL NOT be used by the runtime apiserver

### Requirement: Runtime asserts schema compatibility on startup
On startup the apiserver SHALL compare the database's recorded schema version against the version range the running binary supports, and SHALL fail fast with a clear error when the database is incompatible.

#### Scenario: Database too old for the binary
- **WHEN** the recorded schema version is below the minimum the binary supports
- **THEN** the apiserver SHALL refuse to start
- **AND** SHALL report that migrations must be applied first

#### Scenario: Compatible database starts normally
- **WHEN** the recorded schema version is within the range the binary supports
- **THEN** the apiserver SHALL start and serve traffic

#### Scenario: Unmigrated database is rejected
- **WHEN** the database has no version-tracking table or no recorded version
- **THEN** the apiserver SHALL refuse to start with a clear error rather than attempting to create the schema

### Requirement: Rolling upgrades are supported by an expand/contract contract
Migrations SHALL follow an expand/contract discipline so that, within a declared compatibility window, a runtime binary from the previous release can continue operating against a database already advanced by the migration step. Destructive changes SHALL only occur after no supported runtime binary depends on the removed structure.

#### Scenario: Old pod tolerates a newer compatible schema
- **WHEN** the migration step advances the schema with additive, backward-compatible changes and some runtime pods are still the previous release
- **THEN** those previous-release pods SHALL continue to read and write successfully
- **AND** SHALL NOT fail their startup compatibility assertion

#### Scenario: Rollback path is available
- **WHEN** an operator needs to revert to the previous release
- **THEN** a documented rollback procedure SHALL exist
- **AND** reverting the runtime binary within the compatibility window SHALL NOT require destructive schema changes

### Requirement: Stored rows carry a storage-version marker
The `resources` table SHALL include a per-row storage/API version column so that stored rows record the storage version they were written under, enabling future staged storage-version migrations.

#### Scenario: New rows record a storage version
- **WHEN** a resource row is written
- **THEN** the row SHALL carry a non-empty storage-version value

#### Scenario: Existing rows are backfilled
- **WHEN** the migration that introduces the storage-version column is applied to a database with existing rows
- **THEN** existing rows SHALL receive a storage-version value
- **AND** no existing row data SHALL be lost

### Requirement: Default etcd backend is unaffected
The migration mechanism SHALL apply only to the PostgreSQL backend and SHALL have no effect on deployments using the default etcd/CRD backend.

#### Scenario: etcd deployment unchanged
- **WHEN** Ark is deployed with the default etcd backend
- **THEN** no PostgreSQL migration step SHALL run
- **AND** startup behavior SHALL be unchanged from before this change
