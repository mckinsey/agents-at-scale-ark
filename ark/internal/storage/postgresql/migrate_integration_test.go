//go:build integration
// +build integration

/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// TestMain applies schema migrations once before the integration suite. New() no
// longer creates the schema (it asserts compatibility), so the migration step must
// run first, mirroring the production flow where the ark-controller-migrate image
// (golang-migrate) migrates before the runtime starts. The suite applies the same
// *.up.sql files that image ships and records the version in schema_migrations
// exactly as golang-migrate would.
func TestMain(m *testing.M) {
	host := os.Getenv("POSTGRES_HOST")
	if host == "" {
		// No database configured; individual tests skip themselves.
		os.Exit(m.Run())
	}

	port := 5432
	if p := os.Getenv("POSTGRES_PORT"); p != "" {
		if parsed, err := strconv.Atoi(p); err == nil {
			port = parsed
		}
	}
	user := os.Getenv("POSTGRES_USER")
	if user == "" {
		user = "postgres"
	}
	db := os.Getenv("POSTGRES_DB")
	if db == "" {
		db = "ark"
	}
	cfg := Config{
		Host:     host,
		Port:     port,
		Database: db,
		User:     user,
		Password: os.Getenv("POSTGRES_PASSWORD"),
		SSLMode:  "disable",
	}
	if err := applyMigrations(context.Background(), cfg); err != nil {
		fmt.Fprintf(os.Stderr, "integration migrate failed: %v\n", err)
		os.Exit(1)
	}
	os.Exit(m.Run())
}

// applyMigrations runs every *.up.sql in version order and records the highest
// version in golang-migrate's schema_migrations table, reproducing what the
// ark-controller-migrate image does in production.
func applyMigrations(ctx context.Context, cfg Config) error {
	conn, err := sql.Open("postgres", buildConnString(cfg))
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer func() { _ = conn.Close() }()

	entries, err := os.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}
	var ups []string
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".up.sql") {
			ups = append(ups, e.Name())
		}
	}
	sort.Strings(ups)

	var maxVersion int64
	for _, name := range ups {
		body, err := os.ReadFile(filepath.Join("migrations", name))
		if err != nil {
			return fmt.Errorf("read %s: %w", name, err)
		}
		if _, err := conn.ExecContext(ctx, string(body)); err != nil {
			return fmt.Errorf("apply %s: %w", name, err)
		}
		if v, perr := strconv.ParseInt(strings.SplitN(name, "_", 2)[0], 10, 64); perr == nil && v > maxVersion {
			maxVersion = v
		}
	}

	if _, err := conn.ExecContext(ctx,
		"CREATE TABLE IF NOT EXISTS "+schemaMigrationsTable+" (version BIGINT NOT NULL PRIMARY KEY, dirty BOOLEAN NOT NULL)"); err != nil {
		return fmt.Errorf("create %s: %w", schemaMigrationsTable, err)
	}
	if _, err := conn.ExecContext(ctx, "DELETE FROM "+schemaMigrationsTable); err != nil {
		return fmt.Errorf("reset %s: %w", schemaMigrationsTable, err)
	}
	if _, err := conn.ExecContext(ctx,
		"INSERT INTO "+schemaMigrationsTable+" (version, dirty) VALUES ($1, false)", maxVersion); err != nil {
		return fmt.Errorf("record schema version: %w", err)
	}
	return nil
}
