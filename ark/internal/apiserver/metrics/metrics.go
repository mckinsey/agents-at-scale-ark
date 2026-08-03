/* Copyright 2025. McKinsey & Company */

package metrics

import (
	"sync/atomic"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

var (
	StorageOperations = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "ark_apiserver_storage_operations_total",
			Help: "Total number of storage operations",
		},
		[]string{"operation", "kind", "status"},
	)

	StorageLatency = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "ark_apiserver_storage_latency_seconds",
			Help:    "Latency of storage operations in seconds",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"operation", "kind"},
	)

	RequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "ark_apiserver_requests_total",
			Help: "Total number of requests to the Ark API Server",
		},
		[]string{"resource", "verb"},
	)

	RequestDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "ark_apiserver_request_duration_seconds",
			Help:    "Request duration in seconds",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"resource", "verb"},
	)

	ActiveResources = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "ark_apiserver_active_resources",
			Help: "Number of active resources by kind",
		},
		[]string{"kind"},
	)

	// PolicyEnforcementActive is the signal an operator can alert on: enforcement lapsing is
	// otherwise invisible, because the kubelet readiness probe watches controller-runtime's
	// health server rather than the aggregated apiserver's own readyz, so a pod whose policy
	// informers have stalled stays Ready. A GaugeFunc rather than a Gauge so it is sampled at
	// scrape time and stays accurate on an idle apiserver.
	PolicyEnforcementActive = prometheus.NewGaugeFunc(
		prometheus.GaugeOpts{
			Name: "ark_apiserver_policy_enforcement_active",
			Help: "1 when ValidatingAdmissionPolicy enforcement is wired and its informers have synced, 0 otherwise.",
		},
		func() float64 {
			fn := policyReadyFn.Load()
			if fn == nil || !(*fn)() {
				return 0
			}
			return 1
		},
	)
)

// policyReadyFn is unset until admission wiring succeeds. Unset reads as 0, which is the honest
// value both before startup completes and on every path where enforcement is never wired.
var policyReadyFn atomic.Pointer[func() bool]

// SetPolicyReadyFunc installs the check PolicyEnforcementActive samples. Safe to leave unset.
func SetPolicyReadyFunc(fn func() bool) {
	policyReadyFn.Store(&fn)
}

func init() {
	prometheus.MustRegister(StorageOperations)
	prometheus.MustRegister(StorageLatency)
	prometheus.MustRegister(RequestsTotal)
	prometheus.MustRegister(RequestDuration)
	prometheus.MustRegister(ActiveResources)
	prometheus.MustRegister(PolicyEnforcementActive)
}

func RecordStorageOperation(operation, kind, status string) {
	StorageOperations.WithLabelValues(operation, kind, status).Inc()
}

func RecordStorageLatency(operation, kind string, start time.Time) {
	StorageLatency.WithLabelValues(operation, kind).Observe(time.Since(start).Seconds())
}
