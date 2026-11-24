/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/runtime/serializer/json"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/apiserver/pkg/endpoints/handlers"
	apirequest "k8s.io/apiserver/pkg/endpoints/request"

	"mckinsey.com/ark/internal/storage"
)

const (
	initialEventsEndAnnotation = metav1.InitialEventsAnnotationKey
	initialEventsEndValue      = "true"
)

type bookmarkConverter struct{}

func (bookmarkConverter) NewObject(kind string) runtime.Object {
	o := &unstructured.Unstructured{}
	o.SetAPIVersion("ark.mckinsey.com/v1alpha1")
	o.SetKind(kind)
	return o
}
func (bookmarkConverter) NewListObject(string) runtime.Object           { return nil }
func (bookmarkConverter) Encode(runtime.Object) ([]byte, error)         { return nil, nil }
func (bookmarkConverter) Decode(string, []byte) (runtime.Object, error) { return nil, nil }
func (bookmarkConverter) APIVersion(string) string                      { return "ark.mckinsey.com/v1alpha1" }

// newBookmarkWatcher builds a watcher as Watch() would after a successful
// initial relist, with the store head at RV 7 and no database behind it.
func newBookmarkWatcher(opts storage.WatchOptions) *postgresWatcher {
	backend := &PostgreSQLBackend{converter: bookmarkConverter{}}
	backend.cachedRV.Store(7)
	return &postgresWatcher{
		outCh:             make(chan watch.Event, 8),
		backend:           backend,
		kind:              "Agent",
		ctx:               context.Background(),
		done:              make(chan struct{}),
		seenRVs:           make(map[string]int64),
		sendInitialEvents: opts.SendInitialEvents,
		allowBookmarks:    opts.AllowWatchBookmarks,
		initialSynced:     true,
		initialHeadRV:     7,
	}
}

func takeEvent(t *testing.T, w *postgresWatcher) (watch.Event, bool) {
	t.Helper()
	select {
	case ev := <-w.outCh:
		return ev, true
	default:
		return watch.Event{}, false
	}
}

func bookmarkMeta(t *testing.T, ev watch.Event) metav1.Object {
	t.Helper()
	if ev.Type != watch.Bookmark {
		t.Fatalf("event type = %s, want %s", ev.Type, watch.Bookmark)
	}
	acc, err := meta.Accessor(ev.Object)
	if err != nil {
		t.Fatalf("bookmark object has no metadata: %v", err)
	}
	return acc
}

func TestSendBookmark_OrdinaryWatchCarriesNoInitialEventsEnd(t *testing.T) {
	t.Parallel()
	w := newBookmarkWatcher(storage.WatchOptions{AllowWatchBookmarks: true, ResourceVersion: "3"})

	w.sendBookmark()

	ev, ok := takeEvent(t, w)
	if !ok {
		t.Fatal("expected a bookmark on an ordinary watch that opted in")
	}
	m := bookmarkMeta(t, ev)
	if m.GetResourceVersion() != "7" {
		t.Errorf("bookmark resourceVersion = %q, want store head 7", m.GetResourceVersion())
	}
	if _, found := m.GetAnnotations()[initialEventsEndAnnotation]; found {
		t.Errorf("ordinary watch bookmark carries %s; only WatchList requests may get it", initialEventsEndAnnotation)
	}
}

func TestSendBookmark_WatchListAnnotatesOnlyTheFirstBookmark(t *testing.T) {
	t.Parallel()
	w := newBookmarkWatcher(storage.WatchOptions{AllowWatchBookmarks: true, SendInitialEvents: true})

	w.sendBookmark()
	w.sendBookmark()

	first, _ := takeEvent(t, w)
	if got := bookmarkMeta(t, first).GetAnnotations()[initialEventsEndAnnotation]; got != initialEventsEndValue {
		t.Errorf("first WatchList bookmark annotation = %q, want \"true\"", got)
	}
	second, ok := takeEvent(t, w)
	if !ok {
		t.Fatal("expected a second bookmark")
	}
	if _, found := bookmarkMeta(t, second).GetAnnotations()[initialEventsEndAnnotation]; found {
		t.Error("the initial-events-end annotation must only be sent once")
	}
}

func TestSendBookmark_WatchListWaitsForTheInitialSync(t *testing.T) {
	t.Parallel()
	w := newBookmarkWatcher(storage.WatchOptions{AllowWatchBookmarks: true, SendInitialEvents: true})
	w.initialSynced = false

	w.sendBookmark()
	if ev, ok := takeEvent(t, w); ok {
		t.Fatalf("WatchList got a %s before the initial relist succeeded", ev.Type)
	}

	w.initialSynced = true
	w.sendBookmark()
	after, _ := takeEvent(t, w)
	if got := bookmarkMeta(t, after).GetAnnotations()[initialEventsEndAnnotation]; got != initialEventsEndValue {
		t.Errorf("annotation after the sync = %q, want \"true\"", got)
	}
}

func TestSendBookmark_WithoutAllowWatchBookmarksSendsNothing(t *testing.T) {
	t.Parallel()
	for name, opts := range map[string]storage.WatchOptions{
		"plain watch":                      {},
		"sendInitialEvents without opt-in": {SendInitialEvents: true},
	} {
		w := newBookmarkWatcher(opts)
		w.sendBookmark()
		if ev, ok := takeEvent(t, w); ok {
			t.Errorf("%s: got a %s event, want none", name, ev.Type)
		}
	}
}

type neverTimeout struct{}

func (neverTimeout) TimeoutCh() (<-chan time.Time, func() bool) {
	return nil, func() bool { return true }
}

// newWatchServer wires the real k8s.io/apiserver watch handler around w the way
// handleWatch does for an ordinary (non WatchList) request: the WatchList
// completion hook stays unset.
func newWatchServer(w watch.Interface) *handlers.WatchServer {
	gv := schema.GroupVersion{Group: "ark.mckinsey.com", Version: "v1alpha1"}
	scheme := runtime.NewScheme()
	metav1.AddToGroupVersion(scheme, gv)
	return &handlers.WatchServer{
		Watching: w,
		Scope: &handlers.RequestScope{
			Kind:     gv.WithKind("Agent"),
			Resource: gv.WithResource("agents"),
		},
		MediaType:       runtime.ContentTypeJSON,
		Framer:          json.Framer,
		Encoder:         json.NewSerializerWithOptions(json.DefaultMetaFactory, scheme, scheme, json.SerializerOptions{}),
		EmbeddedEncoder: unstructured.UnstructuredJSONScheme,
		TimeoutFactory:  neverTimeout{},
	}
}

func ordinaryWatchRequest(t *testing.T) *http.Request {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	t.Cleanup(cancel)
	ctx = apirequest.WithReceivedTimestamp(ctx, time.Now())
	url := "/apis/ark.mckinsey.com/v1alpha1/agents?watch=true&allowWatchBookmarks=true&resourceVersion=3"
	return httptest.NewRequest(http.MethodGet, url, nil).WithContext(ctx)
}

func TestWatchServer_OrdinaryWatchBookmarkKeepsTheStreamAlive(t *testing.T) {
	t.Parallel()
	w := newBookmarkWatcher(storage.WatchOptions{AllowWatchBookmarks: true, ResourceVersion: "3"})
	w.sendBookmark()
	close(w.outCh)
	rec := httptest.NewRecorder()

	newWatchServer(w).HandleHTTP(rec, ordinaryWatchRequest(t))

	body := rec.Body.String()
	if !strings.Contains(body, `"type":"BOOKMARK"`) {
		t.Fatalf("response has no bookmark event:\n%s", body)
	}
	if strings.Contains(body, initialEventsEndAnnotation) {
		t.Errorf("ordinary watch response carries %s:\n%s", initialEventsEndAnnotation, body)
	}
}

// Documents the upstream behaviour behind #3720: on an ordinary watch,
// k8s.io/apiserver 0.37 answers an initial-events-end bookmark by calling a
// hook that is only set for WatchList requests. It also proves the test above
// would catch the annotation coming back.
func TestWatchServer_InitialEventsEndOnOrdinaryWatchPanicsUpstream(t *testing.T) {
	t.Parallel()
	w := newBookmarkWatcher(storage.WatchOptions{AllowWatchBookmarks: true, SendInitialEvents: true})
	w.sendBookmark()
	close(w.outCh)

	defer func() {
		if recover() == nil {
			t.Fatal("expected the nil watchListCompleteHook panic; if upstream changed, re-check the storage contract")
		}
	}()
	newWatchServer(w).HandleHTTP(httptest.NewRecorder(), ordinaryWatchRequest(t))
}
