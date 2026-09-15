/* Copyright 2025. McKinsey & Company */

package metrics

import (
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	ctrlmetrics "sigs.k8s.io/controller-runtime/pkg/metrics"
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

	// EnforcementActive is the signal an operator can alert on: enforcement lapsing is
	// otherwise invisible, because the kubelet readiness probe watches controller-runtime's
	// health server rather than the aggregated apiserver's own readyz, so a pod whose admission
	// informers have stalled stays Ready. Sampled at collection time rather than set, so it stays
	// accurate on an idle apiserver.
	//
	// Labelled by mechanism because CEL policy and third-party webhooks are wired, degrade and
	// are required independently, and the alert that matters — "something I turned on is no
	// longer enforcing" — is then one expression over the whole series rather than one per
	// mechanism that has to be extended each time another is added.
	EnforcementActive = &enforcementCollector{}
)

// Mechanism label values. Every mechanism is always exported, so one that was never wired reports
// 0 rather than going absent — an alert on a missing series is easy to write and easy to get wrong.
const (
	MechanismCEL      = "cel"
	MechanismWebhooks = "webhooks"
)

var enforcementMechanisms = []string{MechanismCEL, MechanismWebhooks}

var enforcementActiveDesc = prometheus.NewDesc(
	"ark_apiserver_admission_enforcement_active",
	"1 when the named admission mechanism is wired and its informers have synced, 0 otherwise.",
	[]string{"mechanism"}, nil,
)

// readyFns is empty until admission wiring succeeds. A missing entry reads as 0, which is the
// honest value both before startup completes and on every path where the mechanism is never wired.
var readyFns struct {
	sync.RWMutex
	m map[string]func() bool
}

// SetEnforcementReadyFunc installs the check EnforcementActive samples for one mechanism. Safe to
// leave unset.
func SetEnforcementReadyFunc(mechanism string, fn func() bool) {
	readyFns.Lock()
	defer readyFns.Unlock()
	if readyFns.m == nil {
		readyFns.m = map[string]func() bool{}
	}
	readyFns.m[mechanism] = fn
}

func enforcementReady(mechanism string) float64 {
	readyFns.RLock()
	fn := readyFns.m[mechanism]
	readyFns.RUnlock()
	if fn == nil || !fn() {
		return 0
	}
	return 1
}

type enforcementCollector struct{}

func (*enforcementCollector) Describe(ch chan<- *prometheus.Desc) { ch <- enforcementActiveDesc }

func (*enforcementCollector) Collect(ch chan<- prometheus.Metric) {
	for _, m := range enforcementMechanisms {
		ch <- prometheus.MustNewConstMetric(enforcementActiveDesc, prometheus.GaugeValue, enforcementReady(m), m)
	}
}

// Registered on controller-runtime's registry: that is the one served by
// --metrics-bind-address, so registering on the prometheus default registry
// would leave these collectors unscrapeable.
func init() {
	ctrlmetrics.Registry.MustRegister(
		StorageOperations,
		StorageLatency,
		RequestsTotal,
		RequestDuration,
		ActiveResources,
		EnforcementActive,
	)
}

func RecordStorageOperation(operation, kind, status string) {
	StorageOperations.WithLabelValues(operation, kind, status).Inc()
}

func RecordStorageLatency(operation, kind string, start time.Time) {
	StorageLatency.WithLabelValues(operation, kind).Observe(time.Since(start).Seconds())
}
