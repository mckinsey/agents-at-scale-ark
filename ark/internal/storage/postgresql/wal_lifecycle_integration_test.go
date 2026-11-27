//go:build integration
// +build integration

/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"database/sql"
	"fmt"
	"testing"
	"time"
)

func TestWALConsumerManualStart_Integration(t *testing.T) {
	cfg := testConfig(t)

	checker, err := sql.Open("postgres", fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.Database, cfg.SSLMode,
	))
	if err != nil {
		t.Fatalf("open checker connection: %v", err)
	}
	defer checker.Close()

	temporarySlotCount := func() int {
		var n int
		if err := checker.QueryRow(
			"SELECT count(*) FROM pg_replication_slots WHERE slot_name LIKE $1 AND temporary", walSlotName+"\\_%",
		).Scan(&n); err != nil {
			t.Fatalf("query pg_replication_slots: %v", err)
		}
		return n
	}

	before := temporarySlotCount()

	backend, err := New(cfg, &integrationMockConverter{})
	if err != nil {
		t.Fatalf("Failed to create backend: %v", err)
	}
	defer backend.Close()

	time.Sleep(3 * time.Second)
	if n := temporarySlotCount(); n != before {
		t.Fatalf("backend opened a replication slot before StartWALConsumer: %d -> %d", before, n)
	}

	backend.StartWALConsumer()
	deadline := time.Now().Add(15 * time.Second)
	for temporarySlotCount() == before {
		if time.Now().After(deadline) {
			t.Fatal("replication slot not active within 15s after StartWALConsumer")
		}
		time.Sleep(200 * time.Millisecond)
	}

	backend.StartWALConsumer()
	time.Sleep(1 * time.Second)
	if n := temporarySlotCount(); n != before+1 {
		t.Errorf("expected exactly 1 new slot after repeated StartWALConsumer, got %d", n-before)
	}
}
