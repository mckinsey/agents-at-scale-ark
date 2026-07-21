/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"database/sql"
	"sync"
	"sync/atomic"
	"time"

	"k8s.io/apimachinery/pkg/api/meta"
	k8slabels "k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/klog/v2"
)

// kindBroadcaster is the in-process watch cache for a single resource kind: one
// relist per write fanned out to all subscribers in memory, instead of O(watchers)
// relists. Created lazily on the first watcher of a kind, torn down with the last.
// It owns the per-kind relist cursor; subscribers still apply their own (uid, rv)
// dedup and namespace/label filtering.
type kindBroadcaster struct {
	backend *PostgreSQLBackend
	kind    string

	// nudgeCh coalesces relist requests (buffer 1 + non-blocking send).
	nudgeCh chan struct{}
	done    chan struct{}
	closed  sync.Once

	// per-kind relist cursor + dedup set (the lookback/seenRVs commit-order-race
	// mitigation documented on relist()).
	lastSeenRV atomic.Int64
	seenMu     sync.Mutex
	seenRVs    map[string]int64

	subMu       sync.RWMutex
	subscribers map[*postgresWatcher]struct{}

	consecutiveFailures int
}

func newKindBroadcaster(backend *PostgreSQLBackend, kind string) *kindBroadcaster {
	return &kindBroadcaster{
		backend:     backend,
		kind:        kind,
		nudgeCh:     make(chan struct{}, 1),
		done:        make(chan struct{}),
		seenRVs:     make(map[string]int64),
		subscribers: make(map[*postgresWatcher]struct{}),
	}
}

// changeRow is one relisted row, reconstructed once and shared read-only across
// subscribers (each deep-copies obj before emitting).
type changeRow struct {
	rv      int64
	uid     string
	ns      string
	obj     runtime.Object
	deleted bool
}

func (b *kindBroadcaster) nudge() {
	select {
	case b.nudgeCh <- struct{}{}:
	default:
	}
}

func (b *kindBroadcaster) isDone() bool {
	select {
	case <-b.done:
		return true
	default:
		return false
	}
}

func (b *kindBroadcaster) subscribe(w *postgresWatcher) {
	b.subMu.Lock()
	b.subscribers[w] = struct{}{}
	n := len(b.subscribers)
	b.subMu.Unlock()
	broadcasterActiveWatchers.WithLabelValues(b.kind).Set(float64(n))
}

func (b *kindBroadcaster) unsubscribe(w *postgresWatcher) {
	b.backend.mu.Lock()
	b.subMu.Lock()
	delete(b.subscribers, w)
	n := len(b.subscribers)
	if n == 0 {
		b.closed.Do(func() { close(b.done) })
		if b.backend.broadcasters[b.kind] == b {
			delete(b.backend.broadcasters, b.kind)
		}
	}
	b.subMu.Unlock()
	b.backend.mu.Unlock()
	broadcasterActiveWatchers.WithLabelValues(b.kind).Set(float64(n))
}

func (b *kindBroadcaster) run() {
	relistTicker := time.NewTicker(120 * time.Second)
	defer relistTicker.Stop()

	// Prime the cursor at the current max rv so the first relist fans out only
	// subsequent changes (watchers get current state from their own initial relist).
	// Done here, off backend.mu's critical path.
	b.lastSeenRV.Store(b.backend.currentMaxRV())
	b.relist()

	for {
		select {
		case <-b.done:
			return
		case <-b.backend.ctx.Done():
			return
		case <-b.nudgeCh:
			b.relist()
		case <-relistTicker.C:
			b.relist()
		}
	}
}

// relist runs ONE query for the kind and fans the rows out to all subscribers.
// Mirrors the old postgresWatcher.relist lookback/dedup semantics, but without the
// namespace/label SQL filters (those become in-memory predicates at fan-out) and
// once per kind rather than once per watcher.
func (b *kindBroadcaster) relist() {
	const lookback int64 = 500
	// relistQueryTimeout bounds a single relist query. run() calls relist()
	// inline on one goroutine, so an unbounded query would stall fan-out to
	// every subscriber of this kind; the deadline caps that blast radius.
	// Generous relative to the 120s safety-net tick, so it only trips a query
	// that is genuinely hung rather than merely large.
	const relistQueryTimeout = 30 * time.Second
	from := b.lastSeenRV.Load() - lookback
	if from < 0 {
		from = 0
	}

	query := `
		SELECT resource_version, generation, namespace, name, uid, spec, status, labels, annotations, finalizers, owner_references, created_at, deleted_at, deletion_timestamp
		FROM resources
		WHERE kind = $1 AND resource_version > $2
		ORDER BY resource_version ASC`

	broadcasterRelistTotal.WithLabelValues(b.kind).Inc()
	ctx, cancel := context.WithTimeout(b.backend.ctx, relistQueryTimeout)
	defer cancel()
	rows, err := b.backend.db.QueryContext(ctx, query, b.kind, from)
	if err != nil {
		b.onRelistFailure(err)
		return
	}
	defer func() { _ = rows.Close() }()

	maxRV := b.lastSeenRV.Load()
	for rows.Next() {
		var rv, generation int64
		var ns, name, uid string
		var spec, status, labels, annotations, finalizers, ownerRefs []byte
		var createdAt time.Time
		var deletedAt, deletionTimestamp sql.NullTime

		if err := rows.Scan(&rv, &generation, &ns, &name, &uid, &spec, &status, &labels, &annotations, &finalizers, &ownerRefs, &createdAt, &deletedAt, &deletionTimestamp); err != nil {
			// Partial read: do NOT advance the cursor, so the next relist re-reads
			// from the same point and nothing is permanently skipped.
			b.onRelistFailure(err)
			return
		}
		if rv > maxRV {
			maxRV = rv
		}
		if b.markSeen(uid, rv) {
			continue
		}
		obj, rErr := b.backend.reconstructObject(b.kind, ns, name, rv, generation, uid, string(spec), string(status), string(labels), string(annotations), string(finalizers), string(ownerRefs), createdAt, nullTimePtr(deletionTimestamp))
		if rErr != nil {
			continue
		}
		b.fanout(&changeRow{rv: rv, uid: uid, ns: ns, obj: obj, deleted: deletedAt.Valid})
	}
	if err := rows.Err(); err != nil {
		b.onRelistFailure(err)
		return
	}

	b.advanceRV(maxRV)
	b.pruneSeen()
	b.consecutiveFailures = 0
}

// onRelistFailure schedules a short-backoff retry (not the 120s tick). The cursor is
// not advanced, so the retry re-reads the same window; subscribers are never closed.
func (b *kindBroadcaster) onRelistFailure(err error) {
	b.consecutiveFailures++
	broadcasterRelistFailures.WithLabelValues(b.kind).Inc()
	if b.consecutiveFailures >= 5 {
		klog.Errorf("broadcaster %s: relist failed %d times in a row: %v", b.kind, b.consecutiveFailures, err)
	}
	delay := time.Duration(b.consecutiveFailures) * 250 * time.Millisecond
	if delay > 2*time.Second {
		delay = 2 * time.Second
	}
	time.AfterFunc(delay, b.nudge)
}

// fanout routes one row to each matching subscriber via a non-blocking send. A slow
// consumer (full inputCh) is marked "behind" (recovers via its own relist) rather
// than blocking dispatch to the others.
func (b *kindBroadcaster) fanout(row *changeRow) {
	b.subMu.RLock()
	defer b.subMu.RUnlock()
	for w := range b.subscribers {
		if !matchesWatcher(w, row) {
			continue
		}
		select {
		case w.inputCh <- row:
			broadcasterEventsDispatched.WithLabelValues(b.kind).Inc()
		default:
			w.behind.Store(true)
			broadcasterEventsDropped.WithLabelValues(b.kind).Inc()
		}
	}
}

// matchesWatcher reproduces the old per-watcher SQL filters in memory: exact
// namespace (or all-namespace when w.ns == "") plus equality label matching.
// matchesWatcher reproduces, in memory, the SQL filters a watcher's own relist
// would apply — namespace, label selector, and field predicates — so the shared
// per-kind relist can fan a single row out only to the watchers it belongs to.
func matchesWatcher(w *postgresWatcher, row *changeRow) bool {
	if w.ns != "" && w.ns != row.ns {
		return false
	}
	if w.labelSel == nil && len(w.fieldPreds) == 0 {
		return true
	}
	acc, err := meta.Accessor(row.obj)
	if err != nil {
		return false
	}
	if w.labelSel != nil && !w.labelSel.Matches(k8slabels.Set(acc.GetLabels())) {
		return false
	}
	for _, p := range w.fieldPreds {
		var v string
		switch p.column { // only "name"/"namespace" per supportedFieldColumns
		case "name":
			v = acc.GetName()
		case "namespace":
			v = acc.GetNamespace()
		}
		switch p.op { // only "=" / "<>" per supportedFieldOps
		case "=":
			if v != p.value {
				return false
			}
		case "<>":
			if v == p.value {
				return false
			}
		}
	}
	return true
}

func (b *kindBroadcaster) advanceRV(rv int64) {
	for {
		current := b.lastSeenRV.Load()
		if rv <= current {
			return
		}
		if b.lastSeenRV.CompareAndSwap(current, rv) {
			return
		}
	}
}

// markSeen returns true if (uid, rv) was already fanned out and should be skipped.
func (b *kindBroadcaster) markSeen(uid string, rv int64) bool {
	b.seenMu.Lock()
	defer b.seenMu.Unlock()
	if seen, ok := b.seenRVs[uid]; ok && seen >= rv {
		return true
	}
	b.seenRVs[uid] = rv
	return false
}

func (b *kindBroadcaster) pruneSeen() {
	pruneFloor := b.lastSeenRV.Load() - 5000
	if pruneFloor <= 0 {
		return
	}
	b.seenMu.Lock()
	defer b.seenMu.Unlock()
	for uid, rv := range b.seenRVs {
		if rv < pruneFloor {
			delete(b.seenRVs, uid)
		}
	}
}
