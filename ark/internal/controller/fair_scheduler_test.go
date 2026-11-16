/* Copyright 2025. McKinsey & Company */

package controller

import (
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus/testutil"
	dto "github.com/prometheus/client_model/go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newTestScheduler builds a scheduler with a controllable clock so the waiting
// window can be exercised deterministically.
func newTestScheduler(maxConcurrent int) (*fairScheduler, *time.Time) {
	clock := time.Unix(0, 0)
	s := newFairScheduler(maxConcurrent, 500*time.Millisecond)
	s.now = func() time.Time { return clock }
	return s, &clock
}

func TestFairScheduler_GlobalBound(t *testing.T) {
	s, _ := newTestScheduler(2)

	require.True(t, s.tryAcquire("a"))
	require.True(t, s.tryAcquire("a"))
	assert.False(t, s.tryAcquire("a"), "third acquire must be denied once the global bound is reached")

	s.release("a")
	assert.True(t, s.tryAcquire("a"), "a slot must be grantable again after release")
}

// The marquee invariant: once a second tenant appears, the busy tenant is held
// at its fair share and the quiet tenant gets a slot — its wait is not coupled
// to the busy tenant's backlog.
func TestFairScheduler_QuietTenantNotStarved(t *testing.T) {
	s, _ := newTestScheduler(2)

	// Busy tenant fills the pool while it's the only active tenant.
	require.True(t, s.tryAcquire("busy"))
	require.True(t, s.tryAcquire("busy"))

	// Quiet tenant arrives, is denied (pool full) but now counts as active.
	assert.False(t, s.tryAcquire("quiet"))

	// A busy slot frees. With two active tenants the share is 1, so the freed
	// slot goes to the quiet tenant, and the busy tenant cannot reclaim it.
	s.release("busy")
	assert.True(t, s.tryAcquire("quiet"), "quiet tenant must get the freed slot")
	assert.False(t, s.tryAcquire("busy"), "busy tenant must be held at its fair share of 1")
}

func TestFairScheduler_EqualSplitAcrossTenants(t *testing.T) {
	s, _ := newTestScheduler(4)

	require.True(t, s.tryAcquire("a"))
	require.True(t, s.tryAcquire("b"))
	require.True(t, s.tryAcquire("a"))
	require.True(t, s.tryAcquire("b"))

	assert.False(t, s.tryAcquire("a"), "a is at its share of 2")
	assert.False(t, s.tryAcquire("b"), "b is at its share of 2")
	assert.Equal(t, 2, s.perNS["a"])
	assert.Equal(t, 2, s.perNS["b"])
}

// The floor-division remainder (max mod active) must be handed out on demand,
// not stranded once every backlogged tenant sits at its share.
func TestFairScheduler_RemainderNotStranded(t *testing.T) {
	s, _ := newTestScheduler(4)

	// Three backlogged tenants each reach the share of 1 (4/3 floored).
	require.True(t, s.tryAcquire("a"))
	require.True(t, s.tryAcquire("b"))
	require.True(t, s.tryAcquire("c"))

	// One slot remains. No tenant is waiting below its share, so the leftover
	// slot is grantable rather than stranded behind the fairness check.
	assert.True(t, s.tryAcquire("a"), "the remainder slot must be grantable, not stranded")
	assert.Equal(t, 4, s.inFlight)

	// The pool is now full: the next attempt is refused by the global bound.
	assert.False(t, s.tryAcquire("b"), "further acquires are refused only by the global cap")
}

// A busy tenant must be able to use spare capacity that quiet, low-demand
// tenants are entitled to but are not asking for. A tenant holding fewer slots
// than its share does not reserve capacity unless it is actively waiting.
func TestFairScheduler_BusyTenantUsesSpareLeftByQuietTenant(t *testing.T) {
	s, _ := newTestScheduler(4)

	// Quiet tenant takes a single slot and stops asking (no waiting mark).
	require.True(t, s.tryAcquire("quiet"))

	// Busy tenant is not throttled to its notional share of 2: it fills every
	// remaining slot because "quiet" has no pending demand.
	require.True(t, s.tryAcquire("busy"))
	require.True(t, s.tryAcquire("busy"))
	assert.True(t, s.tryAcquire("busy"), "busy must claim the slot quiet is not asking for")
	assert.Equal(t, 3, s.perNS["busy"])
	assert.Equal(t, 4, s.inFlight)
}

func TestFairScheduler_ShareExpandsAsTenantsDrain(t *testing.T) {
	s, clock := newTestScheduler(4)

	require.True(t, s.tryAcquire("a"))
	require.True(t, s.tryAcquire("b"))
	require.True(t, s.tryAcquire("a"))
	require.True(t, s.tryAcquire("b"))

	// b drains completely and stops competing.
	s.release("b")
	s.release("b")

	// b's waiting mark ages out; a is then the only active tenant and may use
	// the whole pool.
	*clock = clock.Add(time.Second)
	assert.True(t, s.tryAcquire("a"))
	assert.True(t, s.tryAcquire("a"))
	assert.Equal(t, 4, s.perNS["a"])
}

// The active-tenant count must return to zero once everything drains and the
// waiting marks age out, on the release/denial paths too — not only when a
// later non-saturated acquire happens to prune.
func TestFairScheduler_ActiveTenantsClearAfterDrain(t *testing.T) {
	s, clock := newTestScheduler(2)

	// a fills the pool; b is denied at the global cap and left waiting.
	require.True(t, s.tryAcquire("a"))
	require.True(t, s.tryAcquire("a"))
	assert.False(t, s.tryAcquire("b"))

	// a drains completely. b never acquired, so only its waiting mark remains.
	s.release("a")
	s.release("a")

	// Before the window elapses b still counts as active.
	assert.Equal(t, 1, s.activeTenantsLocked())

	// Past the window a release must prune b, dropping the active count to zero
	// with nothing running.
	*clock = clock.Add(time.Second)
	s.publishLocked("a")
	assert.Equal(t, 0, s.activeTenantsLocked())
	assert.Empty(t, s.waitingSeen)
}

func TestFairScheduler_WaitingEntryAgesOut(t *testing.T) {
	s, clock := newTestScheduler(4)

	// a takes the whole pool as the sole active tenant.
	for i := 0; i < 4; i++ {
		require.True(t, s.tryAcquire("a"))
	}
	// b is denied (pool full) and recorded as waiting.
	assert.False(t, s.tryAcquire("b"))

	s.release("a") // a=3, one slot free

	// While b is still fresh, two tenants are active (share 2) and a is over it.
	assert.False(t, s.tryAcquire("a"), "a must yield the free slot while b is actively waiting")

	// b goes quiet past the window; a reclaims the free slot.
	*clock = clock.Add(time.Second)
	assert.True(t, s.tryAcquire("a"), "a must reclaim capacity once b ages out of the active set")
}

func retryGapSnapshot(t *testing.T) (uint64, float64) {
	t.Helper()
	m := &dto.Metric{}
	require.NoError(t, queryFairnessRetryGapSeconds.Write(m))
	return m.GetHistogram().GetSampleCount(), m.GetHistogram().GetSampleSum()
}

func waitExpired(ns string) float64 {
	return testutil.ToFloat64(queryFairnessWaitExpiredTotal.WithLabelValues(ns))
}

func TestFairScheduler_RetryWithinWindowRecordsGapOnly(t *testing.T) {
	s, clock := newTestScheduler(1)

	require.True(t, s.tryAcquire("gap-busy"))
	require.False(t, s.tryAcquire("gap-waiting"))

	count, sum := retryGapSnapshot(t)
	*clock = clock.Add(200 * time.Millisecond)
	assert.False(t, s.tryAcquire("gap-waiting"))

	newCount, newSum := retryGapSnapshot(t)
	assert.Equal(t, count+1, newCount)
	assert.InDelta(t, 0.2, newSum-sum, 1e-9)
	assert.Zero(t, waitExpired("gap-waiting"))
}

func TestFairScheduler_RetryAfterWindowCountsExpiry(t *testing.T) {
	s, clock := newTestScheduler(1)

	require.True(t, s.tryAcquire("exp-busy"))
	require.False(t, s.tryAcquire("exp-waiting"))

	*clock = clock.Add(time.Second)
	s.release("exp-busy")
	require.Contains(t, s.expiredSeen, "exp-waiting")

	count, sum := retryGapSnapshot(t)
	assert.True(t, s.tryAcquire("exp-waiting"))

	newCount, newSum := retryGapSnapshot(t)
	assert.Equal(t, float64(1), waitExpired("exp-waiting"))
	assert.Equal(t, count+1, newCount)
	assert.InDelta(t, 1.0, newSum-sum, 1e-9)
	assert.NotContains(t, s.expiredSeen, "exp-waiting")
}

func TestFairScheduler_GrantedTenantLeavingIsNotCountedAsExpired(t *testing.T) {
	s, clock := newTestScheduler(1)

	require.True(t, s.tryAcquire("left-busy"))
	require.False(t, s.tryAcquire("left-tenant"))
	s.release("left-busy")
	require.True(t, s.tryAcquire("left-tenant"))
	s.release("left-tenant")

	*clock = clock.Add(2 * time.Second)
	require.True(t, s.tryAcquire("left-other"))
	s.release("left-other")
	assert.Empty(t, s.expiredSeen)

	require.True(t, s.tryAcquire("left-tenant"))
	assert.Zero(t, waitExpired("left-tenant"))
}

func TestFairScheduler_ReturnAfterHorizonIsNotCountedAsExpired(t *testing.T) {
	s, clock := newTestScheduler(1)

	require.True(t, s.tryAcquire("late-busy"))
	require.False(t, s.tryAcquire("late-tenant"))

	*clock = clock.Add(time.Second)
	s.release("late-busy")
	require.Contains(t, s.expiredSeen, "late-tenant")

	*clock = clock.Add(2 * waitExpiredHorizon)
	require.True(t, s.tryAcquire("late-tenant"))
	assert.Zero(t, waitExpired("late-tenant"))
	assert.NotContains(t, s.expiredSeen, "late-tenant")
}

func TestFairScheduler_ExpiredEntriesArePrunedAfterHorizon(t *testing.T) {
	s, clock := newTestScheduler(1)

	require.True(t, s.tryAcquire("prune-busy"))
	require.False(t, s.tryAcquire("prune-tenant"))

	*clock = clock.Add(time.Second)
	s.release("prune-busy")
	require.Contains(t, s.expiredSeen, "prune-tenant")

	*clock = clock.Add(2 * waitExpiredHorizon)
	require.True(t, s.tryAcquire("prune-other"))
	s.release("prune-other")
	assert.Empty(t, s.expiredSeen)
}

func TestFairScheduler_SlowRetryWithoutInterveningPruneCountsExpiryOnce(t *testing.T) {
	s, clock := newTestScheduler(2)

	require.True(t, s.tryAcquire("slow-busy"))
	require.True(t, s.tryAcquire("slow-busy"))
	require.False(t, s.tryAcquire("slow-waiting"))

	*clock = clock.Add(100 * time.Millisecond)
	s.release("slow-busy")

	count, sum := retryGapSnapshot(t)
	*clock = clock.Add(2 * time.Second)
	require.True(t, s.tryAcquire("slow-waiting"))

	newCount, newSum := retryGapSnapshot(t)
	assert.Equal(t, float64(1), waitExpired("slow-waiting"))
	assert.Equal(t, count+1, newCount)
	assert.InDelta(t, 2.1, newSum-sum, 1e-9)
	assert.NotContains(t, s.expiredSeen, "slow-waiting")

	s.release("slow-waiting")
	*clock = clock.Add(30 * time.Second)
	require.True(t, s.tryAcquire("slow-waiting"))
	assert.Equal(t, float64(1), waitExpired("slow-waiting"))
	finalCount, _ := retryGapSnapshot(t)
	assert.Equal(t, newCount, finalCount)
}
