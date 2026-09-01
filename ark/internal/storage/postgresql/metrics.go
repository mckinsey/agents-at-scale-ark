/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"database/sql"
	"math"
	"sync/atomic"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	ctrlmetrics "sigs.k8s.io/controller-runtime/pkg/metrics"
)

// Broadcaster and WAL observability. Defined in the postgresql package (rather
// than internal/apiserver/metrics) to keep the storage layer free of an upward
// dependency on the apiserver package. Registered once via init() on
// controller-runtime's registry, which is what --metrics-bind-address serves.
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

	walConsumerActive = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "ark_apiserver_wal_consumer_active",
			Help: "1 while this replica runs the WAL consumer (leader-gated, so a healthy deployment sums to 1)",
		},
	)

	walLastMessageTimestamp = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "ark_apiserver_wal_last_message_timestamp_seconds",
			Help: "Unix time of the last WAL message (XLogData or keepalive) received by the consumer",
		},
	)

	replicationSlotLagBytes = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "ark_apiserver_replication_slot_lag_bytes",
			Help: "WAL bytes between pg_current_wal_lsn() and the ark_cdc slot's confirmed_flush_lsn; NaN on replicas not running the WAL consumer",
		},
	)
)

const slotLagSampleInterval = 30 * time.Second

// slotLagSampler runs only alongside the WAL consumer (leader only): non-leader
// replicas hold no slot, so they keep exporting the NaN set at init.
type slotLagSampler struct {
	interval time.Duration
	query    func(context.Context) (float64, error)
}

func (s *slotLagSampler) run(ctx context.Context) {
	defer replicationSlotLagBytes.Set(math.NaN())
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.sample(ctx)
		}
	}
}

func (s *slotLagSampler) sample(ctx context.Context) {
	lag, err := s.query(ctx)
	if err != nil {
		replicationSlotLagBytes.Set(math.NaN())
		return
	}
	replicationSlotLagBytes.Set(lag)
}

func (p *PostgreSQLBackend) querySlotLag(ctx context.Context) (float64, error) {
	var lag sql.NullFloat64
	err := p.db.QueryRowContext(ctx, `
		SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)
		FROM pg_replication_slots
		WHERE slot_name = $1`, walSlotName).Scan(&lag)
	if err != nil {
		return 0, err
	}
	if !lag.Valid {
		return math.NaN(), nil
	}
	return lag.Float64, nil
}

var (
	dbPoolMaxOpenDesc = prometheus.NewDesc(
		"ark_apiserver_db_pool_max_open_connections",
		"Maximum number of open connections to the database", nil, nil)
	dbPoolOpenDesc = prometheus.NewDesc(
		"ark_apiserver_db_pool_open_connections",
		"Established connections to the database, in use and idle", nil, nil)
	dbPoolInUseDesc = prometheus.NewDesc(
		"ark_apiserver_db_pool_in_use_connections",
		"Connections currently in use", nil, nil)
	dbPoolIdleDesc = prometheus.NewDesc(
		"ark_apiserver_db_pool_idle_connections",
		"Idle connections", nil, nil)
	dbPoolWaitCountDesc = prometheus.NewDesc(
		"ark_apiserver_db_pool_wait_count_total",
		"Total number of connection waits because the pool was exhausted", nil, nil)
	dbPoolWaitDurationDesc = prometheus.NewDesc(
		"ark_apiserver_db_pool_wait_duration_seconds_total",
		"Total time blocked waiting for a connection", nil, nil)
)

// dbPoolStats is installed by New; until then the collector emits nothing.
var dbPoolStats atomic.Pointer[func() sql.DBStats]

func setDBPoolStats(fn func() sql.DBStats) {
	dbPoolStats.Store(&fn)
}

type dbPoolCollector struct{}

func (dbPoolCollector) Describe(ch chan<- *prometheus.Desc) {
	ch <- dbPoolMaxOpenDesc
	ch <- dbPoolOpenDesc
	ch <- dbPoolInUseDesc
	ch <- dbPoolIdleDesc
	ch <- dbPoolWaitCountDesc
	ch <- dbPoolWaitDurationDesc
}

func (dbPoolCollector) Collect(ch chan<- prometheus.Metric) {
	fn := dbPoolStats.Load()
	if fn == nil {
		return
	}
	s := (*fn)()
	ch <- prometheus.MustNewConstMetric(dbPoolMaxOpenDesc, prometheus.GaugeValue, float64(s.MaxOpenConnections))
	ch <- prometheus.MustNewConstMetric(dbPoolOpenDesc, prometheus.GaugeValue, float64(s.OpenConnections))
	ch <- prometheus.MustNewConstMetric(dbPoolInUseDesc, prometheus.GaugeValue, float64(s.InUse))
	ch <- prometheus.MustNewConstMetric(dbPoolIdleDesc, prometheus.GaugeValue, float64(s.Idle))
	ch <- prometheus.MustNewConstMetric(dbPoolWaitCountDesc, prometheus.CounterValue, float64(s.WaitCount))
	ch <- prometheus.MustNewConstMetric(dbPoolWaitDurationDesc, prometheus.CounterValue, s.WaitDuration.Seconds())
}

func init() {
	replicationSlotLagBytes.Set(math.NaN())
	ctrlmetrics.Registry.MustRegister(
		broadcasterRelistTotal,
		broadcasterRelistFailures,
		broadcasterEventsDispatched,
		broadcasterEventsDropped,
		watcherRelistFailures,
		broadcasterActiveWatchers,
		walConsumerActive,
		walLastMessageTimestamp,
		replicationSlotLagBytes,
		dbPoolCollector{},
	)
}
