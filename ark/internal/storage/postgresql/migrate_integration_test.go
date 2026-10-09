//go:build integration
// +build integration

/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"testing"
)

// TestMain applies schema migrations once before the integration suite. New() no
// longer creates the schema (it asserts compatibility), so the migration step must
// run first, mirroring the production flow where a privileged step migrates before
// the runtime starts.
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
	if err := Migrate(context.Background(), cfg); err != nil {
		fmt.Fprintf(os.Stderr, "integration migrate failed: %v\n", err)
		os.Exit(1)
	}
	os.Exit(m.Run())
}
