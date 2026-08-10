/* Copyright 2025. McKinsey & Company */

package metrics

import (
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus/testutil"
)

// resetPolicyReadyFn restores the process-wide hook so cases do not leak into each other. These
// tests mutate package state and must not run in parallel.
func resetPolicyReadyFn(t *testing.T) {
	t.Helper()
	previous := policyReadyFn.Load()
	t.Cleanup(func() { policyReadyFn.Store(previous) })
	policyReadyFn.Store(nil)
}

// PolicyEnforcementActive is the only externally visible signal that enforcement has lapsed --
// the kubelet readiness probe watches controller-runtime's health server, not the aggregated
// apiserver's readyz, so a pod whose policy informers stalled stays Ready. A gauge stuck at 1
// while enforcement is off is worse than no metric, because it is what operators alert on.
func TestPolicyEnforcementActive(t *testing.T) {
	cases := []struct {
		name  string
		hook  func() bool
		want  float64
		unset bool
	}{
		{
			// Every path that never wires admission leaves the hook unset, as does the window
			// before startup finishes. Both must read as unenforced rather than as enforced.
			name:  "unset reads as inactive",
			unset: true,
			want:  0,
		},
		{
			name: "informers synced reads as active",
			hook: func() bool { return true },
			want: 1,
		},
		{
			name: "informers lagging reads as inactive",
			hook: func() bool { return false },
			want: 0,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resetPolicyReadyFn(t)
			if !tc.unset {
				SetPolicyReadyFunc(tc.hook)
			}

			if got := testutil.ToFloat64(PolicyEnforcementActive); got != tc.want {
				t.Errorf("ark_apiserver_policy_enforcement_active = %v, want %v", got, tc.want)
			}
		})
	}
}

// A GaugeFunc rather than a Gauge so the value is sampled per scrape; a cached value would stay
// at 1 after informers stall on an otherwise idle apiserver.
func TestPolicyEnforcementActive_SampledAtScrapeTime(t *testing.T) {
	resetPolicyReadyFn(t)

	synced := false
	SetPolicyReadyFunc(func() bool { return synced })

	if got := testutil.ToFloat64(PolicyEnforcementActive); got != 0 {
		t.Fatalf("before sync: got %v, want 0", got)
	}

	synced = true
	if got := testutil.ToFloat64(PolicyEnforcementActive); got != 1 {
		t.Errorf("after sync: got %v, want 1; the gauge is not re-sampled per scrape", got)
	}

	synced = false
	if got := testutil.ToFloat64(PolicyEnforcementActive); got != 0 {
		t.Errorf("after informers stalled: got %v, want 0; a stale 1 would silence the alert this metric exists for", got)
	}
}

// SetPolicyReadyFunc is called once from applyAdmission, but the store must be safe against a
// concurrent scrape of the GaugeFunc.
func TestSetPolicyReadyFunc_ReplacesPreviousHook(t *testing.T) {
	resetPolicyReadyFn(t)

	SetPolicyReadyFunc(func() bool { return true })
	SetPolicyReadyFunc(func() bool { return false })

	if got := testutil.ToFloat64(PolicyEnforcementActive); got != 0 {
		t.Errorf("got %v, want 0 from the most recently installed hook", got)
	}
}

func TestRecordStorageOperation(t *testing.T) {
	before := testutil.ToFloat64(StorageOperations.WithLabelValues("create", "Agent", "success"))

	RecordStorageOperation("create", "Agent", "success")

	if got := testutil.ToFloat64(StorageOperations.WithLabelValues("create", "Agent", "success")); got != before+1 {
		t.Errorf("ark_apiserver_storage_operations_total = %v, want %v", got, before+1)
	}
}

func TestRecordStorageLatency(t *testing.T) {
	RecordStorageLatency("create", "Agent", time.Now())

	if got := testutil.CollectAndCount(StorageLatency); got == 0 {
		t.Error("expected ark_apiserver_storage_latency_seconds to report an observation")
	}
}
