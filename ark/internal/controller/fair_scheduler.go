/* Copyright 2025. McKinsey & Company */

package controller

import (
	"sync"
	"time"
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
// their share are denied and the slot waits at most one requeue delay for the
// entitled tenant to cycle. A quiet tenant's wait is therefore bounded by the
// requeue delay, not by another tenant's backlog size.
type fairScheduler struct {
	mu sync.Mutex

	// max is the global concurrency bound (MaxConcurrentQueries).
	max int
	// window is how long a denied acquisition keeps a namespace counted as
	// "active" (waiting) after its last attempt, so a tenant that stops
	// requeuing ages out of the fair-share divisor.
	window time.Duration

	inFlight    int
	perNS       map[string]int
	waitingSeen map[string]time.Time

	now func() time.Time
}

func newFairScheduler(maxConcurrent int, window time.Duration) *fairScheduler {
	return &fairScheduler{
		max:         maxConcurrent,
		window:      window,
		perNS:       make(map[string]int),
		waitingSeen: make(map[string]time.Time),
		now:         time.Now,
	}
}

// tryAcquire grants a slot to ns if the global bound has room and ns is below
// its current fair share. On denial it records ns as waiting (so it counts
// toward the share divisor) and returns false; the caller requeues.
func (s *fairScheduler) tryAcquire(ns string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := s.now()

	if s.inFlight >= s.max {
		s.markWaitingLocked(ns, now)
		s.publishLocked(ns)
		return false
	}

	share := s.shareLocked(ns, now)
	if s.perNS[ns] >= share {
		s.markWaitingLocked(ns, now)
		queryFairnessDeniedTotal.WithLabelValues(ns).Inc()
		s.publishLocked(ns)
		return false
	}

	s.inFlight++
	s.perNS[ns]++
	delete(s.waitingSeen, ns)
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

// shareLocked is the per-namespace cap for the current active-tenant count,
// clamped to at least 1 so a namespace can always make progress.
func (s *fairScheduler) shareLocked(ns string, now time.Time) int {
	active := s.countActiveLocked(ns, now)
	share := s.max / active
	if share < 1 {
		share = 1
	}
	return share
}

// countActiveLocked returns the number of namespaces currently competing for
// the pool: those with in-flight work, plus those that attempted and were
// denied within the window, plus ns itself. Stale waiting entries are pruned.
// Computed arithmetically (no set allocation) since it runs on every acquire.
func (s *fairScheduler) countActiveLocked(ns string, now time.Time) int {
	s.pruneWaitingLocked(now)
	active := s.activeTenantsLocked()
	if _, inFlight := s.perNS[ns]; !inFlight {
		if _, waiting := s.waitingSeen[ns]; !waiting {
			active++
		}
	}
	return active
}

// activeTenantsLocked counts namespaces holding a slot plus those with a
// (non-pruned) waiting mark not already counted. Allocation-free.
func (s *fairScheduler) activeTenantsLocked() int {
	active := len(s.perNS)
	for k := range s.waitingSeen {
		if _, inFlight := s.perNS[k]; !inFlight {
			active++
		}
	}
	return active
}

func (s *fairScheduler) pruneWaitingLocked(now time.Time) {
	for k, seen := range s.waitingSeen {
		if now.Sub(seen) > s.window {
			delete(s.waitingSeen, k)
		}
	}
}

func (s *fairScheduler) markWaitingLocked(ns string, now time.Time) {
	s.waitingSeen[ns] = now
}

// publishLocked updates only the changed namespace's in-flight gauge and the
// active-tenant gauge, so cost is independent of how many namespaces hold slots.
func (s *fairScheduler) publishLocked(ns string) {
	if n := s.perNS[ns]; n > 0 {
		queryInflightGauge.WithLabelValues(ns).Set(float64(n))
	} else {
		queryInflightGauge.DeleteLabelValues(ns)
	}
	queryActiveTenantsGauge.Set(float64(s.activeTenantsLocked()))
}
