/* Copyright 2025. McKinsey & Company */

package controller

import (
	"sync"
	"time"

	"k8s.io/apimachinery/pkg/types"
)

// fairScheduler bounds concurrent Query executions globally while giving each
// namespace an adaptive, max-min-fair share of the pool. It replaces the plain
// global semaphore so a single tenant flooding queries can't monopolize
// capacity and starve other tenants (issue #2698).
//
// The controller reconcile loop is pull-based: each queued Query key requeues
// on a fixed backoff and independently attempts to acquire a slot. This type is
// the gate those attempts consult — it does not own an ordering queue. Fairness
// comes from capping each namespace at its current share; when a slot frees and
// the entitled tenant isn't the one attempting acquisition, tenants already at
// their share are denied and the slot waits for the entitled tenant to cycle.
// A namespace counts as waiting for as long as it has queued Query keys, so its
// share does not depend on how quickly those keys are retried (issue #3458).
type fairScheduler struct {
	mu sync.Mutex

	// max is the global concurrency bound (MaxConcurrentQueries).
	max int
	// keyExpiry drops a queued key that has not retried for this long, so a key
	// missed by every removal path cannot keep its namespace waiting forever.
	keyExpiry time.Duration

	inFlight    int
	perNS       map[string]int
	queued      map[string]map[types.NamespacedName]time.Time
	lastAttempt map[string]time.Time
	lastPrune   time.Time

	now func() time.Time
}

const queuedKeyPruneInterval = time.Second

func newFairScheduler(maxConcurrent int, keyExpiry time.Duration) *fairScheduler {
	return &fairScheduler{
		max:         maxConcurrent,
		keyExpiry:   keyExpiry,
		perNS:       make(map[string]int),
		queued:      make(map[string]map[types.NamespacedName]time.Time),
		lastAttempt: make(map[string]time.Time),
		now:         time.Now,
	}
}

// tryAcquire grants a slot to the Query key if the global bound has room and
// its namespace is below its current fair share. On denial it records the key
// as queued (so its namespace counts toward the share divisor) and returns
// false; the caller requeues.
func (s *fairScheduler) tryAcquire(key types.NamespacedName) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	ns := key.Namespace
	now := s.now()
	s.pruneQueuedLocked(now)
	s.observeRetryLocked(ns, now)
	defer s.recordAttemptLocked(ns, now)

	if s.inFlight >= s.max {
		s.markQueuedLocked(key, now)
		s.publishLocked(ns)
		return false
	}

	share := s.shareLocked(ns)
	if s.perNS[ns] >= share && s.freeSlotsReservedForOthersLocked(ns, share) {
		s.markQueuedLocked(key, now)
		queryFairnessDeniedTotal.WithLabelValues(ns).Inc()
		s.publishLocked(ns)
		return false
	}

	s.inFlight++
	s.perNS[ns]++
	s.forgetLocked(key)
	s.publishLocked(ns)
	return true
}

// release returns a slot held by ns. It must be called exactly once per
// successful tryAcquire.
func (s *fairScheduler) release(ns string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.inFlight > 0 {
		s.inFlight--
	}
	if s.perNS[ns] > 0 {
		s.perNS[ns]--
	}
	if s.perNS[ns] == 0 {
		delete(s.perNS, ns)
	}
	s.publishLocked(ns)
}

func (s *fairScheduler) forget(key types.NamespacedName) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.forgetLocked(key)
	s.publishLocked(key.Namespace)
}

// shareLocked is the per-namespace cap for the current active-tenant count,
// clamped to at least 1 so a namespace can always make progress.
func (s *fairScheduler) shareLocked(ns string) int {
	active := s.countActiveLocked(ns)
	share := s.max / active
	if share < 1 {
		share = 1
	}
	return share
}

// freeSlotsReservedForOthersLocked reports whether every free slot is needed by
// namespaces other than ns that are below their share: each reserves as many
// slots as it has queued Query keys, up to its remaining share. A tenant
// already at its share may exceed it only when this returns false, so the
// floor-division remainder (max mod active) and slots a waiting tenant has no
// queued Query for are handed out on demand instead of being stranded.
func (s *fairScheduler) freeSlotsReservedForOthersLocked(ns string, share int) bool {
	free := s.max - s.inFlight
	reserved := 0
	for k, keys := range s.queued {
		if k == ns {
			continue
		}
		if room := share - s.perNS[k]; room > 0 {
			reserved += min(room, len(keys))
		}
		if reserved >= free {
			return true
		}
	}
	return false
}

// countActiveLocked returns the number of namespaces currently competing for
// the pool: those with in-flight work, plus those with queued Query keys, plus
// ns itself. Computed arithmetically (no set allocation) since it runs on every
// acquire.
func (s *fairScheduler) countActiveLocked(ns string) int {
	active := s.activeTenantsLocked()
	if _, inFlight := s.perNS[ns]; !inFlight {
		if _, waiting := s.queued[ns]; !waiting {
			active++
		}
	}
	return active
}

// activeTenantsLocked counts namespaces holding a slot plus those with queued
// Query keys not already counted. Allocation-free.
func (s *fairScheduler) activeTenantsLocked() int {
	active := len(s.perNS)
	for k := range s.queued {
		if _, inFlight := s.perNS[k]; !inFlight {
			active++
		}
	}
	return active
}

func (s *fairScheduler) markQueuedLocked(key types.NamespacedName, now time.Time) {
	keys, ok := s.queued[key.Namespace]
	if !ok {
		keys = make(map[types.NamespacedName]time.Time)
		s.queued[key.Namespace] = keys
	}
	keys[key] = now
}

func (s *fairScheduler) forgetLocked(key types.NamespacedName) {
	keys, ok := s.queued[key.Namespace]
	if !ok {
		return
	}
	delete(keys, key)
	if len(keys) == 0 {
		delete(s.queued, key.Namespace)
		delete(s.lastAttempt, key.Namespace)
	}
}

func (s *fairScheduler) pruneQueuedLocked(now time.Time) {
	if !s.lastPrune.IsZero() && now.Sub(s.lastPrune) < queuedKeyPruneInterval {
		return
	}
	s.lastPrune = now
	for ns, keys := range s.queued {
		for key, seen := range keys {
			if now.Sub(seen) > s.keyExpiry {
				delete(keys, key)
				queryFairnessWaitExpiredTotal.WithLabelValues(ns).Inc()
			}
		}
		if len(keys) == 0 {
			delete(s.queued, ns)
			delete(s.lastAttempt, ns)
		}
	}
}

func (s *fairScheduler) observeRetryLocked(ns string, now time.Time) {
	if last, ok := s.lastAttempt[ns]; ok {
		queryFairnessRetryGapSeconds.Observe(now.Sub(last).Seconds())
	}
}

func (s *fairScheduler) recordAttemptLocked(ns string, now time.Time) {
	if _, waiting := s.queued[ns]; waiting {
		s.lastAttempt[ns] = now
		return
	}
	delete(s.lastAttempt, ns)
}

// publishLocked prunes expired queued keys, then updates the changed
// namespace's in-flight gauge and the active-tenant gauge. Pruning here keeps
// the active-tenant gauge accurate on the release path too.
func (s *fairScheduler) publishLocked(ns string) {
	s.pruneQueuedLocked(s.now())
	if n := s.perNS[ns]; n > 0 {
		queryInflightGauge.WithLabelValues(ns).Set(float64(n))
	} else {
		queryInflightGauge.DeleteLabelValues(ns)
	}
	queryActiveTenantsGauge.Set(float64(s.activeTenantsLocked()))
}
