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

	if err := backend.Close(); err != nil {
		t.Fatalf("Close failed: %v", err)
	}
	deadline = time.Now().Add(15 * time.Second)
	for temporarySlotCount() != before {
		if time.Now().After(deadline) {
			t.Fatal("temporary slot still present 15s after Close")
		}
		time.Sleep(200 * time.Millisecond)
	}
}

func TestLegacySlotIsDropped_Integration(t *testing.T) {
	cfg := testConfig(t)

	checker, err := sql.Open("postgres", fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.Database, cfg.SSLMode,
	))
	if err != nil {
		t.Fatalf("open checker connection: %v", err)
	}
	defer checker.Close()

	_, _ = checker.Exec("SELECT pg_drop_replication_slot(slot_name) FROM pg_replication_slots WHERE slot_name = $1", walSlotName)
	if _, err := checker.Exec("SELECT pg_create_logical_replication_slot($1, 'pgoutput')", walSlotName); err != nil {
		t.Fatalf("create legacy slot: %v", err)
	}
	defer func() {
		_, _ = checker.Exec("SELECT pg_drop_replication_slot(slot_name) FROM pg_replication_slots WHERE slot_name = $1", walSlotName)
	}()

	backend, err := New(cfg, &integrationMockConverter{})
	if err != nil {
		t.Fatalf("Failed to create backend: %v", err)
	}
	defer backend.Close()
	backend.StartWALConsumer()

	deadline := time.Now().Add(15 * time.Second)
	for {
		var n int
		if err := checker.QueryRow("SELECT count(*) FROM pg_replication_slots WHERE slot_name = $1", walSlotName).Scan(&n); err != nil {
			t.Fatalf("query pg_replication_slots: %v", err)
		}
		if n == 0 {
			return
		}
		if time.Now().After(deadline) {
			t.Fatal("legacy ark_cdc slot was not dropped within 15s")
		}
		time.Sleep(200 * time.Millisecond)
	}
}

func TestRunWALConsumer_FreesSlotWhenContextCancelled_Integration(t *testing.T) {
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

	backend, err := New(cfg, &integrationMockConverter{})
	if err != nil {
		t.Fatalf("Failed to create backend: %v", err)
	}
	defer backend.Close()

	before := temporarySlotCount()

	for round := range 2 {
		runCtx, stop := context.WithCancel(context.Background())
		done := make(chan struct{})
		go func() {
			backend.RunWALConsumer(runCtx)
			close(done)
		}()

		deadline := time.Now().Add(15 * time.Second)
		for temporarySlotCount() != before+1 {
			if time.Now().After(deadline) {
				stop()
				t.Fatalf("round %d: replication slot not created within 15s", round)
			}
			time.Sleep(100 * time.Millisecond)
		}

		stop()
		select {
		case <-done:
		case <-time.After(10 * time.Second):
			t.Fatalf("round %d: RunWALConsumer did not return after its context was cancelled", round)
		}

		deadline = time.Now().Add(10 * time.Second)
		for temporarySlotCount() != before {
			if time.Now().After(deadline) {
				t.Fatalf("round %d: replication slot still present 10s after cancelling the run context", round)
			}
			time.Sleep(100 * time.Millisecond)
		}
		if backend.ctx.Err() != nil {
			t.Fatalf("round %d: cancelling the run context cancelled the backend context", round)
		}
	}
}
