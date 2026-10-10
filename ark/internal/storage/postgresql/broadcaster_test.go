/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"database/sql"
	"sync"
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	k8slabels "k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/watch"
)

func newObj(name, uid string, labels map[string]string) *unstructured.Unstructured {
	o := &unstructured.Unstructured{}
	o.SetAPIVersion("ark.mckinsey.com/v1alpha1")
	o.SetKind("Agent")
	o.SetNamespace("default")
	o.SetName(name)
	o.SetUID(types.UID(uid))
	if labels != nil {
		o.SetLabels(labels)
	}
	return o
}

func newFanoutWatcher(ns string, lf map[string]string, inputBuf, outBuf int) *postgresWatcher {
	var sel k8slabels.Selector
	if len(lf) > 0 {
		// SelectorFromSet yields equality requirements, matching the old
		// equality-map semantics these fan-out tests were written against.
		sel = k8slabels.SelectorFromSet(lf)
	}
	return &postgresWatcher{
		outCh:    make(chan watch.Event, outBuf),
		inputCh:  make(chan *changeRow, inputBuf),
		ns:       ns,
		labelSel: sel,
		ctx:      context.Background(),
		done:     make(chan struct{}),
		seenRVs:  make(map[string]int64),
	}
}

type noMetaObj struct{}

func (n *noMetaObj) GetObjectKind() schema.ObjectKind { return schema.EmptyObjectKind }
func (n *noMetaObj) DeepCopyObject() runtime.Object   { return &noMetaObj{} }

func TestMatchesWatcher_Namespace(t *testing.T) {
	t.Parallel()
	row := &changeRow{ns: "default", obj: newObj("a", "u1", nil)}

	tests := []struct {
		name    string
		watcher *postgresWatcher
		want    bool
	}{
		{"all-namespace watcher matches", newFanoutWatcher("", nil, 1, 1), true},
		{"exact namespace matches", newFanoutWatcher("default", nil, 1, 1), true},
		{"different namespace excluded", newFanoutWatcher("other", nil, 1, 1), false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := matchesWatcher(tc.watcher, row); got != tc.want {
				t.Errorf("matchesWatcher = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestMatchesWatcher_Labels(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name   string
		filter map[string]string
		labels map[string]string
		want   bool
	}{
		{"no filter matches anything", nil, map[string]string{"app": "x"}, true},
		{"single label match", map[string]string{"app": "foo"}, map[string]string{"app": "foo"}, true},
		{"label value mismatch", map[string]string{"app": "foo"}, map[string]string{"app": "bar"}, false},
		{"missing label", map[string]string{"app": "foo"}, map[string]string{"team": "x"}, false},
		{"object has no labels", map[string]string{"app": "foo"}, nil, false},
		{"all filter keys must match", map[string]string{"app": "foo", "tier": "be"}, map[string]string{"app": "foo"}, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			w := newFanoutWatcher("default", tc.filter, 1, 1)
			row := &changeRow{ns: "default", obj: newObj("a", "u1", tc.labels)}
			if got := matchesWatcher(w, row); got != tc.want {
				t.Errorf("matchesWatcher = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestMatchesWatcher_AccessorErrorExcludes(t *testing.T) {
	t.Parallel()
	w := newFanoutWatcher("default", map[string]string{"app": "foo"}, 1, 1)
	row := &changeRow{ns: "default", obj: &noMetaObj{}}
	if matchesWatcher(w, row) {
		t.Error("label-filtered watcher must not match an object whose labels cannot be read")
	}
}

func TestMatchesWatcher_SetBasedLabels(t *testing.T) {
	t.Parallel()
	sel, err := k8slabels.Parse("tier in (frontend, backend), env != prod")
	if err != nil {
		t.Fatalf("parse selector: %v", err)
	}
	w := newFanoutWatcher("default", nil, 1, 1)
	w.labelSel = sel

	tests := []struct {
		name   string
		labels map[string]string
		want   bool
	}{
		{"in-set and env not prod matches", map[string]string{"tier": "frontend", "env": "dev"}, true},
		{"in-set but env prod excluded", map[string]string{"tier": "backend", "env": "prod"}, false},
		{"tier not in set excluded", map[string]string{"tier": "db", "env": "dev"}, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			row := &changeRow{ns: "default", obj: newObj("a", "u1", tc.labels)}
			if got := matchesWatcher(w, row); got != tc.want {
				t.Errorf("matchesWatcher = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestMatchesWatcher_Fields(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name   string
		preds  []fieldPredicate
		object *unstructured.Unstructured
		want   bool
	}{
		{"name equals match", []fieldPredicate{{column: "name", op: "=", value: "a"}}, newObj("a", "u1", nil), true},
		{"name equals mismatch", []fieldPredicate{{column: "name", op: "=", value: "a"}}, newObj("b", "u1", nil), false},
		{"name not-equals excludes match", []fieldPredicate{{column: "name", op: "<>", value: "a"}}, newObj("a", "u1", nil), false},
		{"name not-equals allows other", []fieldPredicate{{column: "name", op: "<>", value: "a"}}, newObj("b", "u1", nil), true},
		{"namespace equals match", []fieldPredicate{{column: "namespace", op: "=", value: "default"}}, newObj("a", "u1", nil), true},
		{"namespace equals mismatch", []fieldPredicate{{column: "namespace", op: "=", value: "other"}}, newObj("a", "u1", nil), false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			w := newFanoutWatcher("", nil, 1, 1)
			w.fieldPreds = tc.preds
			row := &changeRow{ns: tc.object.GetNamespace(), obj: tc.object}
			if got := matchesWatcher(w, row); got != tc.want {
				t.Errorf("matchesWatcher = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestForwardRow_EventTypes(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name     string
		preseed  map[string]int64
		row      *changeRow
		wantType watch.EventType
	}{
		{
			name:     "first sighting of uid -> Added",
			row:      &changeRow{rv: 10, uid: "u1", ns: "default", obj: newObj("a", "u1", nil)},
			wantType: watch.Added,
		},
		{
			name:     "already-seen uid -> Modified",
			preseed:  map[string]int64{"u1": 5},
			row:      &changeRow{rv: 10, uid: "u1", ns: "default", obj: newObj("a", "u1", nil)},
			wantType: watch.Modified,
		},
		{
			name:     "deletion -> Deleted",
			preseed:  map[string]int64{"u1": 5},
			row:      &changeRow{rv: 10, uid: "u1", ns: "default", obj: newObj("a", "u1", nil), deleted: true},
			wantType: watch.Deleted,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			w := newFanoutWatcher("default", nil, 1, 1)
			for uid, rv := range tc.preseed {
				w.seenRVs[uid] = rv
			}
			if !w.forwardRow(tc.row) {
				t.Fatal("forwardRow returned false unexpectedly")
			}
			select {
			case ev := <-w.outCh:
				if ev.Type != tc.wantType {
					t.Errorf("event type = %v, want %v", ev.Type, tc.wantType)
				}
			default:
				t.Fatal("expected an event on outCh, got none")
			}
			if w.lastSeenRV.Load() != tc.row.rv {
				t.Errorf("lastSeenRV = %d, want %d", w.lastSeenRV.Load(), tc.row.rv)
			}
		})
	}
}

func TestForwardRow_DedupSkipsAlreadyEmitted(t *testing.T) {
	t.Parallel()
	w := newFanoutWatcher("default", nil, 1, 1)
	w.seenRVs["u1"] = 10

	if !w.forwardRow(&changeRow{rv: 10, uid: "u1", obj: newObj("a", "u1", nil)}) {
		t.Fatal("forwardRow should return true for a deduped row")
	}
	select {
	case ev := <-w.outCh:
		t.Fatalf("deduped row should emit nothing, got %v", ev.Type)
	default:
	}
}

func TestForwardRow_DeepCopiesSharedObject(t *testing.T) {
	t.Parallel()
	w := newFanoutWatcher("default", nil, 1, 1)
	shared := newObj("a", "u1", map[string]string{"app": "foo"})

	if !w.forwardRow(&changeRow{rv: 10, uid: "u1", ns: "default", obj: shared}) {
		t.Fatal("forwardRow returned false unexpectedly")
	}
	ev := <-w.outCh
	ev.Object.(*unstructured.Unstructured).SetLabels(map[string]string{"app": "MUTATED"})

	if shared.GetLabels()["app"] != "foo" {
		t.Errorf("shared object was mutated through the emitted copy: %v", shared.GetLabels())
	}
}

func TestForwardRow_ReturnsFalseWhenShuttingDown(t *testing.T) {
	t.Parallel()
	w := &postgresWatcher{
		outCh:   make(chan watch.Event),
		inputCh: make(chan *changeRow, 1),
		ns:      "default",
		ctx:     context.Background(),
		done:    make(chan struct{}),
		seenRVs: make(map[string]int64),
	}
	close(w.done)

	if w.forwardRow(&changeRow{rv: 1, uid: "u1", obj: newObj("a", "u1", nil)}) {
		t.Error("forwardRow should return false when the watcher is shutting down")
	}
}

func TestForwardRow_ReturnsFalseWhenContextCancelled(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	w := &postgresWatcher{
		outCh:   make(chan watch.Event),
		inputCh: make(chan *changeRow, 1),
		ns:      "default",
		ctx:     ctx,
		done:    make(chan struct{}),
		seenRVs: make(map[string]int64),
	}
	if w.forwardRow(&changeRow{rv: 1, uid: "u1", obj: newObj("a", "u1", nil)}) {
		t.Error("forwardRow should return false when the watcher context is cancelled")
	}
}

func TestFanout_RoutesOnlyToMatchingSubscribers(t *testing.T) {
	t.Parallel()
	_, bcs := newTestBackendWithBroadcasters("Agent")
	b := bcs["Agent"]

	wDefault := newFanoutWatcher("default", nil, 4, 4)
	wOther := newFanoutWatcher("other", nil, 4, 4)
	wAll := newFanoutWatcher("", nil, 4, 4)
	wLabel := newFanoutWatcher("default", map[string]string{"app": "foo"}, 4, 4)
	for _, w := range []*postgresWatcher{wDefault, wOther, wAll, wLabel} {
		b.subscribe(w)
	}

	b.fanout(&changeRow{rv: 10, uid: "u1", ns: "default", obj: newObj("a", "u1", map[string]string{"app": "bar"})})

	assertGotRow := func(name string, w *postgresWatcher, want bool) {
		select {
		case <-w.inputCh:
			if !want {
				t.Errorf("%s should NOT have received the row", name)
			}
		default:
			if want {
				t.Errorf("%s should have received the row", name)
			}
		}
	}
	assertGotRow("default-ns watcher", wDefault, true)
	assertGotRow("all-ns watcher", wAll, true)
	assertGotRow("other-ns watcher", wOther, false)
	assertGotRow("label-mismatch watcher", wLabel, false)
}

func TestFanout_FullBufferMarksBehindAndDrops(t *testing.T) {
	t.Parallel()
	_, bcs := newTestBackendWithBroadcasters("Agent")
	b := bcs["Agent"]

	w := newFanoutWatcher("default", nil, 1, 1)
	b.subscribe(w)

	first := &changeRow{rv: 10, uid: "u1", ns: "default", obj: newObj("a", "u1", nil)}
	second := &changeRow{rv: 11, uid: "u2", ns: "default", obj: newObj("b", "u2", nil)}

	b.fanout(first)
	if w.behind.Load() {
		t.Fatal("watcher should not be marked behind after the first buffered row")
	}
	b.fanout(second)
	if !w.behind.Load() {
		t.Error("watcher should be marked behind after a row was dropped into a full buffer")
	}
	if got := <-w.inputCh; got.rv != 10 {
		t.Errorf("buffered row rv = %d, want 10", got.rv)
	}
	select {
	case <-w.inputCh:
		t.Error("second row should have been dropped, not buffered")
	default:
	}
}

func TestBroadcaster_AdvanceRVMonotonic(t *testing.T) {
	t.Parallel()
	b := newKindBroadcaster(nil, "Agent")
	b.advanceRV(100)
	b.advanceRV(50)
	if got := b.lastSeenRV.Load(); got != 100 {
		t.Errorf("lastSeenRV = %d, want 100", got)
	}
	b.advanceRV(150)
	if got := b.lastSeenRV.Load(); got != 150 {
		t.Errorf("lastSeenRV = %d, want 150", got)
	}
}

func TestBroadcaster_MarkSeen(t *testing.T) {
	t.Parallel()
	b := newKindBroadcaster(nil, "Agent")
	if b.markSeen("u1", 10) {
		t.Error("markSeen should return false for a new uid")
	}
	if !b.markSeen("u1", 10) {
		t.Error("markSeen should return true for the same uid/rv")
	}
	if !b.markSeen("u1", 9) {
		t.Error("markSeen should return true for a lower rv on the same uid")
	}
	if b.markSeen("u1", 11) {
		t.Error("markSeen should return false for a higher rv on the same uid")
	}
}

func TestBroadcaster_PruneSeen(t *testing.T) {
	t.Parallel()
	b := newKindBroadcaster(nil, "Agent")
	b.seenRVs["old"] = 1
	b.seenRVs["recent"] = 9000
	b.lastSeenRV.Store(10000)

	b.pruneSeen()

	if _, ok := b.seenRVs["old"]; ok {
		t.Error("entry far below the cursor should have been pruned")
	}
	if _, ok := b.seenRVs["recent"]; !ok {
		t.Error("entry within the retention window should be kept")
	}
}

func TestBroadcaster_PruneSeenNoOpNearZero(t *testing.T) {
	t.Parallel()
	b := newKindBroadcaster(nil, "Agent")
	b.seenRVs["u1"] = 1
	b.lastSeenRV.Store(100)
	b.pruneSeen()
	if _, ok := b.seenRVs["u1"]; !ok {
		t.Error("pruneSeen must be a no-op when the prune floor is <= 0")
	}
}

func TestBroadcaster_NudgeCoalesces(t *testing.T) {
	t.Parallel()
	b := newKindBroadcaster(nil, "Agent")
	b.nudge()
	b.nudge()
	if !nudged(b) {
		t.Fatal("expected one pending nudge")
	}
	if nudged(b) {
		t.Error("nudges should coalesce: only one pending signal expected")
	}
}

func TestBroadcaster_IsDone(t *testing.T) {
	t.Parallel()
	b := newKindBroadcaster(nil, "Agent")
	if b.isDone() {
		t.Error("a fresh broadcaster should not be done")
	}
	close(b.done)
	if !b.isDone() {
		t.Error("broadcaster should report done after its done channel is closed")
	}
}

func TestSubscribeUnsubscribe_TeardownOnLastLeave(t *testing.T) {
	t.Parallel()
	backend, bcs := newTestBackendWithBroadcasters("Agent")
	b := bcs["Agent"]

	w1 := newFanoutWatcher("default", nil, 1, 1)
	w2 := newFanoutWatcher("other", nil, 1, 1)
	b.subscribe(w1)
	b.subscribe(w2)

	b.unsubscribe(w1)
	if b.isDone() {
		t.Fatal("broadcaster torn down while a subscriber remains")
	}
	if _, ok := backend.broadcasters["Agent"]; !ok {
		t.Fatal("broadcaster removed from map while a subscriber remains")
	}

	b.unsubscribe(w2)
	if !b.isDone() {
		t.Error("broadcaster should be done after the last subscriber leaves")
	}
	if _, ok := backend.broadcasters["Agent"]; ok {
		t.Error("broadcaster should be removed from the backend map after the last subscriber leaves")
	}

	b.unsubscribe(w2)
}

func TestUnsubscribe_DoesNotDeleteReplacementBroadcaster(t *testing.T) {
	t.Parallel()
	backend, bcs := newTestBackendWithBroadcasters("Agent")
	stale := bcs["Agent"]
	w := newFanoutWatcher("default", nil, 1, 1)
	stale.subscribe(w)

	replacement := newKindBroadcaster(backend, "Agent")
	backend.broadcasters["Agent"] = replacement

	stale.unsubscribe(w)

	if got := backend.broadcasters["Agent"]; got != replacement {
		t.Error("unsubscribe of a stale broadcaster must not evict the live replacement from the map")
	}
}

func TestGetOrCreateBroadcasterAndSubscribe_RaceWithTeardown(t *testing.T) {
	db, err := sql.Open("postgres", "")
	if err != nil {
		t.Fatalf("sql.Open: %v", err)
	}
	defer func() { _ = db.Close() }()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	backend := &PostgreSQLBackend{
		db:           db,
		broadcasters: make(map[string]*kindBroadcaster),
		ctx:          ctx,
		cancel:       cancel,
	}

	const iterations = 2000
	const newcomers = 4
	for i := 0; i < iterations; i++ {
		old := newFanoutWatcher("default", nil, 1, 1)
		b := backend.getOrCreateBroadcasterAndSubscribe("Agent", old)
		old.bc = b

		var startGate sync.WaitGroup
		startGate.Add(1)
		var wg sync.WaitGroup
		got := make([]*kindBroadcaster, newcomers)
		watchers := make([]*postgresWatcher, newcomers)

		wg.Add(1)
		go func() {
			defer wg.Done()
			startGate.Wait()
			b.unsubscribe(old)
		}()
		for j := 0; j < newcomers; j++ {
			watchers[j] = newFanoutWatcher("default", nil, 1, 1)
			wg.Add(1)
			go func(j int) {
				defer wg.Done()
				startGate.Wait()
				got[j] = backend.getOrCreateBroadcasterAndSubscribe("Agent", watchers[j])
				watchers[j].bc = got[j]
			}(j)
		}
		startGate.Done()
		wg.Wait()

		for j := 0; j < newcomers; j++ {
			if got[j].isDone() {
				t.Fatalf("iter %d newcomer %d: attached to a torn-down broadcaster", i, j)
			}
			got[j].subMu.RLock()
			_, ok := got[j].subscribers[watchers[j]]
			got[j].subMu.RUnlock()
			if !ok {
				t.Fatalf("iter %d newcomer %d: missing from its broadcaster's subscriber set", i, j)
			}
		}
		for j := 0; j < newcomers; j++ {
			watchers[j].bc.unsubscribe(watchers[j])
		}
	}
}
