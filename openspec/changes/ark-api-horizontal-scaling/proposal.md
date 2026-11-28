## Why

ark-api runs as a single pod. One pod at the default 500m CPU tops out at ~140–275 requests per second for anything that calls Kubernetes, and its chart doesn't allow more replicas. [#3934](https://github.com/mckinsey/agents-at-scale-ark/issues/3934) measured the REST side on Kind; our benchmark on minikube confirms the numbers. It also shows the A2A gateway inside ark-api is the one part that can't run on more than one replica: it keeps task state per pod, and on `main` its `message/send` doesn't work at all.

## What Changes

- **A2A gateway: `message/send` works.** The executor emits the `Task` before any status update and returns results on the task status, as a2a-sdk 1.2.2's `DefaultRequestHandlerV2` requires. Done in [#3938](https://github.com/mckinsey/agents-at-scale-ark/pull/3938).
- **A2A gateway: cancel stops the agent.** `tasks/cancel` sets the Query's `spec.cancel`, and the gateway stops waiting when the Query reaches phase `canceled`.
- **A2A gateway: task lifetime.**
  - Task stores survive agent route rebuilds; today any agent change wipes every task.
  - Finished tasks are evicted by TTL (`A2A_TASK_TTL_SECONDS`, default 3600) and a per-agent cap (`A2A_TASK_MAX_FINISHED`, default 1000).
- **A2A gateway: shared task state across replicas.** An optional Postgres backend uses a2a-sdk's cluster mode (`VersionedDatabaseTaskStore` + `DatabaseTaskEventStream`), behind `a2a.taskStore.backend: memory | postgres` (default `memory`). With it, `tasks/get`, `tasks/cancel` and `tasks/subscribe` work from any replica.
- **Chart: configurable replicas.** `replicaCount`, optional HPA, PDB, `topologySpreadConstraints` and graceful shutdown, following `ark/executors/completions/chart`. This overlaps #3934's first plan item; the owner is to be agreed on #3934.
- **Docs.** Correct `docs/content/reference/scalability.mdx`, which says ark-api scales by raising a Helm replica value that doesn't exist.
- **Benchmark.** `services/ark-api/scripts/benchmark.sh` reproduces the numbers in `design.md`.

## Capabilities

### New Capabilities
- `a2a-gateway-tasks`: A2A gateway task handling on a single replica: `message/send` returns a task, cancel stops the Query, tasks survive agent changes, finished tasks are evicted.
- `a2a-gateway-replicas`: A2A gateway task state shared across ark-api replicas through an optional Postgres backend.
- `ark-api-chart-scaling`: ark-api Helm chart settings for running more than one replica (replica count or HPA, PDB, spreading, graceful shutdown).

### Modified Capabilities

None. No existing spec covers the A2A gateway or the ark-api chart.

## Impact

- **Code:** `services/ark-api/ark-api/src/ark_api/api/v1/a2agw/` (`execution.py`, `manager.py`, `query.py`), plus a new task store wrapper and Postgres wiring.
- **Chart:** `services/ark-api/chart/` (`values.yaml`, `templates/deployment.yaml`, new `hpa.yaml` and `pdb.yaml`).
- **Dependencies:** `a2a-sdk[postgresql]` (SQLAlchemy + asyncpg), only needed for the Postgres backend.
- **Infrastructure:** a Postgres for multi-replica A2A. Ark already uses Postgres for broker messages, events and sessions and for controller storage; `charts/ark-storage-dev` covers local development.
- **Docs:** `docs/content/reference/scalability.mdx`.
- **Not in scope** (tracked in #3934): readiness probe, async Kubernetes calls, shared Kubernetes client, Query list watch cache, dashboard polling, `status.response.raw`, broker traces, dashboard replicas.
