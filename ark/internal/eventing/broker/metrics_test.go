/* Copyright 2025. McKinsey & Company */

package broker

import (
	"testing"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	ctrlmetrics "sigs.k8s.io/controller-runtime/pkg/metrics"
)

func gatheredMetricNames(t *testing.T, g prometheus.Gatherer) map[string]bool {
	t.Helper()
	families, err := g.Gather()
	require.NoError(t, err)
	names := make(map[string]bool, len(families))
	for _, mf := range families {
		names[mf.GetName()] = true
	}
	return names
}

// The emitter runs in both the controller (serves controller-runtime's
// registry) and the completions executor (serves the default registry via
// promhttp). Both must expose the metrics, or drops in one process go nowhere.
func TestEmitMetricsRegisteredOnBothRegistries(t *testing.T) {
	// Materialize a child so the vec collectors emit their metric family; an
	// untouched vec gathers nothing and the family name would be absent.
	emitDroppedTotal.WithLabelValues("registration_probe").Inc()
	emitLatencySeconds.WithLabelValues("registration_probe").Observe(0)

	for _, tc := range []struct {
		name     string
		gatherer prometheus.Gatherer
	}{
		{"controller-runtime", ctrlmetrics.Registry},
		{"default", prometheus.DefaultGatherer},
	} {
		t.Run(tc.name, func(t *testing.T) {
			names := gatheredMetricNames(t, tc.gatherer)
			assert.True(t, names["ark_broker_emit_dropped_total"], "ark_broker_emit_dropped_total missing from %s registry", tc.name)
			assert.True(t, names["ark_broker_emit_latency_seconds"], "ark_broker_emit_latency_seconds missing from %s registry", tc.name)
		})
	}
}
