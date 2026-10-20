//go:build integration
// +build integration

/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"testing"
	"time"

	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/apimachinery/pkg/watch"

	"mckinsey.com/ark/internal/storage"
)

// freshDatabaseConfig creates a throwaway database so the test sees a store with
// no rows at all: the head revision is global, so an empty kind in the shared
// test database is not an empty store.
func freshDatabaseConfig(t *testing.T) Config {
	t.Helper()
	cfg := testConfig(t)
	admin, err := sql.Open("postgres", buildConnString(cfg))
	if err != nil {
		t.Fatalf("open admin connection: %v", err)
	}
	name := fmt.Sprintf("ark_empty_%d", time.Now().UnixNano())
	if _, err := admin.Exec("CREATE DATABASE " + name); err != nil {
		_ = admin.Close()
		t.Fatalf("create database: %v", err)
	}
	t.Cleanup(func() {
		if _, err := admin.Exec("DROP DATABASE IF EXISTS " + name + " WITH (FORCE)"); err != nil {
			t.Logf("drop database %s: %v", name, err)
		}
		_ = admin.Close()
	})
	cfg.Database = name
	return cfg
}

func TestEmptyStore_HeadRevision_Integration(t *testing.T) {
	// The ark_cdc slot name is cluster-wide and already taken by the shared test
	// database, so this backend runs without a WAL consumer and live events come
	// from the broadcaster's safety-net relist.
	withFastRelist(t, 500*time.Millisecond)
	cfg := freshDatabaseConfig(t)
	backend, err := New(cfg, &bookmarkIntegrationConverter{})
	if err != nil {
		t.Fatalf("Failed to create backend: %v", err)
	}
	defer backend.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	testNS := "integration-test"
	testKind := "EmptyStoreResource"

	t.Run("list on an empty store carries a resourceVersion", func(t *testing.T) {
		objects, _, listRV, err := backend.List(ctx, testKind, testNS, storage.ListOptions{})
		if err != nil {
			t.Fatalf("List failed: %v", err)
		}
		if len(objects) != 0 {
			t.Fatalf("List returned %d objects on an empty store", len(objects))
		}
		if listRV != 1 {
			t.Errorf("list resourceVersion = %d, want 1", listRV)
		}
	})

	t.Run("watchlist on an empty store gets the initial-events-end bookmark", func(t *testing.T) {
		w, err := backend.Watch(ctx, testKind, testNS, storage.WatchOptions{
			AllowWatchBookmarks: true,
			SendInitialEvents:   true,
		})
		if err != nil {
			t.Fatalf("Watch failed: %v", err)
		}
		defer w.Stop()

		select {
		case ev, ok := <-w.ResultChan():
			if !ok {
				t.Fatal("watch closed before the terminal bookmark")
			}
			if ev.Type != watch.Bookmark {
				t.Fatalf("first event on an empty store is %s, want %s", ev.Type, watch.Bookmark)
			}
			if v, found := bookmarkAnnotation(t, ev); !found || v != "true" {
				t.Errorf("terminal bookmark annotation = %q (present=%v), want \"true\"", v, found)
			}
			acc, _ := meta.Accessor(ev.Object)
			if acc.GetResourceVersion() != "1" {
				t.Errorf("terminal bookmark resourceVersion = %q, want \"1\"", acc.GetResourceVersion())
			}
		case <-time.After(5 * time.Second):
			t.Fatal("no terminal bookmark within 5s on an empty store")
		}
	})

	// A reflector that synced on the empty store re-watches from the bookmark RV,
	// so the first write must land above it and reach that watch.
	t.Run("a watch resumed from the bootstrapped head sees the first write", func(t *testing.T) {
		w, err := backend.Watch(ctx, testKind, testNS, storage.WatchOptions{ResourceVersion: "1"})
		if err != nil {
			t.Fatalf("Watch failed: %v", err)
		}
		defer w.Stop()

		obj := &integrationTestObject{APIVersion: "ark.mckinsey.com/v1alpha1", Kind: testKind}
		obj.Metadata.Name = "first-write"
		obj.Metadata.Namespace = testNS
		obj.Metadata.UID = "test-uid-empty-store-first-write"
		obj.Spec = map[string]interface{}{"k": "v"}
		if err := backend.Create(ctx, testKind, testNS, obj.Metadata.Name, obj); err != nil {
			t.Fatalf("Create failed: %v", err)
		}
		rv, err := backend.GetResourceVersion(ctx, testKind, testNS, obj.Metadata.Name)
		if err != nil {
			t.Fatalf("GetResourceVersion failed: %v", err)
		}
		if rv <= 1 {
			t.Fatalf("first write got resourceVersion %d, want above the bootstrapped head 1", rv)
		}

		ev := nextEventOfType(t, w, watch.Added, 10*time.Second)
		got, ok := ev.Object.(*integrationTestObject)
		if !ok || got.Metadata.Name != obj.Metadata.Name {
			t.Errorf("resumed watch event object = %#v, want %q", ev.Object, obj.Metadata.Name)
		}
	})

	t.Run("re-initializing the schema does not burn another revision", func(t *testing.T) {
		before, err := backend.GetResourceVersion(ctx, testKind, testNS, "first-write")
		if err != nil {
			t.Fatalf("GetResourceVersion failed: %v", err)
		}
		again, err := New(cfg, &bookmarkIntegrationConverter{})
		if err != nil {
			t.Fatalf("second New failed: %v", err)
		}
		defer again.Close()
		if again.headRevisionBase != 1 {
			t.Errorf("headRevisionBase after re-init = %d, want 1", again.headRevisionBase)
		}

		obj := &integrationTestObject{APIVersion: "ark.mckinsey.com/v1alpha1", Kind: testKind}
		obj.Metadata.Name = "second-write"
		obj.Metadata.Namespace = testNS
		obj.Metadata.UID = "test-uid-empty-store-second-write"
		obj.Spec = map[string]interface{}{"k": "v"}
		if err := again.Create(ctx, testKind, testNS, obj.Metadata.Name, obj); err != nil {
			t.Fatalf("Create failed: %v", err)
		}
		after, err := again.GetResourceVersion(ctx, testKind, testNS, obj.Metadata.Name)
		if err != nil {
			t.Fatalf("GetResourceVersion failed: %v", err)
		}
		if after != before+1 {
			t.Errorf("write after re-init got resourceVersion %d, want %s", after, strconv.FormatInt(before+1, 10))
		}
	})
}
