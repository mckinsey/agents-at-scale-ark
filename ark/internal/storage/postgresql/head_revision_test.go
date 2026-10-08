/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"

	"mckinsey.com/ark/internal/storage"
)

func TestLiftHead(t *testing.T) {
	cases := []struct {
		name  string
		rv    int64
		floor int64
		base  int64
		want  int64
	}{
		{name: "empty store before bootstrap", want: 0},
		{name: "empty store reports the base", base: 1, want: 1},
		{name: "rows above the base", rv: 42, base: 1, want: 42},
		{name: "purged head lifts to the floor", rv: 10, floor: 30, base: 1, want: 30},
		{name: "everything purged lifts to the floor", floor: 30, base: 1, want: 30},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			p := &PostgreSQLBackend{headRevisionBase: c.base}
			p.cachedPurgeFloor.Store(c.floor)
			if got := p.liftHead(c.rv); got != c.want {
				t.Fatalf("liftHead(%d) = %d, want %d", c.rv, got, c.want)
			}
		})
	}
}

func TestRefreshCachedRV_EmptyStoreReportsTheBase(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer func() { _ = db.Close() }()

	mock.ExpectQuery("SELECT MAX\\(resource_version\\) FROM resources").
		WillReturnRows(sqlmock.NewRows([]string{"max"}).AddRow(nil))

	p := &PostgreSQLBackend{db: db, ctx: context.Background(), headRevisionBase: 1}
	p.refreshCachedRV()

	if got := p.cachedRV.Load(); got != 1 {
		t.Fatalf("cachedRV = %d, want 1", got)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

func TestSendBookmark_WatchListOnEmptyStoreGetsInitialEventsEnd(t *testing.T) {
	w := newBookmarkWatcher(storage.WatchOptions{SendInitialEvents: true, AllowWatchBookmarks: true})
	w.backend.headRevisionBase = 1
	w.backend.cachedRV.Store(0)

	w.sendBookmark()

	ev, ok := takeEvent(t, w)
	if !ok {
		t.Fatal("no bookmark sent on an empty store")
	}
	acc := bookmarkMeta(t, ev)
	if acc.GetResourceVersion() != "1" {
		t.Errorf("bookmark resourceVersion = %q, want %q", acc.GetResourceVersion(), "1")
	}
	if acc.GetAnnotations()[initialEventsEndAnnotation] != initialEventsEndValue {
		t.Errorf("bookmark annotations = %v, want %s=true", acc.GetAnnotations(), initialEventsEndAnnotation)
	}
}
