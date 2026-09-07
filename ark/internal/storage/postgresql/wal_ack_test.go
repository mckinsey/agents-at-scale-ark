/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/jackc/pglogrepl"
	"github.com/jackc/pgx/v5/pgproto3"
)

func TestAckLSN(t *testing.T) {
	cases := []struct {
		name         string
		lastWriteLSN pglogrepl.LSN
		serverWALEnd pglogrepl.LSN
		want         pglogrepl.LSN
	}{
		{"nothing seen yet", 0, 0, 0},
		{"idle publication acks the server end", 0, 0x5000, 0x5000},
		{"our own write is ahead of the last keepalive", 0x9000, 0x5000, 0x9000},
		{"server end is ahead of our last write", 0x9000, 0xC000, 0xC000},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			state := &walStreamState{lastWriteLSN: c.lastWriteLSN, serverWALEnd: c.serverWALEnd}
			if got := state.ackLSN(); got != c.want {
				t.Errorf("ackLSN = %s, want %s", got, c.want)
			}
		})
	}
}

// A keepalive is the server saying "I have decoded up to here and sent you
// everything in your publication before it". Acking that position is what lets the
// slot advance while ark_cdc is quiet and the rest of the cluster generates WAL.
func TestHandleWALMessageKeepaliveTracksServerWALEnd(t *testing.T) {
	backend, _ := newTestBackendWithBroadcasters()
	state := newWALStreamState(0)

	msg := &pgproto3.CopyData{Data: encodePrimaryKeepalive(0x1A2B3C, false)}
	if err := backend.handleWALMessage(nil, msg, state); err != nil {
		t.Fatalf("handleWALMessage: %v", err)
	}

	if state.serverWALEnd != 0x1A2B3C {
		t.Errorf("serverWALEnd = %s, want %s", state.serverWALEnd, pglogrepl.LSN(0x1A2B3C))
	}
	if got := state.ackLSN(); got != 0x1A2B3C {
		t.Errorf("ackLSN = %s, want %s: an idle publication must still advance the slot", got, pglogrepl.LSN(0x1A2B3C))
	}
}

// The end position inside an XLogData frame can be ahead of records the server has
// not sent us yet, so it must not be acked — only keepalives carry that guarantee.
func TestHandleWALMessageXLogDataIgnoresServerWALEnd(t *testing.T) {
	backend, _ := newTestBackendWithBroadcasters("Agent")
	state := newWALStreamState(0)
	state.relations[7] = makeRelation(7, "kind", "namespace", "name")

	walData := encodeInsertMessage(7, makeTuple("Agent", "default", "a"))
	msg := &pgproto3.CopyData{Data: encodeXLogDataWithEnd(0x100, 0xF0000, walData)}
	if err := backend.handleWALMessage(nil, msg, state); err != nil {
		t.Fatalf("handleWALMessage: %v", err)
	}

	if state.serverWALEnd != 0 {
		t.Errorf("serverWALEnd = %s, want 0/0: XLogData end positions are not acknowledgeable", state.serverWALEnd)
	}
	if want := pglogrepl.LSN(0x100 + len(walData)); state.ackLSN() != want {
		t.Errorf("ackLSN = %s, want %s", state.ackLSN(), want)
	}
}

// This is the property that makes acking the server's end position safe: every
// XLogData is decoded synchronously inside the receive loop, so no unprocessed
// change can exist behind an ack. A future change that batches or defers decoding
// invalidates the fix, and this test is what should fail then.
func TestHandleWALMessageDecodesBeforeKeepaliveAck(t *testing.T) {
	backend, bcs := newTestBackendWithBroadcasters("Agent")
	bc := bcs["Agent"]
	state := newWALStreamState(0)
	state.relations[1] = makeRelation(1, "kind", "namespace", "name")

	walData := encodeInsertMessage(1, makeTuple("Agent", "default", "a"))
	writeEnd := pglogrepl.LSN(0x200 + len(walData))
	if err := backend.handleWALMessage(nil, &pgproto3.CopyData{Data: encodeXLogDataWithEnd(0x200, 0, walData)}, state); err != nil {
		t.Fatalf("handleWALMessage xlog: %v", err)
	}

	// The change is already visible to watchers the moment handleWALMessage returns,
	// before any keepalive can move the ack past it.
	if !nudged(bc) {
		t.Fatal("XLogData was not decoded synchronously: broadcaster not nudged on return")
	}
	if state.lastWriteLSN != writeEnd {
		t.Fatalf("lastWriteLSN = %s, want %s", state.lastWriteLSN, writeEnd)
	}

	keepalive := &pgproto3.CopyData{Data: encodePrimaryKeepalive(uint64(writeEnd)+0x1000, false)}
	if err := backend.handleWALMessage(nil, keepalive, state); err != nil {
		t.Fatalf("handleWALMessage keepalive: %v", err)
	}
	if state.ackLSN() < writeEnd {
		t.Errorf("ackLSN = %s, must not regress below the last decoded write %s", state.ackLSN(), writeEnd)
	}
}

func TestNewWALStreamStateSeedsResumePoint(t *testing.T) {
	state := newWALStreamState(0x4000)

	if got := state.ackLSN(); got != 0x4000 {
		t.Errorf("ackLSN = %s, want %s: a consumer must ack the slot's resume point, not 0/0, before its first write", got, pglogrepl.LSN(0x4000))
	}
	if state.relations == nil {
		t.Error("relations map not initialized")
	}
	if state.lastStatusUpdate.IsZero() {
		t.Error("lastStatusUpdate not initialized")
	}
}

func TestEnsureReplicationSlotExistingSlotResumePoint(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	mock.ExpectQuery("FROM pg_replication_slots").WithArgs(walSlotName).WillReturnRows(
		sqlmock.NewRows([]string{"exists", "active", "wal_status", "confirmed_flush_lsn"}).
			AddRow(true, false, "reserved", "0/1A2B3C"),
	)

	p := &PostgreSQLBackend{db: db, ctx: context.Background()}
	startLSN, resumeLSN, err := p.ensureReplicationSlot(nil, walSlotName)
	if err != nil {
		t.Fatalf("ensureReplicationSlot: %v", err)
	}

	if startLSN != 0 {
		t.Errorf("startLSN = %s, want 0/0 so the server resumes from confirmed_flush_lsn", startLSN)
	}
	if want := pglogrepl.LSN(0x1A2B3C); resumeLSN != want {
		t.Errorf("resumeLSN = %s, want %s", resumeLSN, want)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Error(err)
	}
}

func TestEnsureReplicationSlotActiveElsewhere(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	mock.ExpectQuery("FROM pg_replication_slots").WithArgs(walSlotName).WillReturnRows(
		sqlmock.NewRows([]string{"exists", "active", "wal_status", "confirmed_flush_lsn"}).
			AddRow(true, true, "reserved", "0/1A2B3C"),
	)

	p := &PostgreSQLBackend{db: db, ctx: context.Background()}
	if _, _, err := p.ensureReplicationSlot(nil, walSlotName); err == nil {
		t.Fatal("expected an error when the slot is held by another session")
	}
}
