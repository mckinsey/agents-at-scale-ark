/* Copyright 2025. McKinsey & Company */

package controller

import (
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus/testutil"
	dto "github.com/prometheus/client_model/go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/types"
)

// newTestScheduler builds a scheduler with a controllable clock so the waiting
// window can be exercised deterministically.
func newTestScheduler(maxConcurrent int) (*fairScheduler, *time.Time) {
	clock := time.Unix(0, 0)
	s := newFairScheduler(maxConcurrent, time.Minute)
	s.now = func() time.Time { return clock }
	return s, &clock
}

func nsKey(ns string) types.NamespacedName {
	return types.NamespacedName{Namespace: ns, Name: "q"}
}

func TestFairScheduler_GlobalBound(t *testing.T) {
	s, _ := newTestScheduler(2)

	require.True(t, s.tryAcquire(nsKey("a")))
	require.True(t, s.tryAcquire(nsKey("a")))
	assert.False(t, s.tryAcquire(nsKey("a")), "third acquire must be denied once the global bound is reached")

	s.release("a")
	assert.True(t, s.tryAcquire(nsKey("a")), "a slot must be grantable again after release")
}

// The marquee invariant: once a second tenant appears, the busy tenant is held
// at its fair share and the quiet tenant gets a slot — its wait is not coupled
// to the busy tenant's backlog.
func TestFairScheduler_QuietTenantNotStarved(t *testing.T) {
	s, _ := newTestScheduler(2)

	// Busy tenant fills the pool while it's the only active tenant.
	require.True(t, s.tryAcquire(nsKey("busy")))
	require.True(t, s.tryAcquire(nsKey("busy")))

	// Quiet tenant arrives, is denied (pool full) but now counts as active.
	assert.False(t, s.tryAcquire(nsKey("quiet")))

	// A busy slot frees. With two active tenants the share is 1, so the freed
	// slot goes to the quiet tenant, and the busy tenant cannot reclaim it.
	s.release("busy")
	assert.True(t, s.tryAcquire(nsKey("quiet")), "quiet tenant must get the freed slot")
	assert.False(t, s.tryAcquire(nsKey("busy")), "busy tenant must be held at its fair share of 1")
}

func TestFairScheduler_EqualSplitAcrossTenants(t *testing.T) {
	s, _ := newTestScheduler(4)

	require.True(t, s.tryAcquire(nsKey("a")))
	require.True(t, s.tryAcquire(nsKey("b")))
	require.True(t, s.tryAcquire(nsKey("a")))
	require.True(t, s.tryAcquire(nsKey("b")))

	assert.False(t, s.tryAcquire(nsKey("a")), "a is at its share of 2")
	assert.False(t, s.tryAcquire(nsKey("b")), "b is at its share of 2")
	assert.Equal(t, 2, s.perNS["a"])
	assert.Equal(t, 2, s.perNS["b"])
}

// The floor-division remainder (max mod active) must be handed out on demand,
// not stranded once every backlogged tenant sits at its share.
func TestFairScheduler_RemainderNotStranded(t *testing.T) {
	s, _ := newTestScheduler(4)

	// Three backlogged tenants each reach the share of 1 (4/3 floored).
	require.True(t, s.tryAcquire(nsKey("a")))
	require.True(t, s.tryAcquire(nsKey("b")))
	require.True(t, s.tryAcquire(nsKey("c")))

	// One slot remains. No tenant is waiting below its share, so the leftover
	// slot is grantable rather than stranded behind the fairness check.
	assert.True(t, s.tryAcquire(nsKey("a")), "the remainder slot must be grantable, not stranded")
	assert.Equal(t, 4, s.inFlight)

	// The pool is now full: the next attempt is refused by the global bound.
	assert.False(t, s.tryAcquire(nsKey("b")), "further acquires are refused only by the global cap")
}

// A busy tenant must be able to use spare capacity that quiet, low-demand
// tenants are entitled to but are not asking for. A tenant holding fewer slots
// than its share does not reserve capacity unless it is actively waiting.
func TestFairScheduler_BusyTenantUsesSpareLeftByQuietTenant(t *testing.T) {
	s, _ := newTestScheduler(4)

	// Quiet tenant takes a single slot and stops asking (no waiting mark).
	require.True(t, s.tryAcquire(nsKey("quiet")))

	// Busy tenant is not throttled to its notional share of 2: it fills every
	// remaining slot because "quiet" has no pending demand.
	require.True(t, s.tryAcquire(nsKey("busy")))
	require.True(t, s.tryAcquire(nsKey("busy")))
	assert.True(t, s.tryAcquire(nsKey("busy")), "busy must claim the slot quiet is not asking for")
	assert.Equal(t, 3, s.perNS["busy"])
	assert.Equal(t, 4, s.inFlight)
}

func TestFairScheduler_ShareExpandsAsTenantsDrain(t *testing.T) {
	s, _ := newTestScheduler(4)

	require.True(t, s.tryAcquire(nsKey("a")))
	require.True(t, s.tryAcquire(nsKey("b")))
	require.True(t, s.tryAcquire(nsKey("a")))
	require.True(t, s.tryAcquire(nsKey("b")))

	// b drains completely and stops competing; it has no queued Queries, so a
	// is then the only active tenant and may use the whole pool.
	s.release("b")
	s.release("b")

	assert.True(t, s.tryAcquire(nsKey("a")))
	assert.True(t, s.tryAcquire(nsKey("a")))
	assert.Equal(t, 4, s.perNS["a"])
}

// The active-tenant count must return to zero once everything drains and the
// waiting tenant's queued Query is forgotten, on the forget path too — not only
// when a later acquire happens.
func TestFairScheduler_ActiveTenantsClearAfterDrain(t *testing.T) {
	s, clock := newTestScheduler(2)

	// a fills the pool; b is denied at the global cap and left queued.
	require.True(t, s.tryAcquire(nsKey("a")))
	require.True(t, s.tryAcquire(nsKey("a")))
	assert.False(t, s.tryAcquire(nsKey("b")))

	// a drains completely. b never acquired, so only its queued key remains,
	// and it keeps b active however long b takes to retry.
	s.release("a")
	s.release("a")
	*clock = clock.Add(2 * time.Second)
	assert.Equal(t, 1, s.activeTenantsLocked())

	// Forgetting b's key drops the active count to zero with nothing running.
	s.forget(nsKey("b"))
	assert.Equal(t, 0, s.activeTenantsLocked())
	assert.Empty(t, s.queued)
}

// The #3458 scenario: a waiting tenant whose retries are slower than the old 1s
// window keeps its reservation, so the saturating tenant cannot reclaim it.
func TestFairScheduler_SlowRetryingTenantKeepsItsShare(t *testing.T) {
	s, clock := newTestScheduler(4)

	for i := 0; i < 4; i++ {
		require.True(t, s.tryAcquire(nsKey("a")))
	}
	assert.False(t, s.tryAcquire(nsKey("b")))

	s.release("a")
	*clock = clock.Add(2 * time.Second)
	assert.False(t, s.tryAcquire(nsKey("a")), "a must not reclaim the slot while b still has a queued Query")
	assert.True(t, s.tryAcquire(nsKey("b")), "b must get the slot reserved for it")
}

func TestFairScheduler_ForgottenTenantReleasesReservation(t *testing.T) {
	s, _ := newTestScheduler(4)

	for i := 0; i < 4; i++ {
		require.True(t, s.tryAcquire(nsKey("a")))
	}
	assert.False(t, s.tryAcquire(nsKey("b")))
	s.release("a")

	s.forget(nsKey("b"))
	assert.True(t, s.tryAcquire(nsKey("a")), "a must reclaim capacity once b has no queued Queries")
}

func TestFairScheduler_NamespaceWaitsWhileAnyKeyIsQueued(t *testing.T) {
	s, _ := newTestScheduler(2)

	require.True(t, s.tryAcquire(nsKey("busy")))
	require.True(t, s.tryAcquire(nsKey("busy")))
	first := types.NamespacedName{Namespace: "multi", Name: "first"}
	second := types.NamespacedName{Namespace: "multi", Name: "second"}
	assert.False(t, s.tryAcquire(first))
	assert.False(t, s.tryAcquire(second))

	s.forget(first)
	assert.Contains(t, s.queued, "multi")

	s.release("busy")
	assert.False(t, s.tryAcquire(nsKey("busy")), "multi still has a queued Query, so its reservation holds")

	s.forget(second)
	assert.NotContains(t, s.queued, "multi")
	assert.True(t, s.tryAcquire(nsKey("busy")))
}

func TestFairScheduler_ForgetUnknownKeyIsNoop(t *testing.T) {
	s, _ := newTestScheduler(1)

	s.forget(nsKey("never-seen"))
	assert.Empty(t, s.queued)
	assert.True(t, s.tryAcquire(nsKey("never-seen")))
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

func TestFairScheduler_RetryGapRecordedForWaitingNamespace(t *testing.T) {
	s, clock := newTestScheduler(1)

	require.True(t, s.tryAcquire(nsKey("gap-busy")))
	count, _ := retryGapSnapshot(t)
	require.False(t, s.tryAcquire(nsKey("gap-waiting")))
	afterFirst, _ := retryGapSnapshot(t)
	assert.Equal(t, count, afterFirst, "the first attempt has no previous attempt to measure from")

	*clock = clock.Add(200 * time.Millisecond)
	_, sum := retryGapSnapshot(t)
	assert.False(t, s.tryAcquire(nsKey("gap-waiting")))

	newCount, newSum := retryGapSnapshot(t)
	assert.Equal(t, count+1, newCount)
	assert.InDelta(t, 0.2, newSum-sum, 1e-9)
}

func TestFairScheduler_NoRetryGapAfterNamespaceLeaves(t *testing.T) {
	s, clock := newTestScheduler(1)

	require.True(t, s.tryAcquire(nsKey("left-busy")))
	require.False(t, s.tryAcquire(nsKey("left-tenant")))
	s.release("left-busy")
	require.True(t, s.tryAcquire(nsKey("left-tenant")))
	s.release("left-tenant")
	assert.NotContains(t, s.lastAttempt, "left-tenant")

	*clock = clock.Add(30 * time.Second)
	count, _ := retryGapSnapshot(t)
	require.True(t, s.tryAcquire(nsKey("left-tenant")))
	newCount, _ := retryGapSnapshot(t)
	assert.Equal(t, count, newCount, "a namespace returning with new work is not a retry")
	assert.Zero(t, waitExpired("left-tenant"))
}

func TestFairScheduler_QueuedKeyExpiresAfterSafetyExpiry(t *testing.T) {
	s, clock := newTestScheduler(4)

	for i := 0; i < 4; i++ {
		require.True(t, s.tryAcquire(nsKey("leak-busy")))
	}
	assert.False(t, s.tryAcquire(nsKey("leak-tenant")))
	s.release("leak-busy")

	*clock = clock.Add(30 * time.Second)
	assert.False(t, s.tryAcquire(nsKey("leak-busy")), "before the expiry the queued key still holds the reservation")
	assert.Zero(t, waitExpired("leak-tenant"))

	*clock = clock.Add(time.Minute)
	assert.True(t, s.tryAcquire(nsKey("leak-busy")), "after the expiry the leaked key no longer holds the reservation")
	assert.Equal(t, float64(1), waitExpired("leak-tenant"))
	assert.NotContains(t, s.queued, "leak-tenant")
	assert.NotContains(t, s.lastAttempt, "leak-tenant")
}

func TestFairScheduler_RetryingKeyDoesNotExpire(t *testing.T) {
	s, clock := newTestScheduler(1)

	require.True(t, s.tryAcquire(nsKey("alive-busy")))
	for i := 0; i < 5; i++ {
		assert.False(t, s.tryAcquire(nsKey("alive-tenant")))
		*clock = clock.Add(30 * time.Second)
	}
	assert.Contains(t, s.queued, "alive-tenant")
	assert.Zero(t, waitExpired("alive-tenant"))
}

func TestFairScheduler_PruneRunsAtMostOncePerInterval(t *testing.T) {
	s, clock := newTestScheduler(1)

	require.True(t, s.tryAcquire(nsKey("rate-busy")))
	assert.False(t, s.tryAcquire(nsKey("rate-tenant")))

	*clock = clock.Add(time.Minute + time.Millisecond)
	s.lastPrune = clock.Add(-queuedKeyPruneInterval / 2)
	s.forget(nsKey("unrelated"))
	assert.Contains(t, s.queued, "rate-tenant", "a prune within the interval must be skipped")

	*clock = clock.Add(queuedKeyPruneInterval)
	s.forget(nsKey("unrelated"))
	assert.NotContains(t, s.queued, "rate-tenant", "the next prune after the interval drops the expired key")
}
