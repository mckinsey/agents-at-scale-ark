## Why

The PostgreSQL-backed aggregated API server (`ark-apiserver`) has a cluster of correctness defects that surfaced as the long-standing E2E flakiness on `chainsaw/a2a-agent-discovery` and similar tests. CI ran `continue-on-error: ${{ matrix.storage-backend == 'postgresql' }}` for months because the postgres path could not be hard-gated. Empirical reproduction in a local k3s + split-deployment environment isolated four distinct defects — three in the storage layer, one in a Helm chart — that combine to produce: lost watch events, dropped status writes, broken server-side apply attribution, and a permanent leader-election retry loop. This change fixes all four with mechanical, behaviour-preserving diffs and adds inline documentation for one residual edge case (paginated LIST consistency) that needs a larger refactor.

## What Changes

### 1. `postgresWatcher.relist` — BIGSERIAL commit-order race

`resource_version BIGSERIAL` is assigned at INSERT statement time but row visibility depends on commit time. Two concurrent INSERTs `T_a (rv=N)` and `T_b (rv=N+1)` can commit in reverse order, so the WAL nudge from `T_b` triggers a relist that returns rv=N+1 (visible) but not rv=N (still in flight). The watcher advances `lastSeenRV` to N+1; when `T_a` commits later, the next relist's `WHERE rv > N+1` filter skips rv=N permanently. Recovery only happens when the watcher session resets (HTTP/2 watch reconnect or apiserver restart), causing 3–4 minute reconcile gaps.

Fix: `relist` queries with a 500-rv lookback window and per-uid dedup using a new `seenRVs map[string]int64` on `postgresWatcher`. Pruned to entries with rv >= `lastSeenRV - 5000` after each pass. Validated by 30/30 chainsaw runs at <23s each (baseline saw 197s and 228s outliers in 30 runs).

### 2. WAL replication slot — temporary slot loses events on restart

`pglogrepl.CreateReplicationSlot(..., {Temporary: true})` with a random name (`generateSlotName`) causes the slot to be dropped on session end. On every apiserver pod restart, a new slot is created at the *current* WAL position, so any INSERT/UPDATE that committed during the restart gap is invisible to the new WAL stream forever. Today this is masked by the 120s relist + (post-fix) lookback safety net, but every pod restart costs an unnecessary full SQL list scan and the WAL stops being authoritative.

Fix: stable slot name (`walSlotName = "ark_cdc"`), `Temporary: false`, `ensureReplicationSlot` inspects `pg_replication_slots`, reuses a healthy existing slot (passes LSN(0) so the server resumes from `confirmed_flush_lsn`), drops and recreates if `wal_status = 'lost'`, and returns an error (caller backs off and retries) if another session holds the slot active. Validated: slot survives 12+ rapid pod kills, `confirmed_flush_lsn` advances correctly across restarts, log says `Reusing existing replication slot ark_cdc; resuming from confirmed_flush_lsn`.

### 3. SSA fieldmanager — schema name canonicalisation

Every INSERT/UPDATE through ark-apiserver previously logged:
```
[SHOULD NOT HAPPEN] failed to update managedFields ...
schema error: no type found matching: io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta
```
because `apiserver/openapi.go` referenced types under their canonical reverse-domain key (`io.k8s.apimachinery...`) but registered them under their Go-style import-path key (`k8s.io/apimachinery/pkg/apis/meta/v1.ObjectMeta`) — the form returned by `apiextensions-apiserver/pkg/generated/openapi.GetOpenAPIDefinitions`. The mismatch silently broke server-side apply field-manager attribution: `kubectl apply --server-side` users would see merge surprises.

Fix: introduce `canonicalName(goImportName)` that converts `k8s.io/foo/bar.Type` → `io.k8s.foo.bar.Type` (reverses the leading domain segment). On load, register every k8s definition under both forms — Go-style for the `/openapi/v2` spec builder which expects it, canonical for the SSA fieldmanager which expects it. Validated: 0 "SHOULD NOT HAPPEN" errors in apiserver log under load.

### 4. `a2aserver_controller` — status not persisted on address rebind

`Reconcile` sets `a2aServer.Status.LastResolvedAddress = resolvedAddress` in memory, then dispatches into `processServer`. All the downstream `reconcileConditions*` paths only call `updateStatusWithConditions` when a *condition* changed. If the spec's address binding changes (e.g. ConfigMap value rebound) but discovery still succeeds with the same agent, no condition transitions occur and the new `LastResolvedAddress` is silently dropped. The status goes stale; the next reconcile re-resolves correctly but persists nothing.

Fix: in `Reconcile`, compare in-memory `a2aServer.Status.LastResolvedAddress` to the freshly resolved value before calling `processServer`, and if it changed, call `updateStatusWithConditions` immediately. Validated by a focused script: A2AServer pointing at ConfigMap `addr-v1` resolves to v1, status persists; spec patched to point at `addr-v2`, status updates to v2 within the next poll cycle.

### 5. ark-apiserver Helm chart — leases RBAC

The `ark-apiserver` ServiceAccount has no `coordination.k8s.io/leases` permissions, so leader election runs in a permanent retry loop. Today this only "works" because the deployment runs single-replica, the WAL consumer is not gated on leader election, and the API server functions despite the leader-election error spam. Multi-replica is broken: two replicas will both run the WAL consumer and fight over the (now persistent) replication slot.

Fix: add a namespace-scoped Role and RoleBinding granting `get/list/watch/create/update/patch/delete` on `coordination.k8s.io/leases` and `create/patch` on `events`. Validated: `Lease/ark-apiserver-leader` is created on chart upgrade and held by the active pod; 0 "leases.coordination.k8s.io is forbidden" errors in fresh apiserver logs.

### 6. Paginated LIST — known limitation, documented only

The `List` handler at `postgresql.go:316+` has the same BIGSERIAL race as `relist`: `WHERE rv < $continueToken` can skip rows that were in-flight during page N's snapshot and committed before page N+1. The race only bites when the result set exceeds `opts.Limit` (typically 500). Most Ark CR types stay well under that. The proper fix is snapshot-consistent pagination via `pg_export_snapshot()` + `SET TRANSACTION SNAPSHOT` across pages, which is a non-trivial refactor. Not bundled into this change. An inline `NOTE` in the code points at the proper fix.

## Impact

- `ark/internal/storage/postgresql/postgresql.go` — `relist` lookback+dedup, `postgresWatcher` struct gains `seenMu/seenRVs`, `List` gets explanatory NOTE comment
- `ark/internal/storage/postgresql/wal_consumer.go` — drop `walSlotPrefix`/`generateSlotName`; introduce `walSlotName` constant
- `ark/internal/storage/postgresql/wal_connection.go` — `ensureReplicationSlot` inspects existing slots, creates persistent ones
- `ark/internal/storage/postgresql/wal_consumer_test.go` — replace random-name test with stability test
- `ark/internal/apiserver/openapi.go` — `canonicalName` helper, dual-key registration
- `ark/internal/apiserver/openapi_test.go` — assert lookup by canonical key
- `ark/internal/controller/a2aserver_controller.go` — persist `LastResolvedAddress` on change in `Reconcile`
- `ark/dist/chart-apiserver/templates/rbac.yaml` — add Role + RoleBinding for leases

No CRD changes. No public API changes. Existing deployments upgrade in place; the persistent slot is created on first start of the new image. **Operational note:** uninstalling ark-apiserver no longer cleans up the slot — operators must manually `SELECT pg_drop_replication_slot('ark_cdc');` against the postgres database after `helm uninstall`. Documented in chart README.

## Capabilities

### Modified Capabilities

- `postgres-watch-correctness` (new): the postgres-backed apiserver delivers every committed row to every watcher exactly once (modulo per-uid dedup), persists status updates whose only change is a status field outside conditions, surfaces correct OpenAPI types for SSA, and supports leader election in the apiserver fleet.
