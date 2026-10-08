/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"database/sql"
	"testing"
	"time"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/watch"

	"mckinsey.com/ark/internal/storage"
)

func fillOutCh(w *postgresWatcher) int {
	n := 0
	for {
		select {
		case w.outCh <- watch.Event{Type: watch.Added, Object: &unstructured.Unstructured{}}:
			n++
		default:
			return n
		}
	}
}

func TestSendBookmark_InitialEventsEndWaitsForRoomInOutCh(t *testing.T) {
	w := newBookmarkWatcher(storage.WatchOptions{SendInitialEvents: true, AllowWatchBookmarks: true})
	queued := fillOutCh(w)

	sent := make(chan struct{})
	go func() {
		w.sendBookmark()
		close(sent)
	}()

	select {
	case <-sent:
		t.Fatal("sendBookmark returned while outCh was full; the initial-events-end bookmark was dropped")
	case <-time.After(100 * time.Millisecond):
	}

	for i := 0; i < queued; i++ {
		<-w.outCh
	}
	select {
	case ev := <-w.outCh:
		if got := bookmarkMeta(t, ev).GetAnnotations()[initialEventsEndAnnotation]; got != initialEventsEndValue {
			t.Fatalf("bookmark after the initial state has annotation %q, want %q", got, initialEventsEndValue)
		}
	case <-time.After(time.Second):
		t.Fatal("initial-events-end bookmark never arrived after outCh drained")
	}
	<-sent
	if !w.initialEventsBookmarkSent {
		t.Error("initialEventsBookmarkSent not recorded after the bookmark went out")
	}
}

func TestSendBookmark_InitialEventsEndNotRecordedWhenWatcherStops(t *testing.T) {
	w := newBookmarkWatcher(storage.WatchOptions{SendInitialEvents: true, AllowWatchBookmarks: true})
	fillOutCh(w)
	close(w.done)

	w.sendBookmark()

	if w.initialEventsBookmarkSent {
		t.Error("initialEventsBookmarkSent recorded although the bookmark was never sent")
	}
}

func TestSendBookmark_PeriodicBookmarkDoesNotBlockOnFullOutCh(t *testing.T) {
	w := newBookmarkWatcher(storage.WatchOptions{SendInitialEvents: true, AllowWatchBookmarks: true})
	w.initialEventsBookmarkSent = true
	fillOutCh(w)

	sent := make(chan struct{})
	go func() {
		w.sendBookmark()
		close(sent)
	}()
	select {
	case <-sent:
	case <-time.After(time.Second):
		t.Fatal("periodic bookmark blocked on a full outCh")
	}
}

func TestForwardRow_DropsRowsUntilTheInitialRelistSucceeds(t *testing.T) {
	w := newBookmarkWatcher(storage.WatchOptions{SendInitialEvents: true, AllowWatchBookmarks: true})
	w.initialSynced = false

	row := &changeRow{rv: 10000, uid: "uid-a", ns: "default", obj: &unstructured.Unstructured{}}
	if !w.forwardRow(row) {
		t.Fatal("forwardRow reported shutdown")
	}
	if ev, ok := takeEvent(t, w); ok {
		t.Fatalf("forwarded a %s before the initial relist succeeded", ev.Type)
	}
	if got := w.lastSeenRV.Load(); got != 0 {
		t.Errorf("lastSeenRV = %d after a dropped row, want 0 so the recovery relist reads the full state", got)
	}
	if w.hasSeenUID(row.uid) {
		t.Error("dropped row recorded in seenRVs; the recovery relist would skip it")
	}

	w.initialSynced = true
	if !w.forwardRow(row) {
		t.Fatal("forwardRow reported shutdown")
	}
	if _, ok := takeEvent(t, w); !ok {
		t.Error("row not forwarded once the initial relist succeeded")
	}
}

func emitTombstone(w *postgresWatcher, uid string, rv int64) {
	w.emitRow(rv, 1, "default", "obj", uid, nil, nil, nil, nil, nil, nil, time.Now(),
		sql.NullTime{Time: time.Now(), Valid: true}, sql.NullTime{})
}

func TestEmitRow_InitialRelistSkipsTombstoneOfUnseenObject(t *testing.T) {
	w := newBookmarkWatcher(storage.WatchOptions{SendInitialEvents: true, AllowWatchBookmarks: true})
	w.initialSynced = false

	emitTombstone(w, "uid-gone", 50)

	if ev, ok := takeEvent(t, w); ok {
		t.Fatalf("initial relist emitted a %s for a tombstone the client never saw", ev.Type)
	}
	if !w.hasSeenUID("uid-gone") {
		t.Error("skipped tombstone not marked seen; the broadcaster fan-out would deliver it later")
	}
}

// A failed initial relist may already have emitted an object; when the retry
// finds it deleted, the client must get the DELETED or it keeps the object.
func TestEmitRow_RetriedInitialRelistDeliversTombstoneOfEmittedObject(t *testing.T) {
	w := newBookmarkWatcher(storage.WatchOptions{SendInitialEvents: true, AllowWatchBookmarks: true})
	w.initialSynced = false
	w.markSeen("uid-a", 100)

	emitTombstone(w, "uid-a", 101)

	ev, ok := takeEvent(t, w)
	if !ok {
		t.Fatal("tombstone of an object the client already received was swallowed")
	}
	if ev.Type != watch.Deleted {
		t.Errorf("event type = %s, want %s", ev.Type, watch.Deleted)
	}
}
