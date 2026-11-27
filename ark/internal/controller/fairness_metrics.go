/* Copyright 2025. McKinsey & Company */

package controller

import (
	"github.com/prometheus/client_golang/prometheus"
	ctrlmetrics "sigs.k8s.io/controller-runtime/pkg/metrics"
)

// Fair-scheduler metrics. ark_query_inflight series are deleted when a
// namespace drains to zero, so that gauge's cardinality tracks namespaces with
// in-flight Query work. ark_query_fairness_denied_total is a counter and is
// never deleted, so it retains one series per namespace ever denied for the
// controller's lifetime — unbounded on clusters that create ephemeral or
// per-PR namespaces.
var (
	queryInflightGauge = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "ark_query_inflight",
			Help: "Query executions currently running in goroutines, by namespace.",
		},
		[]string{"namespace"},
	)

	queryActiveTenantsGauge = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "ark_query_active_tenants",
			Help: "Namespaces with in-flight or waiting Query work, used as the fair-share divisor.",
		},
	)

	queryFairnessDeniedTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "ark_query_fairness_denied_total",
			Help: "Query slot acquire attempts denied because the namespace was at its fair share, by namespace. Increments once per denied attempt; queries re-attempt on requeue, so the rate reflects retry frequency, not the number of distinct starved queries.",
		},
		[]string{"namespace"},
	)

	queryFairnessWaitExpiredTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "ark_query_fairness_wait_expired_total",
			Help: "Queued Query keys dropped because they did not retry within the safety expiry, by namespace. A non-zero rate means a queued Query was missed by every removal path, or the controller is retrying far slower than expected.",
		},
		[]string{"namespace"},
	)

	queryFairnessRetryGapSeconds = prometheus.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "ark_query_fairness_retry_gap_seconds",
			Help:    "Time between consecutive slot acquire attempts by a namespace with queued Queries. Long gaps delay how quickly a freed slot reaches the namespace it is reserved for.",
			Buckets: []float64{0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 5, 10},
		},
	)
)

func init() {
	ctrlmetrics.Registry.MustRegister(
		queryInflightGauge,
		queryActiveTenantsGauge,
		queryFairnessDeniedTotal,
		queryFairnessWaitExpiredTotal,
		queryFairnessRetryGapSeconds,
	)
}
