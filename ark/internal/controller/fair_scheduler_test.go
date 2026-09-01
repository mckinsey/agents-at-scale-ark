/* Copyright 2025. McKinsey & Company */

package controller

import (
	"testing"
	"time"

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
