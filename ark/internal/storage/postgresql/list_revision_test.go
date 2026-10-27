/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"mckinsey.com/ark/internal/storage"
)

func TestCheckListRevision(t *testing.T) {
	const head = 100
	tests := []struct {
		name        string
		head        int64
		rev         storage.ListRevision
		wantTooBig  bool
		wantExpired bool
	}{
		{name: "unconstrained", head: head, rev: storage.ListRevision{}},
		{name: "unconstrained exact flag ignored", head: head, rev: storage.ListRevision{Exact: true}},
		{name: "NotOlderThan below head", head: head, rev: storage.ListRevision{RV: 50}},
		{name: "NotOlderThan at head", head: head, rev: storage.ListRevision{RV: head}},
		{name: "NotOlderThan head plus one", head: head, rev: storage.ListRevision{RV: head + 1}, wantTooBig: true},
		{name: "NotOlderThan above int64", head: head, rev: storage.ListRevision{RV: 1<<64 - 1}, wantTooBig: true},
		{name: "Exact below head", head: head, rev: storage.ListRevision{RV: head - 1, Exact: true}, wantExpired: true},
		{name: "Exact at head", head: head, rev: storage.ListRevision{RV: head, Exact: true}},
		{name: "Exact head plus one", head: head, rev: storage.ListRevision{RV: head + 1, Exact: true}, wantTooBig: true},
		{name: "negative head", head: -1, rev: storage.ListRevision{RV: 1}, wantTooBig: true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := checkListRevision(tc.head, tc.rev)
			switch {
			case tc.wantTooBig:
				assertTooLarge(t, err, tc.rev.RV, tc.head)
			case tc.wantExpired:
				if !errors.Is(err, storage.ErrResourceExpired) {
					t.Fatalf("want ErrResourceExpired, got %v", err)
				}
			case err != nil:
				t.Fatalf("want nil, got %v", err)
			}
		})
	}
}

func assertTooLarge(t *testing.T, err error, requested uint64, current int64) {
	t.Helper()
	var tooLarge *storage.TooLargeResourceVersionError
	if !errors.As(err, &tooLarge) {
		t.Fatalf("want TooLargeResourceVersionError, got %v", err)
	}
	if tooLarge.Requested != requested || tooLarge.Current != current {
		t.Errorf("got %+v, want Requested %d Current %d", tooLarge, requested, current)
	}
}

func TestList_RejectsInvalidResourceVersionBeforeQuerying(t *testing.T) {
	p := &PostgreSQLBackend{}
	tests := []storage.ListOptions{
		{ResourceVersion: "abc", ResourceVersionMatch: metav1.ResourceVersionMatchNotOlderThan},
		{ResourceVersion: "-5"},
		{ResourceVersion: "18446744073709551616"},
		{ResourceVersion: "42", Continue: "tok"},
		{ResourceVersion: "42", ResourceVersionMatch: "Newest"},
	}
	for _, opts := range tests {
		_, _, _, err := p.List(context.Background(), "Agent", "default", opts)
		if !errors.Is(err, storage.ErrInvalidRequest) {
			t.Errorf("List(%+v) error = %v, want ErrInvalidRequest", opts, err)
		}
	}
}

func newMockedBackend(t *testing.T) (*PostgreSQLBackend, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return &PostgreSQLBackend{db: db, ctx: context.Background()}, mock
}

func expectMaxRV(mock sqlmock.Sqlmock, rv int64) {
	mock.ExpectQuery("SELECT MAX\\(resource_version\\) FROM resources").
		WillReturnRows(sqlmock.NewRows([]string{"max"}).AddRow(rv))
}

func expectFloor(mock sqlmock.Sqlmock, floor int64) {
	q := mock.ExpectQuery("SELECT value FROM storage_metadata")
	if floor == 0 {
		q.WillReturnError(sql.ErrNoRows)
		return
	}
	q.WillReturnRows(sqlmock.NewRows([]string{"value"}).AddRow(floor))
}

func TestRequireResourceVersion(t *testing.T) {
	tests := []struct {
		name       string
		minRV      uint64
		maxRV      int64
		dbFloor    int64
		readFloor  bool
		wantTooBig bool
	}{
		{name: "unconstrained reads nothing", minRV: 0},
		{name: "head reached", minRV: 10, maxRV: 10},
		{name: "head ahead", minRV: 10, maxRV: 20},
		{name: "behind and no floor", minRV: 11, maxRV: 10, readFloor: true, wantTooBig: true},
		{name: "purge floor raised on another replica", minRV: 15, maxRV: 10, dbFloor: 15, readFloor: true},
		{name: "floor still below the request", minRV: 16, maxRV: 10, dbFloor: 15, readFloor: true, wantTooBig: true},
		{name: "above int64", minRV: 1<<64 - 1, maxRV: 10, readFloor: true, wantTooBig: true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			p, mock := newMockedBackend(t)
			if tc.minRV > 0 {
				expectMaxRV(mock, tc.maxRV)
			}
			if tc.readFloor {
				expectFloor(mock, tc.dbFloor)
			}

			err := p.RequireResourceVersion(context.Background(), tc.minRV)
			if tc.wantTooBig {
				assertTooLarge(t, err, tc.minRV, max(tc.maxRV, tc.dbFloor))
			} else if err != nil {
				t.Fatalf("RequireResourceVersion() error = %v", err)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Errorf("unmet expectations: %v", err)
			}
		})
	}
}

func TestRequireResourceVersion_QueryErrorIsNotTooLarge(t *testing.T) {
	p, mock := newMockedBackend(t)
	mock.ExpectQuery("SELECT MAX\\(resource_version\\) FROM resources").WillReturnError(errors.New("connection reset"))

	err := p.RequireResourceVersion(context.Background(), 10)
	var tooLarge *storage.TooLargeResourceVersionError
	if err == nil || errors.As(err, &tooLarge) {
		t.Fatalf("want a plain error, got %v", err)
	}
}

func TestFreshHead(t *testing.T) {
	tests := []struct {
		name        string
		maxRV       int64
		cachedFloor int64
		base        int64
		want        uint64
		dbFloor     int64
		readsFloor  bool
		wantHead    int64
	}{
		{name: "max already enough", maxRV: 20, want: 20, wantHead: 20},
		{name: "cached floor lifts without a read", maxRV: 10, cachedFloor: 30, want: 25, wantHead: 30},
		{name: "base lifts an empty store", maxRV: 0, base: 1, want: 1, wantHead: 1},
		{name: "re-reads the floor when short", maxRV: 10, want: 15, dbFloor: 15, readsFloor: true, wantHead: 15},
		{name: "still short after the read", maxRV: 10, want: 16, dbFloor: 15, readsFloor: true, wantHead: 15},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			p, mock := newMockedBackend(t)
			p.cachedPurgeFloor.Store(tc.cachedFloor)
			p.headRevisionBase = tc.base
			if tc.readsFloor {
				expectFloor(mock, tc.dbFloor)
			}
			if got := p.freshHead(context.Background(), tc.maxRV, tc.want); got != tc.wantHead {
				t.Errorf("freshHead() = %d, want %d", got, tc.wantHead)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Errorf("floor reads: %v", err)
			}
		})
	}
}

func TestWatch_PlainWatchResourceVersionParsing(t *testing.T) {
	p := &PostgreSQLBackend{}
	for _, rv := range []string{"abc", "-5", "+5", "9223372036854775808", "18446744073709551616"} {
		w, err := p.Watch(context.Background(), "Agent", "default", storage.WatchOptions{ResourceVersion: rv})
		if w != nil {
			w.Stop()
			t.Fatalf("resourceVersion %q: expected no watcher", rv)
		}
		if !errors.Is(err, storage.ErrInvalidRequest) {
			t.Errorf("resourceVersion %q: want ErrInvalidRequest, got %v", rv, err)
		}
	}
}

func TestWatch_WatchListAheadOfTheStoreIsTooLarge(t *testing.T) {
	tests := []struct {
		name string
		rv   string
		want uint64
	}{
		{name: "head plus one", rv: "11", want: 11},
		{name: "above int64", rv: "18446744073709551615", want: 1<<64 - 1},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			p, mock := newMockedBackend(t)
			expectMaxRV(mock, 10)
			expectFloor(mock, 0)

			w, err := p.Watch(context.Background(), "Agent", "default", storage.WatchOptions{
				ResourceVersion:     tc.rv,
				SendInitialEvents:   true,
				AllowWatchBookmarks: true,
			})
			if w != nil {
				w.Stop()
				t.Fatal("expected no watcher when the store is behind the request")
			}
			assertTooLarge(t, err, tc.want, 10)
		})
	}
}

func TestWatch_WatchListWithInvalidResourceVersion(t *testing.T) {
	p := &PostgreSQLBackend{}
	w, err := p.Watch(context.Background(), "Agent", "default", storage.WatchOptions{ResourceVersion: "abc", SendInitialEvents: true})
	if w != nil {
		w.Stop()
		t.Fatal("expected no watcher for an invalid resourceVersion")
	}
	if !errors.Is(err, storage.ErrInvalidRequest) {
		t.Fatalf("want ErrInvalidRequest, got %v", err)
	}
}
