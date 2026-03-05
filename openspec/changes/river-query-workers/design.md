## Context

In PostgreSQL mode (`ARK_STORAGE_BACKEND != etcd`), Ark runs an embedded aggregated API server (`ark/internal/apiserver/server.go`) that stores all resources in a PostgreSQL `resources` table. The query reconciler watches Query CRs via controller-runtime's `client.Client` (pointed at the embedded API server), spawns a goroutine per query tracked in a `sync.Map`, and updates status via the Kubernetes client. LISTEN/NOTIFY on the `resources` table drives watch events.

The current approach has limitations: goroutines are lost on crash (queries stuck in `running`), `sync.Map` only prevents duplicates within a single process, there's no backpressure or retry, and in-flight state is opaque.

## Goals / Non-Goals

**Goals:**
- Durable query execution that survives process restarts
- Exclusive locking via PostgreSQL advisory locks (replacing `sync.Map`)
- Automatic retry with backoff for transient failures (LLM timeouts, rate limits)
- Configurable worker concurrency with backpressure
- Queryable job state for operator debugging
- Zero changes to the Query CRD API surface
- Shared execution logic between etcd mode (reconciler) and PostgreSQL mode (River worker)

**Non-Goals:**
- Separate worker pods / horizontal scaling (future evolution)
- Changes to the etcd code path
- New query phases (e.g. "retrying")
- Migration of other resource types to River

## Decisions

### 1. River as the job queue library

**Choice:** Use `github.com/riverqueue/river` for PostgreSQL-native job queuing.

**Why River over alternatives:**
- Go-native, uses `pgx` (Ark already depends on PostgreSQL)
- Advisory lock-based exclusive locking via `SELECT ... FOR UPDATE SKIP LOCKED`
- Built-in retry with configurable backoff
- Periodic job support (for TTL cleanup)
- In-process client — no separate broker infrastructure
- Active maintenance, well-documented

**Alternatives considered:**
- Raw goroutines with `pg_advisory_lock`: More control but reinvents retry, backoff, observability
- Temporal/other workflow engines: Too heavy for this use case, adds infrastructure dependency
- Redis-based queues (Asynq): Adds Redis dependency when PostgreSQL is already present

### 2. Job enqueue at the storage layer (transactional)

**Choice:** Enqueue a River job in the same database transaction as the Query resource INSERT in `postgresql.go`.

**Why:** Atomicity — the query and its execution job either both exist or neither does. No window where a query exists but its job was lost.

**Implementation:** The `PostgreSQLBackend.Create()` method detects `kind == "Query"` and enqueues a River job in the same transaction. This requires converting the single `ExecContext` call to a transaction.

**Alternative considered:** A thin reconciler that watches for new queries and enqueues — adds latency and a failure window between query creation and job enqueue.

### 3. Workers write status directly to PostgreSQL

**Choice:** Workers update the `resources` table directly using SQL (not through the Kubernetes API server).

**Why:**
- Avoids network round-trip back to the embedded API server
- The existing LISTEN/NOTIFY trigger on the `resources` table still fires, so watchers are notified
- Workers must bump `resource_version` atomically to maintain optimistic concurrency

**Trade-off:** Bypasses admission/validation on status updates. Acceptable because status writes are internal (not user-facing) and the current reconciler also writes status without re-validation.

### 4. In-process River client (same binary)

**Choice:** River client runs as goroutines within the existing Ark controller process, started as a manager runnable alongside the embedded API server.

**Why:** Minimal deployment change. Same binary, same process, same `client.Client` for resolving Agent/Model/Team/Tool CRDs. Gets durability and locking benefits without operational complexity.

**Future path:** Workers can be extracted to separate pods later by running the same binary with a `--mode=worker` flag and sharing the PostgreSQL connection.

### 5. Export execution function from controller package

**Choice:** Export `ExecuteQuery` (currently `executeQueryAsync`) from the controller package. Both the reconciler (etcd mode) and River worker (PostgreSQL mode) call it.

**Why:** Single source of truth for query execution logic. The function already has all the right dependencies via the `QueryReconciler` struct — the worker can construct one with the same fields.

**What changes:** The function signature becomes exported. Status update calls within it need to be abstracted or handled by the caller. The worker will construct a `QueryReconciler` value (not registering it as a controller) purely to access the execution method.

### 6. Disable query reconciler in PostgreSQL mode

**Choice:** Skip registering the `QueryReconciler` with the controller manager when `ARK_STORAGE_BACKEND` is not etcd.

**Implementation:** `setupControllers()` in `main.go` checks the environment variable and omits the Query controller from the registration list. All other controllers remain unchanged.

### 7. Error classification for retry

**Choice:** Classify errors as retryable or permanent. River retries transient errors; permanent errors immediately cancel the job and set `phase: error`.

**Retryable:** LLM provider timeouts, HTTP 429/502/503, transient network errors, memory service temporarily unavailable.

**Permanent:** Target not found (Agent/Model/Team/Tool doesn't exist), validation errors, auth/RBAC failures, malformed input.

**Implementation:** A helper function `IsRetryable(error) bool` checks error types and HTTP status codes. The River worker returns the error for retry or calls `river.JobCancel` for permanent failures.

### 8. TTL cleanup as River periodic job

**Choice:** Replace reconciler-based TTL expiry with a River periodic job that runs on a configurable interval (default: every 10 minutes).

**Implementation:** The periodic job queries `SELECT FROM resources WHERE kind='Query' AND created_at + ttl < NOW()` and deletes expired queries. This is more efficient than the current approach where every reconcile checks TTL.

### 9. Cancellation via spec.cancel check

**Choice:** Workers check `spec.cancel` on the Query resource periodically during execution rather than relying on a separate watcher.

**Implementation:** Between major execution steps (after resolving target, before/after LLM call), the worker re-reads the Query from PostgreSQL and checks `spec.cancel`. If true, it cancels the execution context and returns. River's built-in cancellation propagates through the context.

## Risks / Trade-offs

**[Risk] River schema migration** → River requires its own tables (`river_job`, `river_leader`, etc.). These must be created during `initSchema()`. River provides migration helpers. Low risk since it's additive.

**[Risk] Direct PG status writes bypass optimistic concurrency** → Workers write status without checking `resource_version` from the API server's perspective. Mitigated by: only one worker processes a query at a time (exclusive lock), and workers read-then-write with their own `resource_version` check.

**[Risk] `database/sql` vs `pgx` pool** → The current PostgreSQL backend uses `database/sql` with `lib/pq`. River requires `pgx`. This means either migrating the backend to `pgx` or maintaining two connection pools. Recommendation: use a separate `pgx` pool for River, migrate the backend later.

**[Risk] Execution function coupling** → Exporting `executeQueryAsync` ties the worker to the controller package. If the function's dependencies change, the worker must adapt. Mitigated by: the worker constructs a `QueryReconciler` value directly, so it automatically picks up dependency changes.

**[Trade-off] Two connection pools** → Short-term cost of maintaining `database/sql` (existing backend) and `pgxpool` (River). Acceptable as a transitional state.

**[Trade-off] Query reconciler still exists** → The reconciler code remains for etcd mode. Two code paths for query execution until etcd mode is deprecated or also migrated.
