//go:build integration
// +build integration

/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"database/sql"
	"testing"
)

func TestDropReplicationArtifacts_Integration(t *testing.T) {
	cfg := testConfig(t)

	ctx := context.Background()
	checker, err := sql.Open("postgres", cleanupConnString(cfg))
	if err != nil {
		t.Fatalf("open checker connection: %v", err)
	}
	defer checker.Close()

	slotCount := func() int {
		var n int
		if err := checker.QueryRowContext(ctx,
			"SELECT count(*) FROM pg_replication_slots WHERE slot_name = $1", walSlotName).Scan(&n); err != nil {
			t.Fatalf("query pg_replication_slots: %v", err)
		}
		return n
	}
	publicationCount := func() int {
		var n int
		if err := checker.QueryRowContext(ctx,
			"SELECT count(*) FROM pg_publication WHERE pubname = $1", walPublicationName).Scan(&n); err != nil {
			t.Fatalf("query pg_publication: %v", err)
		}
		return n
	}

	backend, err := New(cfg, &integrationMockConverter{})
	if err != nil {
		t.Fatalf("Failed to create backend: %v", err)
	}
	defer func() { _ = backend.Close() }()

	_, _ = checker.ExecContext(ctx, "SELECT pg_drop_replication_slot($1) FROM pg_replication_slots WHERE slot_name = $1", walSlotName)
	if _, err := checker.ExecContext(ctx, "SELECT pg_create_logical_replication_slot($1, 'pgoutput')", walSlotName); err != nil {
		t.Fatalf("create legacy slot: %v", err)
	}
	if slotCount() == 0 {
		t.Fatal("legacy slot was not created")
	}
	if publicationCount() == 0 {
		t.Fatal("publication was not created")
	}

	if err := backend.Close(); err != nil {
		t.Fatalf("Close failed: %v", err)
	}

	if err := DropReplicationArtifacts(ctx, cfg); err != nil {
		t.Fatalf("DropReplicationArtifacts failed: %v", err)
	}

	if n := slotCount(); n != 0 {
		t.Errorf("replication slot still present after cleanup: count = %d", n)
	}
	if n := publicationCount(); n != 0 {
		t.Errorf("publication still present after cleanup: count = %d", n)
	}

	if err := DropReplicationArtifacts(ctx, cfg); err != nil {
		t.Errorf("second DropReplicationArtifacts should be idempotent, got: %v", err)
	}
}
