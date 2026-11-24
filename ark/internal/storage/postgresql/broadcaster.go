/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"github.com/lib/pq"
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

// relistInterval is the safety-net cadence for the per-kind relist ticker. A var,
// not a const, so integration tests can shorten it; production keeps 120s.
var relistInterval = 120 * time.Second

func (b *kindBroadcaster) run() {
	relistTicker := time.NewTicker(relistInterval)
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

const broadcasterRelistKeysQuery = `
		SELECT resource_version, uid
		FROM resources
		WHERE kind = $1 AND resource_version > $2
		ORDER BY resource_version ASC`

const broadcasterRelistRowsQuery = `
		SELECT resource_version, generation, namespace, name, uid, spec, status, labels, annotations, finalizers, owner_references, created_at, deleted_at, deletion_timestamp
		FROM resources
		WHERE kind = $1 AND resource_version = ANY($2)
		ORDER BY resource_version ASC`

// relist fans out the rows of one kind that changed since the cursor. The lookback
// window is read as (resource_version, uid) pairs only; spec and status are loaded
// just for the rows no earlier relist has delivered, so the cost of re-reading the
// window no longer grows with object size. Namespace/label filters are in-memory
// predicates applied at fan-out, once per kind rather than once per watcher.
func (b *kindBroadcaster) relist() {
	const relistQueryTimeout = 30 * time.Second
	from := b.lastSeenRV.Load() - relistLookbackRVs
	if from < 0 {
		from = 0
	}

	broadcasterRelistTotal.WithLabelValues(b.kind).Inc()
	ctx, cancel := context.WithTimeout(b.backend.ctx, relistQueryTimeout)
	defer cancel()

	maxRV, unseen, err := b.scanWindow(ctx, from)
	if err != nil {
		b.onRelistFailure(err)
		return
	}
	if err := b.fanoutRows(ctx, unseen); err != nil {
		b.onRelistFailure(err)
		return
	}

	b.advanceRV(maxRV)
	b.pruneSeen()
	b.consecutiveFailures = 0
}

func (b *kindBroadcaster) scanWindow(ctx context.Context, from int64) (int64, []int64, error) {
	rows, err := b.backend.db.QueryContext(ctx, broadcasterRelistKeysQuery, b.kind, from)
	if err != nil {
		return 0, nil, err
	}
	defer func() { _ = rows.Close() }()

	maxRV := b.lastSeenRV.Load()
	var unseen []int64
	for rows.Next() {
		var rv int64
		var uid string
		if err := rows.Scan(&rv, &uid); err != nil {
			return 0, nil, err
		}
		if rv > maxRV {
			maxRV = rv
		}
		if !b.hasSeen(uid, rv) {
			unseen = append(unseen, rv)
		}
	}
	if err := rows.Err(); err != nil {
		return 0, nil, err
	}
	return maxRV, unseen, nil
}

func (b *kindBroadcaster) fanoutRows(ctx context.Context, rvs []int64) error {
	if len(rvs) == 0 {
		return nil
	}
	rows, err := b.backend.db.QueryContext(ctx, broadcasterRelistRowsQuery, b.kind, pq.Array(rvs))
	if err != nil {
		return err
	}
	defer func() { _ = rows.Close() }()

	for rows.Next() {
		r, err := scanChangeRow(rows)
		if err != nil {
			return err
		}
		if b.markSeen(r.uid, r.rv) {
			continue
		}
		obj, rErr := b.backend.reconstructObject(b.kind, r.ns, r.name, r.rv, r.generation, r.uid, string(r.spec), string(r.status), string(r.labels), string(r.annotations), string(r.finalizers), string(r.ownerRefs), r.createdAt, nullTimePtr(r.deletionTimestamp))
		if rErr != nil {
			continue
		}
		b.fanout(&changeRow{rv: r.rv, uid: r.uid, ns: r.ns, obj: obj, deleted: r.deletedAt.Valid})
	}
	return rows.Err()
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

func (b *kindBroadcaster) hasSeen(uid string, rv int64) bool {
	b.seenMu.Lock()
	defer b.seenMu.Unlock()
	seen, ok := b.seenRVs[uid]
	return ok && seen >= rv
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
