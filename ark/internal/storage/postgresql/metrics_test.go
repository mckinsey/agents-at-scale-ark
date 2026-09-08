/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"database/sql"
	"errors"
	"math"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/jackc/pglogrepl"
	"github.com/jackc/pgx/v5/pgproto3"
	"github.com/prometheus/client_golang/prometheus/testutil"
	ctrlmetrics "sigs.k8s.io/controller-runtime/pkg/metrics"
)

// A follower never runs the consumer, so its timestamp must read NaN rather
// than 0: `time() - <timestamp> > 300` would otherwise fire on every replica
// that is not the leader. First in the package's test order so it observes
// the init() value before any test drives the consumer.
func TestLastMessageTimestampIsNaNWithoutConsumer(t *testing.T) {
	if got := testutil.ToFloat64(walLastMessageTimestamp); !math.IsNaN(got) {
		t.Errorf("ark_apiserver_wal_last_message_timestamp_seconds before any consumer ran = %v, want NaN", got)
	}
}

// swapDBPoolStats installs fn for the test and restores the previous value,
// so tests over the package-level pointer do not leak into each other.
func swapDBPoolStats(t *testing.T, fn func() sql.DBStats) {
	t.Helper()
	previous := dbPoolStats.Load()
	if fn == nil {
		dbPoolStats.Store(nil)
	} else {
		setDBPoolStats(fn)
	}
	t.Cleanup(func() { dbPoolStats.Store(previous) })
}

// Guards against a collector regressing to the prometheus default registry:
// --metrics-bind-address serves controller-runtime's registry, so a metric
// registered anywhere else is unscrapeable.
func TestMetricsGatheredByControllerRuntimeRegistry(t *testing.T) {
	broadcasterRelistTotal.WithLabelValues("RegistryTest")
	broadcasterRelistFailures.WithLabelValues("RegistryTest")
	broadcasterEventsDispatched.WithLabelValues("RegistryTest")
	broadcasterEventsDropped.WithLabelValues("RegistryTest")
	watcherRelistFailures.WithLabelValues("RegistryTest")
	broadcasterActiveWatchers.WithLabelValues("RegistryTest")
	swapDBPoolStats(t, func() sql.DBStats { return sql.DBStats{} })

	families, err := ctrlmetrics.Registry.Gather()
	if err != nil {
		t.Fatalf("gather: %v", err)
	}
	gathered := make(map[string]bool, len(families))
	for _, f := range families {
		gathered[f.GetName()] = true
	}

	for _, name := range []string{
		"ark_apiserver_watch_broadcaster_relist_total",
		"ark_apiserver_watch_broadcaster_relist_failures_total",
		"ark_apiserver_watch_broadcaster_events_dispatched_total",
		"ark_apiserver_watch_broadcaster_events_dropped_total",
		"ark_apiserver_watch_watcher_relist_failures_total",
		"ark_apiserver_watch_broadcaster_active_watchers",
		"ark_apiserver_wal_consumer_active",
		"ark_apiserver_wal_last_message_timestamp_seconds",
		"ark_apiserver_replication_slot_lag_bytes",
		"ark_apiserver_db_pool_max_open_connections",
		"ark_apiserver_db_pool_open_connections",
		"ark_apiserver_db_pool_in_use_connections",
		"ark_apiserver_db_pool_idle_connections",
		"ark_apiserver_db_pool_wait_count_total",
		"ark_apiserver_db_pool_wait_duration_seconds_total",
	} {
		if !gathered[name] {
			t.Errorf("metric %s not gathered by controller-runtime registry", name)
		}
	}
}

func TestDBPoolCollector(t *testing.T) {
	swapDBPoolStats(t, func() sql.DBStats {
		return sql.DBStats{
			MaxOpenConnections: 40,
			OpenConnections:    7,
			InUse:              3,
			Idle:               4,
			WaitCount:          9,
			WaitDuration:       1500 * time.Millisecond,
		}
	})

	expected := `
# HELP ark_apiserver_db_pool_idle_connections Idle connections
# TYPE ark_apiserver_db_pool_idle_connections gauge
ark_apiserver_db_pool_idle_connections 4
# HELP ark_apiserver_db_pool_in_use_connections Connections currently in use
# TYPE ark_apiserver_db_pool_in_use_connections gauge
ark_apiserver_db_pool_in_use_connections 3
# HELP ark_apiserver_db_pool_max_open_connections Maximum number of open connections to the database
# TYPE ark_apiserver_db_pool_max_open_connections gauge
ark_apiserver_db_pool_max_open_connections 40
# HELP ark_apiserver_db_pool_open_connections Established connections to the database, in use and idle
# TYPE ark_apiserver_db_pool_open_connections gauge
ark_apiserver_db_pool_open_connections 7
# HELP ark_apiserver_db_pool_wait_count_total Total number of connection waits because the pool was exhausted
# TYPE ark_apiserver_db_pool_wait_count_total counter
ark_apiserver_db_pool_wait_count_total 9
# HELP ark_apiserver_db_pool_wait_duration_seconds_total Total time blocked waiting for a connection
# TYPE ark_apiserver_db_pool_wait_duration_seconds_total counter
ark_apiserver_db_pool_wait_duration_seconds_total 1.5
`
	if err := testutil.CollectAndCompare(dbPoolCollector{}, strings.NewReader(expected)); err != nil {
		t.Error(err)
	}
}

func TestDBPoolCollectorEmitsNothingBeforeBackendExists(t *testing.T) {
	swapDBPoolStats(t, nil)

	if got := testutil.CollectAndCount(dbPoolCollector{}); got != 0 {
		t.Errorf("expected no samples before a backend installs the stats func, got %d", got)
	}
}

func TestSlotLagSamplerSample(t *testing.T) {
	s := &slotLagSampler{query: func(context.Context) (float64, error) { return 2048, nil }}
	s.sample(context.Background())
	if got := testutil.ToFloat64(replicationSlotLagBytes); got != 2048 {
		t.Errorf("slot lag = %v, want 2048", got)
	}

	s.query = func(context.Context) (float64, error) { return 0, errors.New("boom") }
	s.sample(context.Background())
	if got := testutil.ToFloat64(replicationSlotLagBytes); !math.IsNaN(got) {
		t.Errorf("slot lag after query error = %v, want NaN", got)
	}
}

func TestSlotLagSamplerRunSamplesUntilStopped(t *testing.T) {
	var calls atomic.Int64
	s := &slotLagSampler{
		interval: time.Millisecond,
		query: func(context.Context) (float64, error) {
			calls.Add(1)
			return 64, nil
		},
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		s.run(ctx)
		close(done)
	}()

	deadline := time.After(2 * time.Second)
	for calls.Load() < 3 {
		select {
		case <-deadline:
			t.Fatalf("sampler made %d calls, want at least 3", calls.Load())
		case <-time.After(time.Millisecond):
		}
	}

	cancel()
	<-done
	if got := testutil.ToFloat64(replicationSlotLagBytes); !math.IsNaN(got) {
		t.Errorf("slot lag after sampler stop = %v, want NaN", got)
	}
}

func TestHandleWALMessageUpdatesLastMessageTimestamp(t *testing.T) {
	backend, _ := newTestBackendWithBroadcasters()
	state := &walStreamState{relations: make(map[uint32]*pglogrepl.RelationMessage)}

	walLastMessageTimestamp.Set(0)
	msg := &pgproto3.CopyData{Data: append([]byte{pglogrepl.PrimaryKeepaliveMessageByteID}, make([]byte, 17)...)}
	if err := backend.handleWALMessage(nil, msg, state); err != nil {
		t.Fatalf("handleWALMessage keepalive: %v", err)
	}
	if got := testutil.ToFloat64(walLastMessageTimestamp); got == 0 {
		t.Error("keepalive did not update ark_apiserver_wal_last_message_timestamp_seconds")
	}

	walLastMessageTimestamp.Set(0)
	msg = &pgproto3.CopyData{Data: encodeXLogData(0x200, encodeInsertMessage(1, makeTuple("Agent", "default", "a")))}
	if err := backend.handleWALMessage(nil, msg, state); err != nil {
		t.Fatalf("handleWALMessage xlog: %v", err)
	}
	if got := testutil.ToFloat64(walLastMessageTimestamp); got == 0 {
		t.Error("XLogData did not update ark_apiserver_wal_last_message_timestamp_seconds")
	}
}

func TestStartWALConsumerSetsActiveGauge(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	p := &PostgreSQLBackend{ctx: ctx, cancel: cancel, connStr: "host=127.0.0.1 port=1 user=ark connect_timeout=1"}

	done := make(chan struct{})
	go func() {
		p.startWALConsumer()
		close(done)
	}()

	deadline := time.After(5 * time.Second)
	for testutil.ToFloat64(walConsumerActive) != 1 {
		select {
		case <-deadline:
			t.Fatal("ark_apiserver_wal_consumer_active never reached 1 while the consumer was running")
		case <-time.After(time.Millisecond):
		}
	}

	cancel()
	<-done
	if got := testutil.ToFloat64(walConsumerActive); got != 0 {
		t.Errorf("ark_apiserver_wal_consumer_active after stop = %v, want 0", got)
	}
	if got := testutil.ToFloat64(walLastMessageTimestamp); !math.IsNaN(got) {
		t.Errorf("ark_apiserver_wal_last_message_timestamp_seconds after stop = %v, want NaN", got)
	}
}

func TestQuerySlotLag(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer func() { _ = db.Close() }()
	p := &PostgreSQLBackend{db: db}

	mock.ExpectQuery("pg_wal_lsn_diff").WithArgs(walSlotName).
		WillReturnRows(sqlmock.NewRows([]string{"lag"}).AddRow(4096))
	lag, err := p.querySlotLag(context.Background())
	if err != nil || lag != 4096 {
		t.Errorf("querySlotLag = %v, %v; want 4096, nil", lag, err)
	}

	mock.ExpectQuery("pg_wal_lsn_diff").WithArgs(walSlotName).
		WillReturnRows(sqlmock.NewRows([]string{"lag"}).AddRow(nil))
	lag, err = p.querySlotLag(context.Background())
	if err != nil || !math.IsNaN(lag) {
		t.Errorf("querySlotLag on NULL confirmed_flush_lsn = %v, %v; want NaN, nil", lag, err)
	}

	mock.ExpectQuery("pg_wal_lsn_diff").WithArgs(walSlotName).
		WillReturnRows(sqlmock.NewRows([]string{"lag"}))
	if _, err = p.querySlotLag(context.Background()); err == nil {
		t.Error("querySlotLag with no slot row should error")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Error(err)
	}
}
