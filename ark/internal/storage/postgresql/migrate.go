/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"io/fs"

	"github.com/lib/pq"
	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/lock"
	"k8s.io/klog/v2"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

const (
	// expectedSchemaVersion is the highest migration embedded in this build. A
	// database at this version is fully up to date for this binary.
	expectedSchemaVersion int64 = 2

	// minCompatibleSchemaVersion is the lowest schema version this binary can
	// safely run against. During a rolling upgrade the migration step may advance
	// the database ahead of not-yet-upgraded runtime pods; those pods keep running
	// as long as the database is within [minCompatibleSchemaVersion, ...]. Raise
	// this only in a release that no longer depends on the older structure.
	minCompatibleSchemaVersion int64 = 1

	// gooseVersionTable is goose's default version-tracking table.
	gooseVersionTable = "goose_db_version"

	// undefinedTableCode is the PostgreSQL error code for a missing relation.
	undefinedTableCode = "42P01"
)

// ErrSchemaUnmigrated is returned when the database has no recorded schema
// version. The runtime never creates the schema itself; migrations must be
// applied by the separate migration step first.
var ErrSchemaUnmigrated = errors.New("database schema is not migrated")

func newProvider(db *sql.DB) (*goose.Provider, error) {
	sub, err := fs.Sub(migrationsFS, "migrations")
	if err != nil {
		return nil, fmt.Errorf("resolve migrations fs: %w", err)
	}
	locker, err := lock.NewPostgresSessionLocker()
	if err != nil {
		return nil, fmt.Errorf("create session locker: %w", err)
	}
	provider, err := goose.NewProvider(goose.DialectPostgres, db, sub, goose.WithSessionLocker(locker))
	if err != nil {
		return nil, fmt.Errorf("create migration provider: %w", err)
	}
	return provider, nil
}

// Migrate applies all pending schema migrations using the supplied (privileged)
// configuration. It is the only path that executes schema DDL; the runtime never
// does. Concurrent runners serialize on goose's PostgreSQL session advisory lock.
func Migrate(ctx context.Context, cfg Config) error {
	db, err := openMigrateDB(cfg)
	if err != nil {
		return err
	}
	defer func() { _ = db.Close() }()

	provider, err := newProvider(db)
	if err != nil {
		return err
	}
	results, err := provider.Up(ctx)
	if err != nil {
		return fmt.Errorf("apply migrations: %w", err)
	}
	for _, r := range results {
		klog.Infof("applied migration %d (%s)", r.Source.Version, r.Source.Path)
	}
	version, err := provider.GetDBVersion(ctx)
	if err != nil {
		return fmt.Errorf("read schema version: %w", err)
	}
	klog.Infof("schema is at version %d (expected %d)", version, expectedSchemaVersion)
	return nil
}

// MigrateDownTo rolls the schema back to the given version using the supplied
// (privileged) configuration. It is an explicit, operator-initiated action; the
// runtime never rolls back.
func MigrateDownTo(ctx context.Context, cfg Config, version int64) error {
	db, err := openMigrateDB(cfg)
	if err != nil {
		return err
	}
	defer func() { _ = db.Close() }()

	provider, err := newProvider(db)
	if err != nil {
		return err
	}
	results, err := provider.DownTo(ctx, version)
	if err != nil {
		return fmt.Errorf("roll back migrations: %w", err)
	}
	for _, r := range results {
		klog.Infof("rolled back migration %d (%s)", r.Source.Version, r.Source.Path)
	}
	return nil
}

func openMigrateDB(cfg Config) (*sql.DB, error) {
	if cfg.SSLMode == "" {
		cfg.SSLMode = defaultSSLMode
	}
	if cfg.Port == 0 {
		cfg.Port = 5432
	}
	db, err := sql.Open("postgres", buildConnString(cfg))
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	return db, nil
}

// assertSchemaCompatible verifies the database schema version is within the range
// this binary supports, failing fast otherwise. It executes no DDL.
func assertSchemaCompatible(ctx context.Context, db *sql.DB) error {
	var version sql.NullInt64
	err := db.QueryRowContext(ctx, "SELECT max(version_id) FROM "+gooseVersionTable).Scan(&version)
	if err != nil {
		var pqErr *pq.Error
		if errors.As(err, &pqErr) && string(pqErr.Code) == undefinedTableCode {
			return fmt.Errorf("%w: no %s table found; run the migration step before starting the runtime", ErrSchemaUnmigrated, gooseVersionTable)
		}
		return fmt.Errorf("read schema version: %w", err)
	}
	if !version.Valid {
		return fmt.Errorf("%w: no migrations recorded; run the migration step before starting the runtime", ErrSchemaUnmigrated)
	}
	current := version.Int64
	if current < minCompatibleSchemaVersion {
		return fmt.Errorf("database schema version %d is older than the minimum %d supported by this build; apply migrations before upgrading the runtime",
			current, minCompatibleSchemaVersion)
	}
	if current > expectedSchemaVersion {
		klog.Infof("database schema version %d is ahead of this build's expected %d; continuing within the compatibility window", current, expectedSchemaVersion)
	}
	klog.Infof("database schema version %d is compatible (expected %d, minimum %d)", current, expectedSchemaVersion, minCompatibleSchemaVersion)
	return nil
}
