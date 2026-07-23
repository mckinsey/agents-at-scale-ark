//go:build integration
// +build integration

/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"database/sql"
	"fmt"
	"os"
	"strconv"
	"testing"
	"time"
)

func TestWALConsumerManualStart_Integration(t *testing.T) {
	host := os.Getenv("POSTGRES_HOST")
	if host == "" {
		t.Skip("POSTGRES_HOST not set, skipping integration test")
	}

	port := 5432
	if p := os.Getenv("POSTGRES_PORT"); p != "" {
		port, _ = strconv.Atoi(p)
	}

	cfg := Config{
		Host:     host,
		Port:     port,
		Database: "ark",
		User:     "ark",
		Password: os.Getenv("POSTGRES_PASSWORD"),
		SSLMode:  "disable",
	}

	checker, err := sql.Open("postgres", fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.Database, cfg.SSLMode,
	))
	if err != nil {
		t.Fatalf("open checker connection: %v", err)
	}
	defer checker.Close()

	slotCount := func() int {
		var n int
		if err := checker.QueryRow(
			"SELECT count(*) FROM pg_replication_slots WHERE slot_name = $1", walSlotName,
		).Scan(&n); err != nil {
			t.Fatalf("query pg_replication_slots: %v", err)
		}
		return n
	}

	_, _ = checker.Exec("SELECT pg_terminate_backend(active_pid) FROM pg_replication_slots WHERE slot_name = $1 AND active_pid IS NOT NULL", walSlotName)
	_, _ = checker.Exec("SELECT pg_drop_replication_slot(slot_name) FROM pg_replication_slots WHERE slot_name = $1", walSlotName)
	if n := slotCount(); n != 0 {
		t.Fatalf("precondition failed: slot still present (count %d)", n)
	}

	backend, err := New(cfg, &integrationMockConverter{})
	if err != nil {
		t.Fatalf("Failed to create backend: %v", err)
	}
	defer backend.Close()

	time.Sleep(3 * time.Second)
	if n := slotCount(); n != 0 {
		t.Fatalf("backend created a replication slot before StartWALConsumer: count %d", n)
	}

	backend.StartWALConsumer()
	deadline := time.Now().Add(15 * time.Second)
	for slotCount() == 0 {
		if time.Now().After(deadline) {
			t.Fatal("replication slot not created within 15s after StartWALConsumer")
		}
		time.Sleep(200 * time.Millisecond)
	}

	backend.StartWALConsumer()
	time.Sleep(1 * time.Second)
	if n := slotCount(); n != 1 {
		t.Errorf("expected exactly 1 slot after repeated StartWALConsumer, got %d", n)
	}
}
