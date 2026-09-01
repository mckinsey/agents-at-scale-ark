/* Copyright 2025. McKinsey & Company */

package controller

import (
	"github.com/prometheus/client_golang/prometheus"
	ctrlmetrics "sigs.k8s.io/controller-runtime/pkg/metrics"
)

// Fair-scheduler metrics. The namespace label is bounded by the number of
// tenant namespaces with in-flight Query work; series are deleted when a
// namespace drains to zero so idle tenants don't leak stale series.
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
			Help: "Query slot acquisitions denied because the namespace was at its fair share, by namespace.",
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
