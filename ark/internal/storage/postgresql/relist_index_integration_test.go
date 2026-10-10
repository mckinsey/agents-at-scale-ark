//go:build integration
// +build integration

/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"strings"
	"testing"
)

const (
	relistIndexProbeKind  = "RelistIndexProbe"
	relistIndexProbeKinds = 5
	relistIndexProbeRows  = 30000
	relistIndexLookback   = 500
)

func relistIndexBackend(t *testing.T) *PostgreSQLBackend {
	t.Helper()

	backend, err := New(testConfig(t), &integrationMockConverter{})
	if err != nil {
		t.Fatalf("create backend: %v", err)
	}
	t.Cleanup(func() { _ = backend.Close() })
	return backend
}

func TestSchemaCreatesRelistIndexes_Integration(t *testing.T) {
	backend := relistIndexBackend(t)

	for _, tc := range []struct {
		index   string
		columns string
	}{
		{"idx_resources_kind_rv", "(kind, resource_version)"},
		{"idx_resources_rv", "(resource_version)"},
	} {
		var def string
		err := backend.db.QueryRowContext(context.Background(),
			"SELECT indexdef FROM pg_indexes WHERE tablename = 'resources' AND indexname = $1", tc.index).Scan(&def)
		if err != nil {
			t.Errorf("%s not created by initSchema: %v", tc.index, err)
			continue
		}
		if !strings.HasSuffix(def, tc.columns) {
			t.Errorf("%s is %q, want it to end in %q", tc.index, def, tc.columns)
		}
	}
}

// TestRelistReadsRowsInOrderFromAnIndex_Integration pins the shape of the relist that runs
// on every write to a kind: the rows must arrive in resource-version order from an index.
// Without one the planner sorts them, and that sort is what spills to disk once a kind
// holds more rows than work_mem can hold. The two queries are the ones the broadcaster and
// a catching-up watcher actually issue.
func TestRelistReadsRowsInOrderFromAnIndex_Integration(t *testing.T) {
	backend := relistIndexBackend(t)
	ctx := context.Background()
	maxRV := seedRelistIndexProbe(ctx, t, backend)

	watcher := &postgresWatcher{kind: relistIndexProbeKind}
	watcher.lastSeenRV.Store(maxRV)
	watcherQuery, watcherArgs := watcher.buildRelistQuery()

	for _, tc := range []struct {
		name  string
		query string
		args  []interface{}
	}{
		{
			name:  "broadcaster relist",
			query: broadcasterRelistQuery,
			args:  []interface{}{relistIndexProbeKind, maxRV - relistIndexLookback},
		},
		{
			name:  "watcher catch-up relist",
			query: watcherQuery,
			args:  watcherArgs,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			plan := explainRelistQuery(ctx, t, backend, tc.query, tc.args...)
			// Both indexes stream rows in resource-version order; the planner
			// picks between them on selectivity. Anything else (seq scan,
			// bitmap scan, a differently-ordered index) needs a Sort node and
			// fails here.
			if !strings.Contains(plan, "Index Scan using idx_resources_kind_rv") &&
				!strings.Contains(plan, "Index Scan using idx_resources_rv") {
				t.Errorf("relist does not read its rows in resource-version order from an rv index:\n%s", plan)
			}
		})
	}
}

// TestBookmarkRefreshDoesNotScanTheTable_Integration covers the max-resource-version query
// behind the bookmark refresh, which runs every 10s for the lifetime of the process.
func TestBookmarkRefreshDoesNotScanTheTable_Integration(t *testing.T) {
	backend := relistIndexBackend(t)
	ctx := context.Background()
	seedRelistIndexProbe(ctx, t, backend)

	plan := explainRelistQuery(ctx, t, backend, maxResourceVersionQuery)
	if !strings.Contains(plan, "Index Only Scan Backward using idx_resources_rv") {
		t.Errorf("bookmark refresh does not read the highest resource version straight off an index:\n%s", plan)
	}
}

// seedRelistIndexProbe fills the table the way a real deployment holds it: several kinds
// interleaved in resource-version order, so `kind = $1` is a selective predicate and the
// planner has real alternatives to choose between. Returns the max resource version.
func seedRelistIndexProbe(ctx context.Context, t *testing.T, backend *PostgreSQLBackend) int64 {
	t.Helper()

	deleteProbe := func() {
		if _, err := backend.db.ExecContext(ctx,
			"DELETE FROM resources WHERE namespace = 'relist-index-probe'"); err != nil {
			t.Fatalf("delete probe rows: %v", err)
		}
	}
	deleteProbe()
	t.Cleanup(deleteProbe)

	if _, err := backend.db.ExecContext(ctx, `
		INSERT INTO resources (kind, namespace, name, uid, spec)
		SELECT CASE WHEN g % $2 = 0 THEN $1 ELSE $1 || (g % $2)::text END,
		       'relist-index-probe', 'probe-' || g, md5(g::text),
		       jsonb_build_object('prompt', repeat('x', 400))
		FROM generate_series(1, $3) g`,
		relistIndexProbeKind, relistIndexProbeKinds, relistIndexProbeRows); err != nil {
		t.Fatalf("seed probe rows: %v", err)
	}
	if _, err := backend.db.ExecContext(ctx, "ANALYZE resources"); err != nil {
		t.Fatalf("analyze: %v", err)
	}

	maxRV, err := backend.getMaxResourceVersion()
	if err != nil {
		t.Fatalf("read max resource version: %v", err)
	}
	return maxRV
}

func explainRelistQuery(ctx context.Context, t *testing.T, backend *PostgreSQLBackend, query string, args ...interface{}) string {
	t.Helper()

	rows, err := backend.db.QueryContext(ctx, "EXPLAIN (ANALYZE, VERBOSE OFF, SUMMARY OFF) "+query, args...)
	if err != nil {
		t.Fatalf("explain: %v", err)
	}
	defer func() { _ = rows.Close() }()

	var plan strings.Builder
	for rows.Next() {
		var line string
		if err := rows.Scan(&line); err != nil {
			t.Fatalf("scan plan: %v", err)
		}
		plan.WriteString(line)
		plan.WriteString("\n")
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("read plan: %v", err)
	}
	return plan.String()
}
