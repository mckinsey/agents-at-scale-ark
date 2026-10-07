//go:build integration
// +build integration

/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"strconv"
	"testing"
	"time"

	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/watch"

	"mckinsey.com/ark/internal/storage"
)

// bookmarkIntegrationConverter stores integrationTestObject rows like the
// other integration tests but hands sendBookmark an object with real metadata,
// which integrationTestObject lacks, so resourceVersion and annotations land
// on the bookmark the way they do with the apiserver's typed converter.
type bookmarkIntegrationConverter struct{ integrationMockConverter }

func (c *bookmarkIntegrationConverter) NewObject(kind string) runtime.Object {
	o := &unstructured.Unstructured{}
	o.SetAPIVersion("ark.mckinsey.com/v1alpha1")
	o.SetKind(kind)
	return o
}

func nextEventOfType(t *testing.T, w watch.Interface, want watch.EventType, timeout time.Duration) watch.Event {
	t.Helper()
	deadline := time.After(timeout)
	for {
		select {
		case ev, ok := <-w.ResultChan():
			if !ok {
				t.Fatalf("watch closed before a %s event arrived", want)
			}
			if ev.Type == want {
				return ev
			}
		case <-deadline:
			t.Fatalf("no %s event within %s", want, timeout)
		}
	}
}

func bookmarkAnnotation(t *testing.T, ev watch.Event) (string, bool) {
	t.Helper()
	acc, err := meta.Accessor(ev.Object)
	if err != nil {
		t.Fatalf("bookmark object has no metadata: %v", err)
	}
	v, ok := acc.GetAnnotations()["k8s.io/initial-events-end"]
	return v, ok
}

func TestWatch_BookmarkAnnotation_Integration(t *testing.T) {
	cfg := testConfig(t)
	backend, err := New(cfg, &bookmarkIntegrationConverter{})
	if err != nil {
		t.Fatalf("Failed to create backend: %v", err)
	}
	defer backend.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	testNS := "integration-test"
	testKind := "BookmarkResource"
	testName := "bookmark-annotation-resource"
	_, _ = backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1 AND namespace = $2", testKind, testNS)

	obj := &integrationTestObject{APIVersion: "ark.mckinsey.com/v1alpha1", Kind: testKind}
	obj.Metadata.Name = testName
	obj.Metadata.Namespace = testNS
	obj.Metadata.UID = "test-uid-bookmark-annotation"
	obj.Spec = map[string]interface{}{"k": "v"}
	if err := backend.Create(ctx, testKind, testNS, testName, obj); err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	rv, err := backend.GetResourceVersion(ctx, testKind, testNS, testName)
	if err != nil {
		t.Fatalf("GetResourceVersion failed: %v", err)
	}

	t.Run("resumed watch gets a plain bookmark", func(t *testing.T) {
		w, err := backend.Watch(ctx, testKind, testNS, storage.WatchOptions{
			ResourceVersion:     strconv.FormatInt(rv, 10),
			AllowWatchBookmarks: true,
		})
		if err != nil {
			t.Fatalf("Watch failed: %v", err)
		}
		defer w.Stop()

		ev := nextEventOfType(t, w, watch.Bookmark, 10*time.Second)
		if v, found := bookmarkAnnotation(t, ev); found {
			t.Errorf("resumed watch bookmark carries initial-events-end=%q", v)
		}
	})

	t.Run("watchlist gets the initial state then an annotated bookmark", func(t *testing.T) {
		w, err := backend.Watch(ctx, testKind, testNS, storage.WatchOptions{
			AllowWatchBookmarks: true,
			SendInitialEvents:   true,
		})
		if err != nil {
			t.Fatalf("Watch failed: %v", err)
		}
		defer w.Stop()

		first := nextEventOfType(t, w, watch.Added, 10*time.Second)
		acc, err := meta.Accessor(first.Object)
		if err == nil && acc.GetName() != "" && acc.GetName() != testName {
			t.Errorf("initial ADDED event is for %q, want %q", acc.GetName(), testName)
		}
		bm := nextEventOfType(t, w, watch.Bookmark, 10*time.Second)
		if v, found := bookmarkAnnotation(t, bm); !found || v != "true" {
			t.Errorf("watchlist terminal bookmark annotation = %q (present=%v), want \"true\"", v, found)
		}
		bmAcc, _ := meta.Accessor(bm.Object)
		if got, _ := strconv.ParseInt(bmAcc.GetResourceVersion(), 10, 64); got < rv {
			t.Errorf("terminal bookmark resourceVersion %d is below the object's %d", got, rv)
		}
	})

	t.Run("no bookmark without allowWatchBookmarks", func(t *testing.T) {
		w, err := backend.Watch(ctx, testKind, testNS, storage.WatchOptions{})
		if err != nil {
			t.Fatalf("Watch failed: %v", err)
		}
		defer w.Stop()

		quiet := time.After(3 * time.Second)
		for {
			select {
			case ev, ok := <-w.ResultChan():
				if !ok {
					t.Fatal("watch closed unexpectedly")
				}
				if ev.Type == watch.Bookmark {
					t.Fatal("bookmark sent to a client that did not set allowWatchBookmarks")
				}
			case <-quiet:
				return
			}
		}
	})
}
