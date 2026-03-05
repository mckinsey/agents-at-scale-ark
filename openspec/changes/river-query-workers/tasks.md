## 1. Dependencies and River Setup

- [ ] 1.1 Add `github.com/riverqueue/river`, `github.com/riverqueue/river/riverdriver/riverpgxv5`, and `github.com/jackc/pgx/v5` to `ark/go.mod`
- [ ] 1.2 Create `ark/internal/worker/client.go` — River client initialization: create `pgxpool.Pool` from PostgreSQL config, run River migrations, configure worker count from `ARK_QUERY_WORKERS` env var (default 10), return a `river.Client` and a manager-compatible runnable
- [ ] 1.3 Wire River client startup in `ark/cmd/main.go` — in `setupEmbeddedApiserver()`, create the River client and add it to the manager via `mgr.Add()`; pass shared dependencies (client.Client, Scheme, telemetry, eventing providers)

## 2. Export Execution Logic

- [ ] 2.1 Export the query execution function in `ark/internal/controller/query_controller.go` — rename `executeQueryAsync` to `ExecuteQueryAsync` (or extract an exported wrapper) so the worker package can call it
- [ ] 2.2 Verify the exported function works with a `QueryReconciler` value constructed outside the controller manager (no `SetupWithManager` call needed)

## 3. Transactional Job Enqueue

- [ ] 3.1 Modify `ark/internal/storage/postgresql/postgresql.go` — refactor `Create()` to use a transaction; when `kind == "Query"`, enqueue a `query_execute` River job with `{namespace, name}` args and a unique constraint on (namespace, name) within the same transaction
- [ ] 3.2 Pass the River client (or a job insert interface) to `PostgreSQLBackend` so it can enqueue jobs — update `New()` constructor and `apiserver/server.go` wiring

## 4. Query Worker Implementation

- [ ] 4.1 Create `ark/internal/worker/query_execute.go` — define `QueryExecuteArgs` struct (namespace, name) and `QueryExecuteWorker` implementing `river.Worker[QueryExecuteArgs]`
- [ ] 4.2 Implement the `Work()` method: read Query from `resources` table, set status to `running`, construct `QueryReconciler` value, call exported execution function, write final status (done/error/canceled) directly to PostgreSQL with `resource_version` bump
- [ ] 4.3 Add cancellation checking — between major execution steps, re-read the Query from PostgreSQL and check `spec.cancel`; if true, cancel context and write `phase: canceled`

## 5. Error Classification

- [ ] 5.1 Create `ark/internal/worker/errors.go` — implement `IsRetryable(error) bool` that checks for transient patterns: context deadline exceeded, HTTP 429/502/503, connection refused, memory service unavailable
- [ ] 5.2 Wire error classification in `QueryExecuteWorker.Work()` — return error for retryable failures (River retries), return `river.JobCancel` for permanent failures (target not found, auth failure, validation error)
- [ ] 5.3 Set `MaxAttempts: 5` on the `query_execute` job type; on final attempt failure, write `phase: error` to the Query status

## 6. TTL Cleanup

- [ ] 6.1 Create `ark/internal/worker/query_cleanup.go` — implement a River periodic job that runs every 10 minutes, queries for expired queries (`created_at + ttl < NOW()` and `phase != 'running'`), and deletes them from the `resources` table
- [ ] 6.2 Register the periodic job in the River client setup

## 7. Disable Query Reconciler in PG Mode

- [ ] 7.1 Modify `setupControllers()` in `ark/cmd/main.go` — skip `QueryReconciler` registration when `ARK_STORAGE_BACKEND` is not "" or "etcd"

## 8. Testing

- [ ] 8.1 Unit test `IsRetryable()` with transient and permanent error cases
- [ ] 8.2 Unit test `QueryExecuteWorker.Work()` with mocked PostgreSQL backend and execution function — verify status transitions, retry behavior, and cancellation
- [ ] 8.3 Integration test: verify transactional enqueue — Query CREATE results in both a resource row and a River job row
- [ ] 8.4 Integration test: verify end-to-end flow — Query CREATE → job dequeue → execution → status update with correct phase and response
