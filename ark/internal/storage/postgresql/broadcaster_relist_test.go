/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

var relistRowColumns = []string{
	"resource_version", "generation", "namespace", "name", "uid", "spec", "status", "labels",
	"annotations", "finalizers", "owner_references", "created_at", "deleted_at", "deletion_timestamp",
}

func relistKeys(pairs ...interface{}) *sqlmock.Rows {
	rows := sqlmock.NewRows([]string{"resource_version", "uid"})
	for i := 0; i < len(pairs); i += 2 {
		rows.AddRow(pairs[i], pairs[i+1])
	}
	return rows
}

func relistFullRow(rows *sqlmock.Rows, rv int64, uid string) *sqlmock.Rows {
	return rows.AddRow(rv, int64(1), "default", "obj-"+uid, uid, []byte(`{"p":"x"}`), []byte(`{}`),
		[]byte(`{}`), []byte(`{}`), []byte(`[]`), []byte(`[]`), time.Unix(0, 0), nil, nil)
}

func newRelistBroadcaster(t *testing.T, cursor int64) (*kindBroadcaster, sqlmock.Sqlmock, *postgresWatcher) {
	t.Helper()
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	backend := &PostgreSQLBackend{
		db:           db,
		ctx:          context.Background(),
		converter:    bookmarkConverter{},
		broadcasters: map[string]*kindBroadcaster{},
	}
	b := newKindBroadcaster(backend, "Agent")
	b.lastSeenRV.Store(cursor)
	w := newFanoutWatcher("", nil, 16, 16)
	b.subscribers[w] = struct{}{}
	return b, mock, w
}

func drainRows(w *postgresWatcher) []int64 {
	var got []int64
	for {
		select {
		case row := <-w.inputCh:
			got = append(got, row.rv)
		default:
			return got
		}
	}
}

func equalRVs(a, b []int64) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestRelist_LoadsFullRowsOnlyForUnseen(t *testing.T) {
	t.Parallel()
	b, mock, w := newRelistBroadcaster(t, 1000)
	b.markSeen("u1", 1001)

	mock.ExpectQuery("SELECT resource_version, uid").
		WithArgs("Agent", int64(500)).
		WillReturnRows(relistKeys(int64(1001), "u1", int64(1002), "u2", int64(1003), "u3"))
	full := relistFullRow(sqlmock.NewRows(relistRowColumns), 1002, "u2")
	full = relistFullRow(full, 1003, "u3")
	mock.ExpectQuery("resource_version = ANY").
		WithArgs("Agent", "{1002,1003}").
		WillReturnRows(full)

	b.relist()

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("queries: %v", err)
	}
	if got := drainRows(w); !equalRVs(got, []int64{1002, 1003}) {
		t.Errorf("delivered rvs = %v, want [1002 1003]", got)
	}
	if got := b.lastSeenRV.Load(); got != 1003 {
		t.Errorf("cursor = %d, want 1003", got)
	}
}

func TestRelist_SkipsRowsQueryWhenEverythingWasSeen(t *testing.T) {
	t.Parallel()
	b, mock, w := newRelistBroadcaster(t, 1000)
	b.markSeen("u1", 1001)
	b.markSeen("u2", 1002)

	mock.ExpectQuery("SELECT resource_version, uid").
		WillReturnRows(relistKeys(int64(1001), "u1", int64(1002), "u2"))

	b.relist()

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("queries: %v", err)
	}
	if b.consecutiveFailures != 0 {
		t.Errorf("an extra query was issued: failures = %d", b.consecutiveFailures)
	}
	if got := drainRows(w); len(got) != 0 {
		t.Errorf("delivered rvs = %v, want none", got)
	}
	if got := b.lastSeenRV.Load(); got != 1002 {
		t.Errorf("cursor = %d, want 1002", got)
	}
}

func TestRelist_KeysQueryFailureKeepsCursor(t *testing.T) {
	t.Parallel()
	b, mock, w := newRelistBroadcaster(t, 1000)

	mock.ExpectQuery("SELECT resource_version, uid").WillReturnError(errors.New("boom"))

	b.relist()

	if got := b.lastSeenRV.Load(); got != 1000 {
		t.Errorf("cursor = %d, want 1000", got)
	}
	if b.consecutiveFailures != 1 {
		t.Errorf("failures = %d, want 1", b.consecutiveFailures)
	}
	if got := drainRows(w); len(got) != 0 {
		t.Errorf("delivered rvs = %v, want none", got)
	}
}

func TestRelist_RowsQueryFailureKeepsCursorAndRetriesTheSameRows(t *testing.T) {
	t.Parallel()
	b, mock, w := newRelistBroadcaster(t, 1000)

	mock.ExpectQuery("SELECT resource_version, uid").
		WillReturnRows(relistKeys(int64(1001), "u1"))
	mock.ExpectQuery("resource_version = ANY").WillReturnError(errors.New("boom"))

	b.relist()

	if got := b.lastSeenRV.Load(); got != 1000 {
		t.Errorf("cursor = %d, want 1000", got)
	}
	if b.consecutiveFailures != 1 {
		t.Errorf("failures = %d, want 1", b.consecutiveFailures)
	}

	mock.ExpectQuery("SELECT resource_version, uid").
		WillReturnRows(relistKeys(int64(1001), "u1"))
	mock.ExpectQuery("resource_version = ANY").
		WithArgs("Agent", "{1001}").
		WillReturnRows(relistFullRow(sqlmock.NewRows(relistRowColumns), 1001, "u1"))

	b.relist()

	if got := drainRows(w); !equalRVs(got, []int64{1001}) {
		t.Errorf("delivered rvs after retry = %v, want [1001]", got)
	}
	if b.consecutiveFailures != 0 {
		t.Errorf("failures after success = %d, want 0", b.consecutiveFailures)
	}
	if got := b.lastSeenRV.Load(); got != 1001 {
		t.Errorf("cursor = %d, want 1001", got)
	}
}

func TestRelist_RowGoneBetweenQueriesIsDeliveredWhenItReappears(t *testing.T) {
	t.Parallel()
	b, mock, w := newRelistBroadcaster(t, 1000)

	mock.ExpectQuery("SELECT resource_version, uid").
		WillReturnRows(relistKeys(int64(1001), "u1", int64(1002), "u2"))
	mock.ExpectQuery("resource_version = ANY").
		WithArgs("Agent", "{1001,1002}").
		WillReturnRows(relistFullRow(sqlmock.NewRows(relistRowColumns), 1002, "u2"))

	b.relist()

	if got := drainRows(w); !equalRVs(got, []int64{1002}) {
		t.Fatalf("first relist delivered %v, want [1002]", got)
	}

	mock.ExpectQuery("SELECT resource_version, uid").
		WillReturnRows(relistKeys(int64(1001), "u1", int64(1002), "u2"))
	mock.ExpectQuery("resource_version = ANY").
		WithArgs("Agent", "{1001}").
		WillReturnRows(relistFullRow(sqlmock.NewRows(relistRowColumns), 1001, "u1"))

	b.relist()

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("queries: %v", err)
	}
	if got := drainRows(w); !equalRVs(got, []int64{1001}) {
		t.Errorf("second relist delivered %v, want [1001]", got)
	}
}
