//go:build integration
// +build integration

/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"strconv"
	"testing"
	"time"

	"k8s.io/apimachinery/pkg/watch"

	"mckinsey.com/ark/internal/storage"
)

func newInitialStateObject(kind, ns, name string) *integrationTestObject {
	obj := &integrationTestObject{APIVersion: "ark.mckinsey.com/v1alpha1", Kind: kind}
	obj.Metadata.Name = name
	obj.Metadata.Namespace = ns
	obj.Metadata.UID = "test-uid-" + name
	obj.Spec = map[string]interface{}{"k": "v"}
	return obj
}

func eventName(t *testing.T, ev watch.Event) string {
	t.Helper()
	obj, ok := ev.Object.(*integrationTestObject)
	if !ok {
		t.Fatalf("unexpected object type %T", ev.Object)
	}
	return obj.Metadata.Name
}

// A tombstone still inside the retention window is not part of the current state:
// a watch that starts from nothing must not get a DELETED for an object it was
// never told about, neither before the initial-events-end bookmark nor from the
// broadcaster fan-out after it.
func TestWatch_InitialStateSkipsTombstones_Integration(t *testing.T) {
	withFastRelist(t, 300*time.Millisecond)
	cfg := testConfig(t)
	backend, err := New(cfg, &bookmarkIntegrationConverter{})
	if err != nil {
		t.Fatalf("Failed to create backend: %v", err)
	}
	defer backend.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	testNS := "integration-test"
	testKind := "InitialStateTombstoneResource"
	_, _ = backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1", testKind)

	gone := newInitialStateObject(testKind, testNS, "tombstoned")
	if err := backend.Create(ctx, testKind, testNS, gone.Metadata.Name, gone); err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	beforeDelete, err := backend.GetResourceVersion(ctx, testKind, testNS, gone.Metadata.Name)
	if err != nil {
		t.Fatalf("GetResourceVersion failed: %v", err)
	}
	if err := backend.Delete(ctx, testKind, testNS, gone.Metadata.Name); err != nil {
		t.Fatalf("Delete failed: %v", err)
	}
	live := newInitialStateObject(testKind, testNS, "live")
	if err := backend.Create(ctx, testKind, testNS, live.Metadata.Name, live); err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	for _, tc := range []struct {
		name string
		opts storage.WatchOptions
	}{
		{name: "watchlist", opts: storage.WatchOptions{AllowWatchBookmarks: true, SendInitialEvents: true}},
		{name: "watch from any resourceVersion", opts: storage.WatchOptions{AllowWatchBookmarks: true}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w, err := backend.Watch(ctx, testKind, testNS, tc.opts)
			if err != nil {
				t.Fatalf("Watch failed: %v", err)
			}
			defer w.Stop()

			var initial []string
			deadline := time.After(10 * time.Second)
		initialState:
			for {
				select {
				case ev, ok := <-w.ResultChan():
					if !ok {
						t.Fatal("watch closed before the first bookmark")
					}
					if ev.Type == watch.Bookmark {
						break initialState
					}
					if ev.Type != watch.Added {
						t.Errorf("initial state carries a %s event for %q", ev.Type, eventName(t, ev))
						continue
					}
					initial = append(initial, eventName(t, ev))
				case <-deadline:
					t.Fatalf("no bookmark within 10s; initial state so far: %v", initial)
				}
			}
			if len(initial) != 1 || initial[0] != live.Metadata.Name {
				t.Errorf("initial state = %v, want only %q", initial, live.Metadata.Name)
			}

			quiet := time.After(2 * time.Second)
			for {
				select {
				case ev, ok := <-w.ResultChan():
					if !ok {
						t.Fatal("watch closed unexpectedly")
					}
					if ev.Type == watch.Deleted {
						t.Fatalf("tombstone for %q delivered after the initial state", eventName(t, ev))
					}
				case <-quiet:
					return
				}
			}
		})
	}

	t.Run("a delete after the initial state still flows", func(t *testing.T) {
		w, err := backend.Watch(ctx, testKind, testNS, storage.WatchOptions{AllowWatchBookmarks: true, SendInitialEvents: true})
		if err != nil {
			t.Fatalf("Watch failed: %v", err)
		}
		defer w.Stop()
		nextEventOfType(t, w, watch.Bookmark, 10*time.Second)

		if err := backend.Delete(ctx, testKind, testNS, live.Metadata.Name); err != nil {
			t.Fatalf("Delete failed: %v", err)
		}
		ev := nextEventOfType(t, w, watch.Deleted, 10*time.Second)
		if got := eventName(t, ev); got != live.Metadata.Name {
			t.Errorf("DELETED for %q, want %q", got, live.Metadata.Name)
		}
	})

	t.Run("a resumed watch still gets the tombstone", func(t *testing.T) {
		w, err := backend.Watch(ctx, testKind, testNS, storage.WatchOptions{ResourceVersion: strconv.FormatInt(beforeDelete, 10)})
		if err != nil {
			t.Fatalf("Watch failed: %v", err)
		}
		defer w.Stop()

		deadline := time.After(10 * time.Second)
		for {
			select {
			case ev, ok := <-w.ResultChan():
				if !ok {
					t.Fatal("watch closed before the tombstone arrived")
				}
				if ev.Type == watch.Deleted && eventName(t, ev) == gone.Metadata.Name {
					return
				}
			case <-deadline:
				t.Fatalf("resumed watch from %d never got the DELETED for %q", beforeDelete, gone.Metadata.Name)
			}
		}
	})
}
