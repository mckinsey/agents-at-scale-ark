/* Copyright 2025. McKinsey & Company */

package metrics

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus/testutil"
	ctrlmetrics "sigs.k8s.io/controller-runtime/pkg/metrics"
)

// resetReadyFns clears the process-wide hooks so cases do not leak into each other. These tests
// mutate package state and must not run in parallel.
func resetReadyFns(t *testing.T) {
	t.Helper()
	readyFns.Lock()
	previous := readyFns.m
	readyFns.m = nil
	readyFns.Unlock()
	t.Cleanup(func() {
		readyFns.Lock()
		readyFns.m = previous
		readyFns.Unlock()
	})
}

// assertEnforcement compares the whole series rather than one sample, because "every mechanism is
// always exported" is itself the property under test: a mechanism that went absent instead of
// reporting 0 would silence an alert written against the metric name.
func assertEnforcement(t *testing.T, cel, webhooks float64) {
	t.Helper()

	want := fmt.Sprintf(`# HELP ark_apiserver_admission_enforcement_active `+
		`1 when the named admission mechanism is wired and its informers have synced, 0 otherwise.
# TYPE ark_apiserver_admission_enforcement_active gauge
ark_apiserver_admission_enforcement_active{mechanism="cel"} %g
ark_apiserver_admission_enforcement_active{mechanism="webhooks"} %g
`, cel, webhooks)

	if err := testutil.CollectAndCompare(EnforcementActive, strings.NewReader(want)); err != nil {
		t.Error(err)
	}
}

// EnforcementActive is the only externally visible signal that enforcement has lapsed -- the
// kubelet readiness probe watches controller-runtime's health server, not the aggregated
// apiserver's readyz, so a pod whose informers stalled stays Ready. A gauge stuck at 1 while
// enforcement is off is worse than no metric, because it is what operators alert on.
func TestEnforcementActive(t *testing.T) {
	cases := []struct {
		name         string
		celHook      func() bool
		webhookHook  func() bool
		cel, webhook float64
	}{
		{
			// Every path that never wires admission leaves the hooks unset, as does the window
			// before startup finishes. Both must read as unenforced rather than as enforced.
			name: "unset reads as inactive",
		},
		{
			name:        "informers synced reads as active",
			celHook:     func() bool { return true },
			webhookHook: func() bool { return true },
			cel:         1,
			webhook:     1,
		},
		{
			name:        "informers lagging reads as inactive",
			celHook:     func() bool { return false },
			webhookHook: func() bool { return false },
		},
		{
			// The reason the metric is labelled: the mechanisms are wired, degrade and are
			// required independently, so one lapsing must not be masked by the other holding.
			name:    "one mechanism lapsing is visible on its own",
			celHook: func() bool { return true },
			// webhooks never wired
			cel: 1,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resetReadyFns(t)
			if tc.celHook != nil {
				SetEnforcementReadyFunc(MechanismCEL, tc.celHook)
			}
			if tc.webhookHook != nil {
				SetEnforcementReadyFunc(MechanismWebhooks, tc.webhookHook)
			}

			assertEnforcement(t, tc.cel, tc.webhook)
		})
	}
}

// Sampled at collection time rather than stored; a cached value would stay at 1 after informers
// stall on an otherwise idle apiserver.
func TestEnforcementActive_SampledAtScrapeTime(t *testing.T) {
	resetReadyFns(t)

	synced := false
	SetEnforcementReadyFunc(MechanismCEL, func() bool { return synced })

	assertEnforcement(t, 0, 0)

	synced = true
	assertEnforcement(t, 1, 0)

	synced = false
	// A stale 1 here would silence the alert this metric exists for.
	assertEnforcement(t, 0, 0)
}

// SetEnforcementReadyFunc is called once per mechanism from applyAdmission, but the store must be
// safe against a concurrent scrape.
func TestSetEnforcementReadyFunc_ReplacesPreviousHook(t *testing.T) {
	resetReadyFns(t)

	SetEnforcementReadyFunc(MechanismCEL, func() bool { return true })
	SetEnforcementReadyFunc(MechanismCEL, func() bool { return false })

	assertEnforcement(t, 0, 0)
}

// Guards against a collector regressing to the prometheus default registry:
// --metrics-bind-address serves controller-runtime's registry, so a metric
// registered anywhere else is unscrapeable.
func TestMetricsGatheredByControllerRuntimeRegistry(t *testing.T) {
	StorageOperations.WithLabelValues("get", "RegistryTest", "success")
	StorageLatency.WithLabelValues("get", "RegistryTest")
	RequestsTotal.WithLabelValues("registrytests", "get")
	RequestDuration.WithLabelValues("registrytests", "get")
	ActiveResources.WithLabelValues("RegistryTest")

	families, err := ctrlmetrics.Registry.Gather()
	if err != nil {
		t.Fatalf("gather: %v", err)
	}
	gathered := make(map[string]bool, len(families))
	for _, f := range families {
		gathered[f.GetName()] = true
	}

	for _, name := range []string{
		"ark_apiserver_storage_operations_total",
		"ark_apiserver_storage_latency_seconds",
		"ark_apiserver_requests_total",
		"ark_apiserver_request_duration_seconds",
		"ark_apiserver_active_resources",
		"ark_apiserver_admission_enforcement_active",
	} {
		if !gathered[name] {
			t.Errorf("metric %s not gathered by controller-runtime registry", name)
		}
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
