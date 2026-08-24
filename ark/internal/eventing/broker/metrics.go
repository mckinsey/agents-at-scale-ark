/* Copyright 2025. McKinsey & Company */

package broker

import (
	"github.com/prometheus/client_golang/prometheus"
	ctrlmetrics "sigs.k8s.io/controller-runtime/pkg/metrics"
)

const (
	dropReasonSemaphoreFull = "semaphore_full"
	dropReasonTimeout       = "timeout"
	dropReasonHTTPError     = "http_error"
	dropReasonMarshalError  = "marshal_error"
	dropReasonRequestError  = "request_error"
	dropReasonEndpointError = "endpoint_error"
	dropReasonBadStatus     = "bad_status"
)

// The broker emitter runs in both the controller and the completions
// executor. The controller's metrics endpoint serves controller-runtime's
// metrics.Registry, while the executor serves the default prometheus registry
// via promhttp.Handler(). Register on both so drops surface regardless of the
// hosting process.
var (
	emitDroppedTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "ark_broker_emit_dropped_total",
			Help: "Structured events dropped by the broker event emitter before delivery, by drop reason and namespace.",
		},
		[]string{"reason", "namespace"},
	)

	emitLatencySeconds = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "ark_broker_emit_latency_seconds",
			Help:    "Latency of a broker /events POST from the emitter, by outcome.",
			Buckets: []float64{0.005, 0.01, 0.05, 0.2, 0.5, 1, 5, 10},
		},
		[]string{"outcome"},
	)
)

func init() {
	ctrlmetrics.Registry.MustRegister(emitDroppedTotal, emitLatencySeconds)
	prometheus.MustRegister(emitDroppedTotal, emitLatencySeconds)
}
