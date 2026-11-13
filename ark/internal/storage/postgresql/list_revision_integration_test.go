//go:build integration
// +build integration

/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"mckinsey.com/ark/internal/storage"
)

const (
	listRevisionKind        = "ListRevisionResource"
	listRevisionClusterKind = "ListRevisionClusterResource"
	listRevisionNS          = "list-revision-integration"
)

type listRevisionFixture struct {
	backend     *PostgreSQLBackend
	head        int64
	firstSeedRV int64
}

func newListRevisionObject(kind, namespace, name string) *integrationTestObject {
	obj := &integrationTestObject{APIVersion: "ark.mckinsey.com/v1alpha1", Kind: kind}
	obj.Metadata.Name = name
	obj.Metadata.Namespace = namespace
	obj.Metadata.UID = "uid-" + namespace + "-" + name
	obj.Spec = map[string]interface{}{"name": name}
	return obj
}

func newListRevisionBackend(t *testing.T, cfg Config) *PostgreSQLBackend {
	t.Helper()
	backend, err := New(cfg, &integrationMockConverter{})
	if err != nil {
		t.Fatalf("Failed to create backend: %v", err)
	}
	t.Cleanup(func() {
		if err := backend.Close(); err != nil {
			t.Logf("close backend: %v", err)
		}
	})
	return backend
}

func seedListRevision(t *testing.T) *listRevisionFixture {
	t.Helper()
	backend := newListRevisionBackend(t, testConfig(t))
	ctx := context.Background()

	_, _ = backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1 OR kind = $2", listRevisionKind, listRevisionClusterKind)
	type seed struct{ kind, ns, name string }
	seeds := []seed{
		{listRevisionKind, listRevisionNS, "seed-1"},
		{listRevisionKind, listRevisionNS, "seed-2"},
		{listRevisionKind, listRevisionNS, "seed-3"},
		{listRevisionClusterKind, "", "cluster-seed"},
	}
	for _, s := range seeds {
		if err := backend.Create(ctx, s.kind, s.ns, s.name, newListRevisionObject(s.kind, s.ns, s.name)); err != nil {
			t.Fatalf("seed Create %s failed: %v", s.name, err)
		}
	}
	t.Cleanup(func() {
		for _, s := range seeds {
			if err := backend.Delete(ctx, s.kind, s.ns, s.name); err != nil {
				t.Logf("delete %s: %v", s.name, err)
			}
		}
	})

	firstSeedRV, err := backend.GetResourceVersion(ctx, listRevisionKind, listRevisionNS, "seed-1")
	if err != nil {
		t.Fatalf("GetResourceVersion failed: %v", err)
	}
	_, _, head, err := backend.List(ctx, listRevisionKind, listRevisionNS, storage.ListOptions{})
	if err != nil {
		t.Fatalf("baseline List failed: %v", err)
	}
	if head <= firstSeedRV {
		t.Fatalf("head %d is not above the first seed's resourceVersion %d", head, firstSeedRV)
	}
	return &listRevisionFixture{backend: backend, head: head, firstSeedRV: firstSeedRV}
}

func (f *listRevisionFixture) list(t *testing.T, kind, namespace string, opts storage.ListOptions) (int, string, int64, error) {
	t.Helper()
	objects, cont, listRV, err := f.backend.List(context.Background(), kind, namespace, opts)
	return len(objects), cont, listRV, err
}

func rvString(rv int64) string { return strconv.FormatInt(rv, 10) }

func wantListedAt(t *testing.T, objects int, listRV int64, err error, wantObjects int, head int64) {
	t.Helper()
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if objects != wantObjects {
		t.Errorf("List returned %d objects, want %d", objects, wantObjects)
	}
	if listRV != head {
		t.Errorf("list resourceVersion = %d, want %d", listRV, head)
	}
}

func wantExpired(t *testing.T, err error) {
	t.Helper()
	if !errors.Is(err, storage.ErrResourceExpired) {
		t.Fatalf("want ErrResourceExpired, got %v", err)
	}
}

func wantInvalid(t *testing.T, err error) {
	t.Helper()
	if !errors.Is(err, storage.ErrInvalidRequest) {
		t.Fatalf("want ErrInvalidRequest, got %v", err)
	}
}

func TestListResourceVersion_NotOlderThan_Integration(t *testing.T) {
	f := seedListRevision(t)
	notOlder := metav1.ResourceVersionMatchNotOlderThan

	n, _, rv, err := f.list(t, listRevisionKind, listRevisionNS, storage.ListOptions{ResourceVersion: rvString(f.head), ResourceVersionMatch: notOlder})
	wantListedAt(t, n, rv, err, 3, f.head)

	n, _, rv, err = f.list(t, listRevisionKind, listRevisionNS, storage.ListOptions{ResourceVersion: rvString(f.firstSeedRV), ResourceVersionMatch: notOlder})
	wantListedAt(t, n, rv, err, 3, f.head)

	_, _, _, err = f.list(t, listRevisionKind, listRevisionNS, storage.ListOptions{ResourceVersion: rvString(f.head + 1), ResourceVersionMatch: notOlder})
	assertTooLarge(t, err, uint64(f.head+1), f.head)

	_, _, _, err = f.list(t, listRevisionKind, listRevisionNS, storage.ListOptions{ResourceVersion: rvString(f.head + 1000000), ResourceVersionMatch: notOlder})
	assertTooLarge(t, err, uint64(f.head+1000000), f.head)

	_, _, _, err = f.list(t, listRevisionKind, listRevisionNS, storage.ListOptions{ResourceVersion: "18446744073709551615", ResourceVersionMatch: notOlder})
	assertTooLarge(t, err, 1<<64-1, f.head)
}

func TestListResourceVersion_Exact_Integration(t *testing.T) {
	f := seedListRevision(t)
	exact := metav1.ResourceVersionMatchExact

	n, _, rv, err := f.list(t, listRevisionKind, listRevisionNS, storage.ListOptions{ResourceVersion: rvString(f.head), ResourceVersionMatch: exact})
	wantListedAt(t, n, rv, err, 3, f.head)

	_, _, _, err = f.list(t, listRevisionKind, listRevisionNS, storage.ListOptions{ResourceVersion: rvString(f.firstSeedRV), ResourceVersionMatch: exact})
	wantExpired(t, err)

	_, _, _, err = f.list(t, listRevisionKind, listRevisionNS, storage.ListOptions{ResourceVersion: rvString(f.head + 1), ResourceVersionMatch: exact})
	assertTooLarge(t, err, uint64(f.head+1), f.head)
}

func TestListResourceVersion_LegacyIsALowerBound_Integration(t *testing.T) {
	f := seedListRevision(t)

	n, _, rv, err := f.list(t, listRevisionKind, listRevisionNS, storage.ListOptions{ResourceVersion: rvString(f.firstSeedRV)})
	wantListedAt(t, n, rv, err, 3, f.head)

	n, _, rv, err = f.list(t, listRevisionKind, listRevisionNS, storage.ListOptions{ResourceVersion: rvString(f.firstSeedRV), Limit: 1})
	wantListedAt(t, n, rv, err, 1, f.head)

	_, _, _, err = f.list(t, listRevisionKind, listRevisionNS, storage.ListOptions{ResourceVersion: rvString(f.head + 1)})
	assertTooLarge(t, err, uint64(f.head+1), f.head)

	_, _, _, err = f.list(t, listRevisionKind, listRevisionNS, storage.ListOptions{ResourceVersion: rvString(f.head + 1), Limit: 1})
	assertTooLarge(t, err, uint64(f.head+1), f.head)
}

func TestListResourceVersion_UnconstrainedAndMalformed_Integration(t *testing.T) {
	f := seedListRevision(t)
	notOlder := metav1.ResourceVersionMatchNotOlderThan

	n, _, rv, err := f.list(t, listRevisionKind, listRevisionNS, storage.ListOptions{ResourceVersion: "0", ResourceVersionMatch: notOlder})
	wantListedAt(t, n, rv, err, 3, f.head)
	n, _, rv, err = f.list(t, listRevisionKind, listRevisionNS, storage.ListOptions{ResourceVersion: "0", Limit: 1})
	wantListedAt(t, n, rv, err, 1, f.head)
	n, _, rv, err = f.list(t, listRevisionKind, listRevisionNS, storage.ListOptions{})
	wantListedAt(t, n, rv, err, 3, f.head)

	for _, bad := range []string{"abc", "-5", "+5", "18446744073709551616"} {
		_, _, _, err := f.list(t, listRevisionKind, listRevisionNS, storage.ListOptions{ResourceVersion: bad, ResourceVersionMatch: notOlder})
		wantInvalid(t, err)
	}
}

func TestListResourceVersion_Pagination_Integration(t *testing.T) {
	f := seedListRevision(t)

	n, cont, rv, err := f.list(t, listRevisionKind, listRevisionNS, storage.ListOptions{ResourceVersion: rvString(f.head), ResourceVersionMatch: metav1.ResourceVersionMatchNotOlderThan, Limit: 2})
	wantListedAt(t, n, rv, err, 2, f.head)
	if cont == "" {
		t.Fatal("page one has no continue token")
	}
	n, _, rv, err = f.list(t, listRevisionKind, listRevisionNS, storage.ListOptions{Continue: cont, Limit: 2})
	wantListedAt(t, n, rv, err, 1, f.head)

	_, _, _, err = f.list(t, listRevisionKind, listRevisionNS, storage.ListOptions{Continue: cont, Limit: 2, ResourceVersion: rvString(f.head)})
	wantInvalid(t, err)
}

func TestListResourceVersion_ClusterScoped_Integration(t *testing.T) {
	f := seedListRevision(t)
	notOlder := metav1.ResourceVersionMatchNotOlderThan

	n, _, rv, err := f.list(t, listRevisionClusterKind, "", storage.ListOptions{ResourceVersion: rvString(f.head), ResourceVersionMatch: notOlder})
	wantListedAt(t, n, rv, err, 1, f.head)
	_, _, _, err = f.list(t, listRevisionClusterKind, "", storage.ListOptions{ResourceVersion: rvString(f.head + 1), ResourceVersionMatch: notOlder})
	assertTooLarge(t, err, uint64(f.head+1), f.head)
}

func TestRequireResourceVersion_Integration(t *testing.T) {
	f := seedListRevision(t)
	ctx := context.Background()

	if err := f.backend.RequireResourceVersion(ctx, uint64(f.head)); err != nil {
		t.Fatalf("RequireResourceVersion(head) error = %v", err)
	}
	if err := f.backend.RequireResourceVersion(ctx, 0); err != nil {
		t.Fatalf("RequireResourceVersion(0) error = %v", err)
	}
	assertTooLarge(t, f.backend.RequireResourceVersion(ctx, uint64(f.head+1)), uint64(f.head+1), f.head)
}

func TestWatchListResourceVersion_Integration(t *testing.T) {
	f := seedListRevision(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	_, err := f.backend.Watch(ctx, listRevisionKind, listRevisionNS, storage.WatchOptions{
		ResourceVersion:     rvString(f.head + 1),
		SendInitialEvents:   true,
		AllowWatchBookmarks: true,
	})
	assertTooLarge(t, err, uint64(f.head+1), f.head)

	w, err := f.backend.Watch(ctx, listRevisionKind, listRevisionNS, storage.WatchOptions{
		ResourceVersion:     rvString(f.head),
		SendInitialEvents:   true,
		AllowWatchBookmarks: true,
	})
	if err != nil {
		t.Fatalf("WatchList at the head failed: %v", err)
	}
	w.Stop()

	w, err = f.backend.Watch(ctx, listRevisionKind, listRevisionNS, storage.WatchOptions{ResourceVersion: rvString(f.head + 1)})
	if err != nil {
		t.Fatalf("a plain watch from a future resourceVersion should be accepted, got %v", err)
	}
	w.Stop()
}

func TestHeadResourceVersion_RowUpdatedAfterTheSnapshot_Integration(t *testing.T) {
	f := seedListRevision(t)
	ctx := context.Background()
	name := "seed-top"
	obj := newListRevisionObject(listRevisionKind, listRevisionNS, name)
	if err := f.backend.Create(ctx, listRevisionKind, listRevisionNS, name, obj); err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	t.Cleanup(func() { _ = f.backend.Delete(ctx, listRevisionKind, listRevisionNS, name) })
	topRV, err := f.backend.GetResourceVersion(ctx, listRevisionKind, listRevisionNS, name)
	if err != nil {
		t.Fatalf("GetResourceVersion failed: %v", err)
	}

	tx, err := f.backend.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		t.Fatalf("BeginTx failed: %v", err)
	}
	defer func() { _ = tx.Rollback() }()
	var snapshot string
	if err := tx.QueryRowContext(ctx, "SELECT pg_current_snapshot()::text").Scan(&snapshot); err != nil {
		t.Fatalf("capture snapshot: %v", err)
	}

	obj.Metadata.ResourceVersion = rvString(topRV)
	obj.Spec = map[string]interface{}{"name": name, "updated": true}
	if err := f.backend.Update(ctx, listRevisionKind, listRevisionNS, name, obj); err != nil {
		t.Fatalf("Update failed: %v", err)
	}

	inTx, err := snapshotMaxResourceVersion(ctx, tx, snapshot)
	if err != nil {
		t.Fatalf("snapshotMaxResourceVersion in the list transaction: %v", err)
	}
	if inTx != topRV {
		t.Errorf("head read inside the list transaction = %d, want %d", inTx, topRV)
	}

	outside, err := snapshotMaxResourceVersion(ctx, f.backend.db, snapshot)
	if err != nil {
		t.Fatalf("snapshotMaxResourceVersion outside the transaction: %v", err)
	}
	if outside >= topRV {
		t.Fatalf("expected a separate statement to miss the updated row (got %d, top %d); the test no longer exercises the race", outside, topRV)
	}
}

func TestListResourceVersion_EmptyStore_Integration(t *testing.T) {
	backend := newListRevisionBackend(t, freshDatabaseConfig(t))
	ctx := context.Background()
	notOlder := metav1.ResourceVersionMatchNotOlderThan

	objects, _, listRV, err := backend.List(ctx, "EmptyStoreResource", "default", storage.ListOptions{ResourceVersion: "1", ResourceVersionMatch: notOlder})
	wantListedAt(t, len(objects), listRV, err, 0, 1)

	_, _, _, err = backend.List(ctx, "EmptyStoreResource", "default", storage.ListOptions{ResourceVersion: "2", ResourceVersionMatch: notOlder})
	assertTooLarge(t, err, 2, 1)
}
