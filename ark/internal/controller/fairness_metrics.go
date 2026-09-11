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
)

func init() {
	ctrlmetrics.Registry.MustRegister(
		queryInflightGauge,
		queryActiveTenantsGauge,
		queryFairnessDeniedTotal,
	)
}
