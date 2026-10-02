//go:build integration
// +build integration

/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"fmt"
	"testing"
	"time"
)

// TestWALSlotAdvancesWhilePublicationIdle_Integration is the WAL-retention guard:
// ark_cdc publishes only the resources table, but WAL is cluster-wide, so a consumer
// that acks only its own writes pins every segment produced by unrelated tables. The
// slot must advance to the server's reported end position while ark itself is idle.
func TestWALSlotAdvancesWhilePublicationIdle_Integration(t *testing.T) {
	backend := newTestBackend(t)
	defer backend.Close()

	churnTable := fmt.Sprintf("wal_retention_churn_%d", time.Now().UnixNano())
	defer func() {
		_, _ = backend.db.Exec(fmt.Sprintf("DROP TABLE IF EXISTS %s", churnTable))
	}()

	backend.StartWALConsumer()
	waitForSlot(t, backend)

	if _, err := backend.db.Exec(fmt.Sprintf(
		"CREATE TABLE %s (id serial primary key, payload text)", churnTable,
	)); err != nil {
		t.Fatalf("create churn table: %v", err)
	}
	if _, err := backend.db.Exec(fmt.Sprintf(
		"INSERT INTO %s (payload) SELECT repeat('x', 1000) FROM generate_series(1, 200000)", churnTable,
	)); err != nil {
		t.Fatalf("churn: %v", err)
	}
	if _, err := backend.db.Exec("CHECKPOINT"); err != nil {
		t.Fatalf("checkpoint: %v", err)
	}

	var churnEnd string
	if err := backend.db.QueryRow("SELECT pg_current_wal_lsn()::text").Scan(&churnEnd); err != nil {
		t.Fatalf("read server wal end: %v", err)
	}

	// No write to resources happens in this test: the only thing that can move the
	// slot past the churn is the consumer acking the server's end position.
	deadline := time.Now().Add(3 * time.Minute)
	for {
		confirmed, retained := slotPosition(t, backend)
		var past bool
		if err := backend.db.QueryRow(
			"SELECT pg_wal_lsn_diff($1::pg_lsn, $2::pg_lsn) >= 0", confirmed, churnEnd,
		).Scan(&past); err != nil {
			t.Fatalf("compare lsn: %v", err)
		}
		if past {
			t.Logf("slot advanced to %s (past churn end %s), retaining %s", confirmed, churnEnd, retained)
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("slot stalled at %s while the server reached %s, retaining %s of WAL: an idle ark_cdc publication is pinning cluster WAL",
				confirmed, churnEnd, retained)
		}
		time.Sleep(2 * time.Second)
	}
}

// TestWALSlotResumesFromConfirmedPoint_Integration asserts a freshly started consumer
// reports the slot's resume point instead of 0/0, so the very first status update
// cannot look like a consumer that has processed nothing.
func TestWALSlotResumesFromConfirmedPoint_Integration(t *testing.T) {
	backend := newTestBackend(t)
	defer backend.Close()

	slotName := "ark_cdc_resume_test"
	_, _ = backend.db.Exec("SELECT pg_drop_replication_slot($1)", slotName)
	if _, err := backend.db.Exec(
		"SELECT pg_create_logical_replication_slot($1, 'pgoutput')", slotName,
	); err != nil {
		t.Fatalf("create slot: %v", err)
	}
	defer func() { _, _ = backend.db.Exec("SELECT pg_drop_replication_slot($1)", slotName) }()

	var confirmed string
	if err := backend.db.QueryRow(
		"SELECT confirmed_flush_lsn::text FROM pg_replication_slots WHERE slot_name = $1", slotName,
	).Scan(&confirmed); err != nil {
		t.Fatalf("read confirmed_flush_lsn: %v", err)
	}

	// The slot exists and is idle, so ensureReplicationSlot never needs the
	// replication connection it would use to create one.
	startLSN, resumeLSN, err := backend.ensureReplicationSlot(nil, slotName)
	if err != nil {
		t.Fatalf("ensureReplicationSlot: %v", err)
	}
	if startLSN != 0 {
		t.Errorf("startLSN = %s, want 0/0 for an existing slot", startLSN)
	}
	if resumeLSN.String() != confirmed {
		t.Errorf("resumeLSN = %s, want the slot's confirmed_flush_lsn %s", resumeLSN, confirmed)
	}
	if newWALStreamState(resumeLSN).ackLSN() != resumeLSN {
		t.Error("fresh stream state does not ack the resume point")
	}
}

func waitForSlot(t *testing.T, backend *PostgreSQLBackend) {
	t.Helper()
	deadline := time.Now().Add(30 * time.Second)
	for {
		var n int
		if err := backend.db.QueryRow(
			"SELECT count(*) FROM pg_replication_slots WHERE slot_name = $1 AND active", walSlotName,
		).Scan(&n); err != nil {
			t.Fatalf("query pg_replication_slots: %v", err)
		}
		if n == 1 {
			return
		}
		if time.Now().After(deadline) {
			t.Fatal("WAL consumer did not take the replication slot within 30s")
		}
		time.Sleep(500 * time.Millisecond)
	}
}

func slotPosition(t *testing.T, backend *PostgreSQLBackend) (confirmed, retained string) {
	t.Helper()
	if err := backend.db.QueryRow(`
		SELECT confirmed_flush_lsn::text,
		       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn))
		FROM pg_replication_slots WHERE slot_name = $1`, walSlotName).Scan(&confirmed, &retained); err != nil {
		t.Fatalf("read slot position: %v", err)
	}
	return confirmed, retained
}
