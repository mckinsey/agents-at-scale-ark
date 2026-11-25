/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/lib/pq"
	"k8s.io/klog/v2"
)

const (
	// expectedSchemaVersion is the highest migration shipped with this build. A
	// database at this version is fully up to date for this binary.
	expectedSchemaVersion int64 = 2

	// minCompatibleSchemaVersion is the lowest schema version this binary can
	// safely run against. During a rolling upgrade the migration step may advance
	// the database ahead of not-yet-upgraded runtime pods; those pods keep running
	// as long as the database is within [minCompatibleSchemaVersion, ...]. Raise
	// this only in a release that no longer depends on the older structure.
	minCompatibleSchemaVersion int64 = 1

	// schemaMigrationsTable is golang-migrate's default version-tracking table.
	schemaMigrationsTable = "schema_migrations"

	// undefinedTableCode is the PostgreSQL error code for a missing relation.
	undefinedTableCode = "42P01"
)

// ErrSchemaUnmigrated is returned when the database has no recorded schema
// version. The runtime never creates the schema itself; migrations must be
// applied by the separate migration step (the ark-controller-migrate image)
// first.
var ErrSchemaUnmigrated = errors.New("database schema is not migrated")

// assertSchemaCompatible verifies the database schema version is within the range
// this binary supports, failing fast otherwise. It executes no DDL and reads the
// version recorded by golang-migrate in the schema_migrations table.
func assertSchemaCompatible(ctx context.Context, db *sql.DB) error {
	var (
		version int64
		dirty   bool
	)
	err := db.QueryRowContext(ctx, "SELECT version, dirty FROM "+schemaMigrationsTable+" LIMIT 1").Scan(&version, &dirty)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("%w: no migrations recorded; run the migration step before starting the runtime", ErrSchemaUnmigrated)
		}
		var pqErr *pq.Error
		if errors.As(err, &pqErr) && string(pqErr.Code) == undefinedTableCode {
			return fmt.Errorf("%w: no %s table found; run the migration step before starting the runtime", ErrSchemaUnmigrated, schemaMigrationsTable)
		}
		return fmt.Errorf("read schema version: %w", err)
	}
	if dirty {
		return fmt.Errorf("database schema version %d is marked dirty; a previous migration failed and must be resolved before starting the runtime", version)
	}
	if version < minCompatibleSchemaVersion {
		return fmt.Errorf("database schema version %d is older than the minimum %d supported by this build; apply migrations before upgrading the runtime",
			version, minCompatibleSchemaVersion)
	}
	if version > expectedSchemaVersion {
		klog.Infof("database schema version %d is ahead of this build's expected %d; continuing within the compatibility window", version, expectedSchemaVersion)
	}
	klog.Infof("database schema version %d is compatible (expected %d, minimum %d)", version, expectedSchemaVersion, minCompatibleSchemaVersion)
	return nil
}
