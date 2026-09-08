/* Copyright 2025. McKinsey & Company */

package controller

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func countingBuilder(calls *int32) func(string, string) (client.Client, error) {
	return func(_, _ string) (client.Client, error) {
		atomic.AddInt32(calls, 1)
		return fake.NewClientBuilder().Build(), nil
	}
}

func TestImpersonatedClientCacheReusesSameIdentity(t *testing.T) {
	var calls int32
	c := newImpersonatedClientCache(8, countingBuilder(&calls))

	first, err := c.get("ns", "sa")
	require.NoError(t, err)
	second, err := c.get("ns", "sa")
	require.NoError(t, err)

	assert.True(t, first == second, "same identity should return the same client")
	assert.EqualValues(t, 1, atomic.LoadInt32(&calls), "client should be built once")
}

func TestImpersonatedClientCacheDistinctIdentities(t *testing.T) {
	var calls int32
	c := newImpersonatedClientCache(8, countingBuilder(&calls))

	a, err := c.get("ns", "sa-a")
	require.NoError(t, err)
	b, err := c.get("ns", "sa-b")
	require.NoError(t, err)

	assert.False(t, a == b, "distinct identities should get distinct clients")
	assert.EqualValues(t, 2, atomic.LoadInt32(&calls))
}

func TestImpersonatedClientCacheEvictsOldestWhenFull(t *testing.T) {
	var calls int32
	c := newImpersonatedClientCache(2, countingBuilder(&calls))

	_, _ = c.get("ns", "a")
	_, _ = c.get("ns", "b")
	_, _ = c.get("ns", "c") // evicts "a" (oldest)

	assert.Len(t, c.m, 2, "cache must not exceed its bound")
	assert.EqualValues(t, 3, atomic.LoadInt32(&calls))

	// "b" and "c" are still cached: no rebuild.
	_, _ = c.get("ns", "b")
	_, _ = c.get("ns", "c")
	assert.EqualValues(t, 3, atomic.LoadInt32(&calls))

	// "a" was evicted: it rebuilds.
	_, _ = c.get("ns", "a")
	assert.EqualValues(t, 4, atomic.LoadInt32(&calls))
}

func TestImpersonatedClientCacheConcurrentGetBuildsOnce(t *testing.T) {
	var calls int32
	c := newImpersonatedClientCache(64, func(_, _ string) (client.Client, error) {
		atomic.AddInt32(&calls, 1)
		time.Sleep(time.Millisecond)
		return fake.NewClientBuilder().Build(), nil
	})

	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := c.get("ns", "shared")
			assert.NoError(t, err)
		}()
	}
	wg.Wait()

	assert.EqualValues(t, 1, atomic.LoadInt32(&calls), "concurrent gets for one identity must build exactly once")
}

func TestGetClientForQueryEmptyServiceAccountReturnsSharedClient(t *testing.T) {
	shared := fake.NewClientBuilder().Build()
	r := &QueryReconciler{Client: shared}

	got, err := r.getClientForQuery(arkv1alpha1.Query{})
	require.NoError(t, err)

	assert.True(t, got == shared, "empty serviceAccount should return the shared client")
	assert.Nil(t, r.saClients, "shared-client path must not initialize the impersonated cache")
}
