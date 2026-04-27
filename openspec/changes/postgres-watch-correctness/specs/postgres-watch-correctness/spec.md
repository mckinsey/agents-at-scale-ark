# postgres-watch-correctness

The PostgreSQL storage backend for the aggregated API server preserves Kubernetes watch semantics across all of: concurrent inserts, apiserver process restarts, server-side apply, and steady-state status updates.

## Invariants

### Watch event delivery

For every row committed in the `resources` table, every cluster-wide and namespace-scoped `postgresWatcher` whose (kind, namespace, label selector) matches the row eventually receives an event for it (Added on initial sync, Modified on subsequent updates) within bounded time, even when:

- the row's INSERT/UPDATE transaction commits in a different order than its `resource_version` value (BIGSERIAL race)
- the apiserver process restarts between the row's commit and the next watcher relist

Bound: missed-by-WAL events are caught up by the next `relist()`, which fires on every WAL nudge and on a 120-second relist ticker. With the lookback window in place, a row whose rv lands within the previous emitted-window's lookback is re-fetched and dedup'd via `seenRVs[uid]`, ensuring delivery even when the strict-greater cursor would have skipped past it.

### Replication slot persistence

A logical replication slot named `ark_cdc` exists for as long as ark-apiserver is installed. The slot is non-temporary, so its `confirmed_flush_lsn` survives apiserver pod restarts. On restart the apiserver reuses the existing slot and resumes the WAL stream from `confirmed_flush_lsn`, so no committed event is dropped from the WAL stream during the restart gap. If the slot is invalidated by `wal_status = 'lost'`, ark-apiserver drops and recreates it; if another session holds the slot active, ark-apiserver returns an error so the caller's backoff loop retries.

### Schema correctness for SSA

The OpenAPI definition map served by `GetOpenAPIDefinitions` includes every Kubernetes meta type (`ObjectMeta`, `ListMeta`, `Time`, `OwnerReference`, etc.) under both:

- the Go-style import-path key (`k8s.io/apimachinery/pkg/apis/meta/v1.ObjectMeta`) used by the kube-openapi spec builder for `/openapi/v2`
- the canonical reverse-domain key (`io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta`) used by the SSA field-manager for `$ref` resolution

So `kubectl apply --server-side` against any ark.mckinsey.com resource correctly attributes fields to managers and produces no `[SHOULD NOT HAPPEN]` log lines.

### Status persistence on rebind

When `A2AServerReconciler.Reconcile` re-resolves `Spec.Address` to a different value than the currently-persisted `Status.LastResolvedAddress`, the new value is written to the apiserver before the reconcile returns, regardless of whether any `Condition` transitions in this pass.

### Multi-replica leader election

The ark-apiserver ServiceAccount has the RBAC required (`get/list/watch/create/update/patch/delete` on `coordination.k8s.io/leases`, `create/patch` on `events` in its release namespace) for `controller-runtime`'s leader election to acquire `Lease/ark-apiserver-leader`. Multi-replica deployments elect a single leader; replication-slot contention then funnels exclusively through the persistent slot's `active` flag.

## Non-Goals

- Snapshot-consistent paginated LIST. The `List` handler still has the BIGSERIAL race when result size exceeds `opts.Limit`. Documented as a known limitation; proper fix requires `pg_export_snapshot()` + cross-page transaction snapshots, deferred to a separate change.
- xid wraparound handling. PostgreSQL's 32-bit txid wraps at ~2 billion transactions; this change does not address that horizon.
- Slot-lifecycle automation on `helm uninstall`. Operators must manually `SELECT pg_drop_replication_slot('ark_cdc')` after uninstalling ark-apiserver, or the slot will pin WAL retention indefinitely. Documented in `dist/chart-apiserver/README.md`.

## Validation

The following empirical tests, run on a local k3s cluster against the postgres backend with `deployment.split=true`, must pass:

- 30 sequential runs of `tests/a2a-agent-discovery` — 0 failures, 0 runs >60s, max 23s
- Apiserver pod kill mid-INSERT-burst — every committed row reconciled, no >120s reconcile gap in controller log
- 12+ rapid apiserver pod kills — `Reusing existing replication slot ark_cdc` log on every recovery, `confirmed_flush_lsn` advances monotonically across kills
- `kubectl apply --server-side` of any A2AServer/Agent/Model — 0 `[SHOULD NOT HAPPEN]` log entries under load
- ConfigMap-backed address rebind — `Status.LastResolvedAddress` reflects the new value within one poll interval
- Helm install + `kubectl get lease ark-apiserver-leader` — Lease exists with a holder field set
