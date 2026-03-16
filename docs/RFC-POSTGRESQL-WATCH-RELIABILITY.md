# RFC: PostgreSQL Watch Pipeline Reliability

## Status
**Implemented** — March 2026

## Problem

The PostgreSQL storage backend's watch implementation had a critical reliability gap: **events were silently dropped when the watcher channel buffer (100) was full.** Controllers permanently missed resource creation/update/deletion events, leading to resources never being reconciled.

### Evidence (pre-fix)

Integration tests against a live postgresql backend confirmed:

| Test | Result |
|------|--------|
| 150 resources created with slow consumer | **50 events silently dropped** (channel buffer=100 is hard ceiling) |
| Notification latency (create → watch event) | **~10ms average** (pg_notify → DB re-fetch → channel send) |
| Serial version ordering | Correct (single listener serializes events) |
| Concurrent write ordering | Correct (60/60 delivered, in order) |

The drop scenario was reproducible in CI: 6 parallel chainsaw tests each creating 5-10 resources simultaneously. The controller-runtime informer cache couldn't consume events fast enough, the channel filled, and ADDED events were permanently lost.

### Impact

- **E2E flakiness**: `ark-mcp-discovery` failed in CI because MCPServer ADDED event was dropped — controller never reconciled it, status stayed `{}` forever
- **Production risk**: Under burst load (e.g., GitOps deploying many resources simultaneously), controllers could miss resources permanently until controller restart
- **No recovery mechanism**: Unlike etcd watches (which force re-list on backpressure), dropped events were permanently lost

## Previous Architecture

```
Write: Create/Update/Delete → postgresql INSERT/UPDATE/DELETE
                                    ↓ (trigger)
                              pg_notify('ark_resources', {operation, kind, ns, name, rv})
                                    ↓ (async, ~1ms)
                              pq.Listener receives notification
                                    ↓ (single goroutine, serialized)
                              handleNotification:
                                - parse JSON payload (metadata only, no object body)
                                - Get() query to DB (full object re-fetch, ~0.06ms query, ~10ms total)
                                - notifyWatchers: send to channel
                                    ↓
                              select { case ch <- event: | default: DROP }
                                    ↓
                              controller-runtime informer consumes event
```

### Problems

1. **Silent drops**: `select { default: drop }` when channel buffer (100) is full
2. **Re-fetch on every event**: pg_notify payload only carries metadata — every event triggered a full DB round-trip (~10ms)
3. **Single goroutine bottleneck**: `listenForNotifications` processed events serially; one slow `Get()` blocked all subsequent notifications
4. **No re-list safety net**: missed events were never recovered
5. **Global notification channel**: all resource kinds/namespaces shared one `ark_resources` pg_notify channel

## New Architecture

```
Write: Create → INSERT RETURNING rv, generation, created_at
                  → reconstructObject from RETURNING data (no extra query)
                  → notifyWatchers directly (synchronous, in-process)
                       ↓
                  watcher.send(event):
                    - try channel send
                    - if full for 5s → close watch (forces re-list)
                       ↓
                  controller-runtime informer consumes event

Safety net: every 30s per watcher
                  → List all resources for kind/namespace
                  → deliver synthetic MODIFIED events
                  → catches any missed events from crashes, races, etc.

pg_notify: listener stays alive but ignores notifications
           (reserved for future multi-replica support)
```

### Key changes

1. **Direct notification from write path**: `Create`, `Update`, `UpdateStatus`, and `Delete` call `notifyWatchers()` directly after successful DB operations. No async pg_notify round-trip.

2. **`INSERT ... RETURNING` for Create**: Generated `resource_version`, `generation`, and `created_at` are returned from the INSERT and used to reconstruct the object in-memory — eliminates the re-fetch `Get()` query entirely for creates.

3. **Blocking send with timeout**: `notifyWatchers` uses a 5-second timeout instead of drop-on-full. If the channel is full for 5s, the watcher is closed, forcing controller-runtime to detect the closed watch and re-list (matching etcd backpressure semantics).

4. **Re-list safety net**: Each watcher runs a periodic re-list (every 30s) that fetches all current resources and delivers them as synthetic MODIFIED events. This self-heals any missed events from any cause.

5. **pg_notify demoted to signal-only**: The listener goroutine stays alive (for future multi-replica support) but no longer processes notifications. All event delivery is synchronous from the write path.

## Validation Results (post-fix)

### Integration tests

| Test | Before | After |
|------|--------|-------|
| Event drops (150 creates, slow consumer) | 50 silently dropped | Watch closed after 5s (forces re-list recovery) |
| Notification latency | ~10ms (pg_notify + re-fetch) | ~10ms (INSERT round-trip, but synchronous — no async gap) |
| Version skipping (30 rapid updates) | 30/30 delivered | 30/30 delivered |
| Concurrent write ordering (60 creates, 6 writers) | 60/60, in order | 60/60, 1 benign out-of-order (concurrent direct notify) |

The 1 out-of-order event in concurrent writes is benign: two concurrent `Create()` calls can interleave their `notifyWatchers()` calls. Controller-runtime handles this correctly via resourceVersion comparison.

### E2E tests

Full chainsaw E2E suite (Standard, postgresql backend):

| | Before | After |
|---|--------|-------|
| Passed | 44-45/46 (flaky) | **46/46** |
| `ark-mcp-discovery` | Flaky (event dropped under load) | **PASS** |
| `agent-structured-output` | Flaky (cleanup timeout) | **PASS** |
| `a2a-message-context` | Flaky (timing) | **PASS** |

## Trade-offs and future considerations

### Accepted trade-offs

- **Re-list adds periodic DB load**: Every 30s, each watcher does a `List()` query. With ~18 kind/namespace combinations, this is ~36 queries/minute. The queries are indexed and return small result sets — acceptable for the reliability guarantee.

- **Concurrent write ordering**: Direct notification from concurrent writers can deliver events slightly out of order. Controller-runtime handles this gracefully. If strict ordering is needed in the future, a serialization queue could be added.

- **UpdateStatus still does a separate Get()**: Status updates only carry the status field — the full object (spec, labels, etc.) must be re-fetched for the watch event. This is acceptable because status updates are less frequent than creates, and the Get() is fast (~0.06ms query time).

### Future improvements

- **WAL-based change data capture** (Proposal C from the original RFC): Replace pg_notify entirely with a `resource_changes` table for guaranteed ordering, no event drops, and restart resumability. This would be the path to multi-replica support.

- **Metrics**: Add prometheus counters for `events_delivered`, `watch_timeouts`, `relist_corrections` to monitor watch pipeline health in production.

## Files changed

- `ark/internal/storage/postgresql/postgresql.go` — Core watch pipeline rewrite
- `ark/internal/storage/postgresql/watch_validation_test.go` — Integration tests proving the fix
