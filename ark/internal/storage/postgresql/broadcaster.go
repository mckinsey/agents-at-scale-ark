/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"database/sql"
	"sync"
	"sync/atomic"
	"time"

	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/klog/v2"
)

// kindBroadcaster is the in-process watch cache for a single resource kind. It is
// the missing layer that the etcd-backed apiserver gets for free from its cacher:
// instead of every watcher independently re-querying PostgreSQL on each write
// (O(watchers) relists per write), one broadcaster per kind runs a SINGLE relist
// and fans the resulting rows out to all subscribers over in-memory channels.
//
// A broadcaster is created lazily when the first watcher of a kind subscribes and
// torn down when the last one leaves (see PostgreSQLBackend.getOrCreateBroadcaster
// and kindBroadcaster.unsubscribe). It owns the per-kind relist cursor; each
// subscriber still applies its own (uid, rv) dedup and namespace/label filtering,
// so a row fanned out to a non-matching or already-seen watcher is simply ignored.
type kindBroadcaster struct {
	backend *PostgreSQLBackend
	kind    string

	// nudgeCh coalesces relist requests: WAL signals and retries collapse into at
	// most one pending relist (buffer 1 + non-blocking send), exactly like the old
	// per-watcher nudgeCh did, but now once per kind instead of once per watcher.
	nudgeCh chan struct{}
	done    chan struct{}
	closed  sync.Once

	// lastSeenRV / seenRVs are the per-kind relist cursor and dedup set. They serve
	// the same BIGSERIAL commit-order-race mitigation documented on relist(): the
	// lookback window re-reads recently-committed rows and seenRVs suppresses
	// re-fanning rows already dispatched.
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

// changeRow is one relisted row, reconstructed once by the broadcaster and shared
// (read-only) across subscribers. Each subscriber DeepCopyObject()s obj before
// emitting, so the shared pointer is never mutated.
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
	// subsequent changes, not the whole table — each watcher gets current state
	// from its own initial relist. Done here (not under backend.mu in
	// getOrCreateBroadcaster) to keep the DB query off the lock's critical path.
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
	rows, err := b.backend.db.QueryContext(b.backend.ctx, query, b.kind, from)
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

// onRelistFailure records the failure and schedules a short-backoff retry instead
// of waiting for the 120s safety tick. The cursor is deliberately not advanced, so
// the retry re-reads the same window. Subscribers are never closed — a transient DB
// blip must not tear down every informer for the kind.
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

// fanout routes one row to every matching subscriber via a non-blocking send. A
// slow consumer (full inputCh) is marked "behind" and recovers via its own relist;
// it never blocks dispatch to the other subscribers (no head-of-line blocking).
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
func matchesWatcher(w *postgresWatcher, row *changeRow) bool {
	if w.ns != "" && w.ns != row.ns {
		return false
	}
	if len(w.labelFilter) > 0 {
		acc, err := meta.Accessor(row.obj)
		if err != nil {
			return false
		}
		labels := acc.GetLabels()
		for k, v := range w.labelFilter {
			if labels[k] != v {
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
