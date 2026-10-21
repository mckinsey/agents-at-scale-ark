//go:build integration
// +build integration

/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"mckinsey.com/ark/internal/storage"
)

func newListRevisionObject(kind, namespace, name string) *integrationTestObject {
	obj := &integrationTestObject{APIVersion: "ark.mckinsey.com/v1alpha1", Kind: kind}
	obj.Metadata.Name = name
	obj.Metadata.Namespace = namespace
	obj.Metadata.UID = "uid-" + namespace + "-" + name
	obj.Spec = map[string]interface{}{"name": name}
	return obj
}

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

func TestListResourceVersion_Integration(t *testing.T) {
	cfg := testConfig(t)
	backend, err := New(cfg, &integrationMockConverter{})
	if err != nil {
		t.Fatalf("Failed to create backend: %v", err)
	}
	defer backend.Close()

	ctx := context.Background()
	testKind := "ListRevisionResource"
	testNS := "list-revision-integration"
	clusterKind := "ListRevisionClusterResource"

	cleanup := func() {
		_, _ = backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1 OR kind = $2", testKind, clusterKind)
	}
	cleanup()
	defer cleanup()

	for i := 1; i <= 3; i++ {
		name := fmt.Sprintf("seed-%d", i)
		if err := backend.Create(ctx, testKind, testNS, name, newListRevisionObject(testKind, testNS, name)); err != nil {
			t.Fatalf("seed Create %s failed: %v", name, err)
		}
	}
	if err := backend.Create(ctx, clusterKind, "", "cluster-seed", newListRevisionObject(clusterKind, "", "cluster-seed")); err != nil {
		t.Fatalf("cluster seed Create failed: %v", err)
	}
	firstSeedRV, err := backend.GetResourceVersion(ctx, testKind, testNS, "seed-1")
	if err != nil {
		t.Fatalf("GetResourceVersion failed: %v", err)
	}

	_, _, head, err := backend.List(ctx, testKind, testNS, storage.ListOptions{})
	if err != nil {
		t.Fatalf("baseline List failed: %v", err)
	}
	if head <= firstSeedRV {
		t.Fatalf("head %d is not above the first seed's resourceVersion %d", head, firstSeedRV)
	}
	headStr := strconv.FormatInt(head, 10)
	nextStr := strconv.FormatInt(head+1, 10)
	seedStr := strconv.FormatInt(firstSeedRV, 10)
	notOlder := metav1.ResourceVersionMatchNotOlderThan
	exact := metav1.ResourceVersionMatchExact

	list := func(namespace string, opts storage.ListOptions) (int, string, int64, error) {
		objects, cont, listRV, err := backend.List(ctx, testKind, namespace, opts)
		return len(objects), cont, listRV, err
	}

	t.Run("NotOlderThan at the head is served", func(t *testing.T) {
		n, _, rv, err := list(testNS, storage.ListOptions{ResourceVersion: headStr, ResourceVersionMatch: notOlder})
		wantListedAt(t, n, rv, err, 3, head)
	})

	t.Run("NotOlderThan an old resourceVersion serves the current state", func(t *testing.T) {
		n, _, rv, err := list(testNS, storage.ListOptions{ResourceVersion: seedStr, ResourceVersionMatch: notOlder})
		wantListedAt(t, n, rv, err, 3, head)
	})

	t.Run("NotOlderThan head plus one is too large", func(t *testing.T) {
		_, _, _, err := list(testNS, storage.ListOptions{ResourceVersion: nextStr, ResourceVersionMatch: notOlder})
		assertTooLarge(t, err, head+1, head)
	})

	t.Run("NotOlderThan far in the future is too large", func(t *testing.T) {
		_, _, _, err := list(testNS, storage.ListOptions{ResourceVersion: strconv.FormatInt(head+1000000, 10), ResourceVersionMatch: notOlder})
		assertTooLarge(t, err, head+1000000, head)
	})

	t.Run("Exact at the head is served", func(t *testing.T) {
		n, _, rv, err := list(testNS, storage.ListOptions{ResourceVersion: headStr, ResourceVersionMatch: exact})
		wantListedAt(t, n, rv, err, 3, head)
	})

	t.Run("Exact below the head is expired", func(t *testing.T) {
		_, _, _, err := list(testNS, storage.ListOptions{ResourceVersion: seedStr, ResourceVersionMatch: exact})
		if !errors.Is(err, storage.ErrResourceExpired) {
			t.Fatalf("want ErrResourceExpired, got %v", err)
		}
	})

	t.Run("Exact head plus one is too large", func(t *testing.T) {
		_, _, _, err := list(testNS, storage.ListOptions{ResourceVersion: nextStr, ResourceVersionMatch: exact})
		assertTooLarge(t, err, head+1, head)
	})

	t.Run("legacy without limit behaves as NotOlderThan", func(t *testing.T) {
		n, _, rv, err := list(testNS, storage.ListOptions{ResourceVersion: seedStr})
		wantListedAt(t, n, rv, err, 3, head)
		_, _, _, err = list(testNS, storage.ListOptions{ResourceVersion: nextStr})
		assertTooLarge(t, err, head+1, head)
	})

	t.Run("legacy with limit behaves as Exact", func(t *testing.T) {
		_, _, _, err := list(testNS, storage.ListOptions{ResourceVersion: nextStr, Limit: 1})
		assertTooLarge(t, err, head+1, head)
		_, _, _, err = list(testNS, storage.ListOptions{ResourceVersion: seedStr, Limit: 1})
		if !errors.Is(err, storage.ErrResourceExpired) {
			t.Fatalf("want ErrResourceExpired, got %v", err)
		}
	})

	t.Run("resourceVersion 0 and empty are unconstrained", func(t *testing.T) {
		n, _, rv, err := list(testNS, storage.ListOptions{ResourceVersion: "0", ResourceVersionMatch: notOlder})
		wantListedAt(t, n, rv, err, 3, head)
		n, _, rv, err = list(testNS, storage.ListOptions{ResourceVersion: "0", Limit: 1})
		wantListedAt(t, n, rv, err, 1, head)
		n, _, rv, err = list(testNS, storage.ListOptions{})
		wantListedAt(t, n, rv, err, 3, head)
	})

	t.Run("paginated list keeps its bound on page one only", func(t *testing.T) {
		n, cont, rv, err := list(testNS, storage.ListOptions{ResourceVersion: headStr, ResourceVersionMatch: notOlder, Limit: 2})
		wantListedAt(t, n, rv, err, 2, head)
		if cont == "" {
			t.Fatal("page one has no continue token")
		}
		n, _, rv, err = list(testNS, storage.ListOptions{Continue: cont, Limit: 2})
		wantListedAt(t, n, rv, err, 1, head)
		_, _, _, err = list(testNS, storage.ListOptions{Continue: cont, Limit: 2, ResourceVersion: headStr})
		if !errors.Is(err, storage.ErrInvalidRequest) {
			t.Fatalf("continue with a resourceVersion: want ErrInvalidRequest, got %v", err)
		}
	})

	t.Run("cluster-scoped kinds honour the bound", func(t *testing.T) {
		objects, _, rv, err := backend.List(ctx, clusterKind, "", storage.ListOptions{ResourceVersion: headStr, ResourceVersionMatch: notOlder})
		wantListedAt(t, len(objects), rv, err, 1, head)
		_, _, _, err = backend.List(ctx, clusterKind, "", storage.ListOptions{ResourceVersion: nextStr, ResourceVersionMatch: notOlder})
		assertTooLarge(t, err, head+1, head)
	})

	t.Run("malformed resourceVersion is an invalid request", func(t *testing.T) {
		for _, rv := range []string{"abc", "-5", "+5"} {
			_, _, _, err := list(testNS, storage.ListOptions{ResourceVersion: rv, ResourceVersionMatch: notOlder})
			if !errors.Is(err, storage.ErrInvalidRequest) {
				t.Errorf("resourceVersion %q: want ErrInvalidRequest, got %v", rv, err)
			}
		}
	})
}

func TestListResourceVersion_EmptyStore_Integration(t *testing.T) {
	cfg := freshDatabaseConfig(t)
	backend, err := New(cfg, &integrationMockConverter{})
	if err != nil {
		t.Fatalf("Failed to create backend: %v", err)
	}
	defer backend.Close()

	ctx := context.Background()
	notOlder := metav1.ResourceVersionMatchNotOlderThan

	objects, _, listRV, err := backend.List(ctx, "EmptyStoreResource", "default", storage.ListOptions{ResourceVersion: "1", ResourceVersionMatch: notOlder})
	wantListedAt(t, len(objects), listRV, err, 0, 1)

	_, _, _, err = backend.List(ctx, "EmptyStoreResource", "default", storage.ListOptions{ResourceVersion: "2", ResourceVersionMatch: notOlder})
	assertTooLarge(t, err, 2, 1)
}
