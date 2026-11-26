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
// the ark_cdc publication covers only the resources table, but WAL is cluster-wide, so a consumer
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

func waitForSlot(t *testing.T, backend *PostgreSQLBackend) {
	t.Helper()
	deadline := time.Now().Add(30 * time.Second)
	for {
		var n int
		if err := backend.db.QueryRow(
			"SELECT count(*) FROM pg_replication_slots WHERE slot_name = $1 AND active AND temporary", backend.currentSlotName(),
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
		FROM pg_replication_slots WHERE slot_name = $1`, backend.currentSlotName()).Scan(&confirmed, &retained); err != nil {
		t.Fatalf("read slot position: %v", err)
	}
	return confirmed, retained
}
