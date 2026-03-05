## Why

In PostgreSQL mode, query execution relies on the Kubernetes reconciler pattern: a single controller watches Query CRs, spawns goroutines tracked in a `sync.Map`, and loses all in-flight work on crash. This is fragile — queries stuck in `phase: running` after a crash have no recovery path. The `sync.Map` only prevents duplicates within a single process, provides no backpressure, and is opaque to operators. Since PostgreSQL is already the storage backend in this mode, we can use River (a Go-native PostgreSQL job queue) to get durable execution, exclusive locking, automatic retries, and configurable concurrency — all within the same process.

## What Changes

- Enqueue a River job transactionally when a Query resource is created in the PostgreSQL storage layer (same INSERT transaction)
- In-process River workers (goroutines managed by River client) dequeue and execute queries using the existing exported execution logic from the controller package
- Workers write query status directly to PostgreSQL (with `resource_version` bump to trigger LISTEN/NOTIFY for watchers)
- Disable the query reconciler when running in PostgreSQL mode
- Replace `sync.Map` duplicate prevention with River's exclusive locking (PG advisory locks via `SELECT ... FOR UPDATE SKIP LOCKED`)
- Classify execution errors as retryable (LLM timeouts, rate limits, transient network) vs permanent (invalid target, auth failure) — River retries transient errors with backoff, permanent errors set `phase: error` immediately
- Replace TTL expiry logic with a River periodic job
- Handle cancellation by having workers check `spec.cancel` during execution
- Export the query execution function from the controller package so both the reconciler (etcd mode) and River worker (PostgreSQL mode) can call it
- The etcd/reconciler code path remains unchanged

## Capabilities

### New Capabilities
- `river-job-queue`: River client setup, worker registration, job enqueue integration with PostgreSQL storage layer
- `query-worker`: River worker that dequeues query jobs, executes via shared logic, writes status directly to PostgreSQL
- `query-ttl-cleanup`: River periodic job replacing reconciler-based TTL expiry
- `error-classification`: Retryable vs permanent error classification for River retry semantics

### Modified Capabilities

## Impact

- **Code**: `ark/internal/storage/postgresql/postgresql.go` (job enqueue on Query CREATE), `ark/internal/controller/query_controller.go` (export execution function, disable in PG mode), `ark/cmd/main.go` (start River client conditionally), new `ark/internal/worker/` package
- **Dependencies**: New Go dependency on `github.com/riverqueue/river` and `github.com/riverqueue/river/riverdriver/riverpgxv5`
- **Database**: River migration tables (`river_job`, `river_leader`, etc.) added to PostgreSQL
- **APIs**: No changes to Query CRD spec/status — phases remain `pending/running/done/error/canceled`
- **Deployment**: No topology change — workers run in-process in the same binary
