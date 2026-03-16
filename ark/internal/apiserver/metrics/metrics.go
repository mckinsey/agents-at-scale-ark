/* Copyright 2025. McKinsey & Company */

package metrics

import (
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
)

func init() {
	prometheus.MustRegister(StorageOperations)
	prometheus.MustRegister(StorageLatency)
	prometheus.MustRegister(RequestsTotal)
	prometheus.MustRegister(RequestDuration)
	prometheus.MustRegister(ActiveResources)
}

func RecordStorageOperation(operation, kind, status string) {
	StorageOperations.WithLabelValues(operation, kind, status).Inc()
}

func RecordStorageLatency(operation, kind string, start time.Time) {
	StorageLatency.WithLabelValues(operation, kind).Observe(time.Since(start).Seconds())
}
