# Tasks

Each task lists the file(s) touched, the validation that proves it works, and a one-line summary of the diff.

## M1 — Watcher BIGSERIAL race fix

- [x] `internal/storage/postgresql/postgresql.go` — add `seenMu sync.Mutex` and `seenRVs map[string]int64` to `postgresWatcher`
- [x] `internal/storage/postgresql/postgresql.go` — `relist` queries with 500-rv lookback, dedups by uid via `seenRVs`, prunes entries below `lastSeenRV - 5000`
- [x] **Validate**: 30/30 chainsaw a2a-agent-discovery runs, max 23s (baseline had 197s and 228s outliers)

## M2 — Persistent replication slot

- [x] `internal/storage/postgresql/wal_consumer.go` — replace `walSlotPrefix` + `generateSlotName()` with constant `walSlotName = "ark_cdc"`
- [x] `internal/storage/postgresql/wal_connection.go` — `ensureReplicationSlot` inspects `pg_replication_slots`, drops + recreates if `wal_status='lost'`, reuses healthy existing (`LSN(0)` to resume from `confirmed_flush_lsn`), creates with `Temporary: false`
- [x] `internal/storage/postgresql/wal_consumer_test.go` — replace `TestGenerateSlotName` with `TestSlotNameIsStable`
- [x] **Validate**: post-deploy SQL check `temporary=f`; 12+ rapid apiserver kills, log shows `Reusing existing replication slot ark_cdc`, `confirmed_flush_lsn` advances

## M3 — managedFields ObjectMeta lookup

- [x] `internal/apiserver/openapi.go` — `canonicalName(goImportName)` reverses leading domain segment (`k8s.io/foo/bar.Type` → `io.k8s.foo.bar.Type`), registers k8s defs under both Go-style and canonical keys
- [x] `internal/apiserver/openapi_test.go` — `TestObjectMetaAnnotationsSchema` asserts lookup by canonical key
- [x] **Validate**: 0 `[SHOULD NOT HAPPEN]` log lines under chainsaw test load

## M4 — Status.LastResolvedAddress persistence on rebind

- [x] `internal/controller/a2aserver_controller.go` — in `Reconcile`, compare in-memory `Status.LastResolvedAddress` to freshly resolved value, call `updateStatusWithConditions` immediately if changed, before dispatching to `processServer`
- [x] **Validate**: ConfigMap-backed A2AServer rebound to a new ConfigMap value, `kubectl get a2aserver -o jsonpath='{.status.lastResolvedAddress}'` reflects new value within one poll interval

## M5 — ark-apiserver leases RBAC

- [x] `dist/chart-apiserver/templates/rbac.yaml` — add namespace-scoped Role + RoleBinding granting leases & events
- [x] **Validate**: `kubectl get lease ark-apiserver-leader -n ark-system` returns Lease with non-empty holder; 0 `leases.coordination.k8s.io ... is forbidden` errors after fresh apiserver start

## M6 — Documentation

- [x] `dist/chart-apiserver/README.md` — note the manual slot cleanup required on uninstall
- [x] `internal/storage/postgresql/postgresql.go` — inline `NOTE` in `List` documenting the paginated-consistency limitation
- [x] `openspec/changes/postgres-watch-correctness/{proposal,design,tasks,specs/...}.md`
