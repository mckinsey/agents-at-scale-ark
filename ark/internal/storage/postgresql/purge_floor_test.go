/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"sync"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"

	"mckinsey.com/ark/internal/storage"
)

func TestStorePurgeFloor_MonotonicAdvance(t *testing.T) {
	p := &PostgreSQLBackend{}

	cases := []struct {
		store int64
		want  int64
	}{
		{store: 0, want: 0},
		{store: 100, want: 100},
		{store: 50, want: 100},
		{store: 100, want: 100},
		{store: 250, want: 250},
	}
	for _, c := range cases {
		p.storePurgeFloor(c.store)
		if got := p.cachedPurgeFloor.Load(); got != c.want {
			t.Fatalf("after storePurgeFloor(%d): floor = %d, want %d", c.store, got, c.want)
		}
	}
}

func TestStorePurgeFloor_Concurrent(t *testing.T) {
	p := &PostgreSQLBackend{}

	const max = 500
	var wg sync.WaitGroup
	for i := 1; i <= max; i++ {
		wg.Add(1)
		go func(v int64) {
			defer wg.Done()
			p.storePurgeFloor(v)
		}(int64(i))
	}
	wg.Wait()

	if got := p.cachedPurgeFloor.Load(); got != max {
		t.Fatalf("floor = %d after concurrent stores, want %d", got, max)
	}
}

func TestRefreshPurgeFloor_AdvancesFromStoredValue(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer func() { _ = db.Close() }()

	mock.ExpectQuery("SELECT value FROM storage_metadata").
		WillReturnRows(sqlmock.NewRows([]string{"value"}).AddRow(int64(150)))

	p := &PostgreSQLBackend{db: db, ctx: context.Background()}
	p.refreshPurgeFloor()

	if got := p.cachedPurgeFloor.Load(); got != 150 {
		t.Fatalf("floor = %d, want 150", got)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

func TestRefreshPurgeFloor_NoRowLeavesCacheUnchanged(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer func() { _ = db.Close() }()

	mock.ExpectQuery("SELECT value FROM storage_metadata").WillReturnError(sql.ErrNoRows)

	p := &PostgreSQLBackend{db: db, ctx: context.Background()}
	p.cachedPurgeFloor.Store(42)
	p.refreshPurgeFloor()

	if got := p.cachedPurgeFloor.Load(); got != 42 {
		t.Fatalf("floor = %d, want it unchanged at 42", got)
	}
}

func TestRefreshPurgeFloor_QueryErrorLeavesCacheUnchanged(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer func() { _ = db.Close() }()

	mock.ExpectQuery("SELECT value FROM storage_metadata").WillReturnError(errors.New("boom"))

	p := &PostgreSQLBackend{db: db, ctx: context.Background()}
	p.cachedPurgeFloor.Store(42)
	p.refreshPurgeFloor()

	if got := p.cachedPurgeFloor.Load(); got != 42 {
		t.Fatalf("floor = %d, want it unchanged at 42", got)
	}
}

func TestRefreshPurgeFloor_DoesNotRegress(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer func() { _ = db.Close() }()

	// A stale replica reporting a lower persisted value must not pull the cache back.
	mock.ExpectQuery("SELECT value FROM storage_metadata").
		WillReturnRows(sqlmock.NewRows([]string{"value"}).AddRow(int64(10)))

	p := &PostgreSQLBackend{db: db, ctx: context.Background()}
	p.cachedPurgeFloor.Store(200)
	p.refreshPurgeFloor()

	if got := p.cachedPurgeFloor.Load(); got != 200 {
		t.Fatalf("floor = %d, want it to stay at 200", got)
	}
}

func TestPurgeExpired_AdvancesFloor(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer func() { _ = db.Close() }()

	mock.ExpectQuery("INSERT INTO storage_metadata").
		WillReturnRows(sqlmock.NewRows([]string{"value"}).AddRow(int64(300)))

	p := &PostgreSQLBackend{db: db, ctx: context.Background()}
	p.purgeExpired()

	if got := p.cachedPurgeFloor.Load(); got != 300 {
		t.Fatalf("floor = %d, want 300", got)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

func TestPurgeExpired_NothingPurgedLeavesCacheUnchanged(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer func() { _ = db.Close() }()

	// No tombstones aged out: the INSERT ... WHERE rv > 0 returns no row.
	mock.ExpectQuery("INSERT INTO storage_metadata").WillReturnError(sql.ErrNoRows)

	p := &PostgreSQLBackend{db: db, ctx: context.Background()}
	p.cachedPurgeFloor.Store(75)
	p.purgeExpired()

	if got := p.cachedPurgeFloor.Load(); got != 75 {
		t.Fatalf("floor = %d, want it unchanged at 75", got)
	}
}

func TestPurgeExpired_QueryErrorLeavesCacheUnchanged(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer func() { _ = db.Close() }()

	mock.ExpectQuery("INSERT INTO storage_metadata").WillReturnError(errors.New("boom"))

	p := &PostgreSQLBackend{db: db, ctx: context.Background()}
	p.cachedPurgeFloor.Store(75)
	p.purgeExpired()

	if got := p.cachedPurgeFloor.Load(); got != 75 {
		t.Fatalf("floor = %d, want it unchanged at 75", got)
	}
}

func TestCheckResourceVersionNotExpired(t *testing.T) {
	cases := []struct {
		name       string
		floor      int64
		startRV    int64
		wantExpire bool
	}{
		{name: "far below floor", floor: 100, startRV: 1, wantExpire: true},
		{name: "just below floor", floor: 100, startRV: 99, wantExpire: true},
		{name: "equal to floor is safe", floor: 100, startRV: 100, wantExpire: false},
		{name: "above floor", floor: 100, startRV: 250, wantExpire: false},
		{name: "no floor set never rejects", floor: 0, startRV: 5, wantExpire: false},
		{name: "replay-all resume ignores floor", floor: 100, startRV: 0, wantExpire: false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			p := &PostgreSQLBackend{}
			p.cachedPurgeFloor.Store(c.floor)

			err := p.checkResourceVersionNotExpired(c.startRV)
			if c.wantExpire {
				if !errors.Is(err, storage.ErrResourceExpired) {
					t.Fatalf("want ErrResourceExpired, got %v", err)
				}
			} else if err != nil {
				t.Fatalf("want nil, got %v", err)
			}
		})
	}
}

func TestWatch_RejectsResourceVersionBelowFloor(t *testing.T) {
	// Exercises the guard through the real Watch entrypoint: rejection happens before
	// any broadcaster/goroutine is started, so a nil db backend is safe here.
	p := &PostgreSQLBackend{}
	p.cachedPurgeFloor.Store(100)

	w, err := p.Watch(context.Background(), "Agent", "default", storage.WatchOptions{
		ResourceVersion: strconv.FormatInt(99, 10),
	})
	if w != nil {
		w.Stop()
		t.Fatal("expected nil watcher on rejection")
	}
	if !errors.Is(err, storage.ErrResourceExpired) {
		t.Fatalf("want ErrResourceExpired, got %v", err)
	}
}
