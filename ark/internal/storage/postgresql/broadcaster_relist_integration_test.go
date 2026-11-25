//go:build integration
// +build integration

/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"testing"
)

func TestBroadcasterRelistDeliversOnlyNewRows_Integration(t *testing.T) {
	backend := relistIndexBackend(t)
	ctx := context.Background()
	const kind = "RelistDeltaProbe"
	const namespace = "relist-delta-probe"

	clean := func() {
		if _, err := backend.db.ExecContext(ctx, "DELETE FROM resources WHERE namespace = $1", namespace); err != nil {
			t.Fatalf("clean probe rows: %v", err)
		}
	}
	clean()
	t.Cleanup(clean)

	startRV, err := backend.getMaxResourceVersion()
	if err != nil {
		t.Fatalf("read max resource version: %v", err)
	}

	b := newKindBroadcaster(backend, kind)
	b.lastSeenRV.Store(startRV)
	w := newFanoutWatcher("", nil, 64, 64)
	b.subscribers[w] = struct{}{}

	if _, err := backend.db.ExecContext(ctx, `
		INSERT INTO resources (kind, namespace, name, uid, spec)
		SELECT $1, $2, 'probe-' || g, 'probe-uid-' || g, jsonb_build_object('n', g)
		FROM generate_series(1, 5) g`, kind, namespace); err != nil {
		t.Fatalf("seed rows: %v", err)
	}

	b.relist()
	if got := drainRows(w); len(got) != 5 {
		t.Fatalf("first relist delivered %d rows, want 5", len(got))
	}

	b.relist()
	if got := drainRows(w); len(got) != 0 {
		t.Fatalf("second relist re-delivered %v, want none", got)
	}

	var updatedRV int64
	if err := backend.db.QueryRowContext(ctx, `
		UPDATE resources
		SET resource_version = nextval(pg_get_serial_sequence('resources', 'resource_version')),
		    spec = jsonb_build_object('n', 99)
		WHERE kind = $1 AND namespace = $2 AND name = 'probe-3'
		RETURNING resource_version`, kind, namespace).Scan(&updatedRV); err != nil {
		t.Fatalf("update row: %v", err)
	}

	b.relist()
	got := drainRows(w)
	if len(got) != 1 || got[0] != updatedRV {
		t.Fatalf("relist after one update delivered %v, want [%d]", got, updatedRV)
	}
	if cursor := b.lastSeenRV.Load(); cursor != updatedRV {
		t.Errorf("cursor = %d, want %d", cursor, updatedRV)
	}
}
