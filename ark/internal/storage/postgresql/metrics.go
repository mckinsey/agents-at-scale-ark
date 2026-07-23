/* Copyright 2025. McKinsey & Company */

package postgresql

import "github.com/prometheus/client_golang/prometheus"

// Broadcaster observability. Defined in the postgresql package (rather than
// internal/apiserver/metrics) to keep the storage layer free of an upward
// dependency on the apiserver package. Registered once via init().
var (
	broadcasterRelistTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "ark_apiserver_watch_broadcaster_relist_total",
			Help: "Number of per-kind watch relist queries issued by the broadcaster",
		},
		[]string{"kind"},
	)

	broadcasterRelistFailures = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "ark_apiserver_watch_broadcaster_relist_failures_total",
			Help: "Number of failed per-kind watch relist queries",
		},
		[]string{"kind"},
	)

	broadcasterEventsDispatched = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "ark_apiserver_watch_broadcaster_events_dispatched_total",
			Help: "Number of watch events fanned out from broadcaster to subscribers",
		},
		[]string{"kind"},
	)

	broadcasterEventsDropped = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "ark_apiserver_watch_broadcaster_events_dropped_total",
			Help: "Number of watch events dropped to a subscriber whose buffer was full; the subscriber attempts a catch-up relist to recover, which is not guaranteed if that relist errors (see ark_apiserver_watch_watcher_relist_failures_total)",
		},
		[]string{"kind"},
	)

	// watcherRelistFailures counts failures of a watcher's own relist — the
	// initial population and the catch-up relist that recovers dropped events.
	// A rising counter means dropped events may not have been recovered.
	watcherRelistFailures = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "ark_apiserver_watch_watcher_relist_failures_total",
			Help: "Number of failed per-watcher relist queries (initial population or dropped-event catch-up)",
		},
		[]string{"kind"},
	)

	broadcasterActiveWatchers = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "ark_apiserver_watch_broadcaster_active_watchers",
			Help: "Number of watchers currently subscribed to a kind's broadcaster",
		},
		[]string{"kind"},
	)
)

func init() {
	prometheus.MustRegister(broadcasterRelistTotal)
	prometheus.MustRegister(broadcasterRelistFailures)
	prometheus.MustRegister(broadcasterEventsDispatched)
	prometheus.MustRegister(broadcasterEventsDropped)
	prometheus.MustRegister(watcherRelistFailures)
	prometheus.MustRegister(broadcasterActiveWatchers)
}
