## Context

ark-api is a FastAPI service over the Kubernetes API. It serves the REST API that the dashboard and CLI use (`/v1/...`) and an A2A gateway (`/a2a/agent/{name}`), mounted in `main.py`, that lets external A2A clients call Ark agents.

Current state:
- **Chart:** `services/ark-api/chart/templates/deployment.yaml` hardcodes `replicas: 1`, with no HPA, PDB or spreading. `docs/content/reference/scalability.mdx` says ark-api scales by raising the replica count in the Helm values, which the chart doesn't allow.
- **Process:** one uvicorn process per pod (`Dockerfile`), so one pod uses at most one CPU core. Default resources are 250m / 256Mi requests and 500m / 512Mi limits.
- **REST endpoints:** they hold no per-pod state that matters. MCP OAuth flow state is in Secrets; the marketplace cache and impersonation client pool are per-pod caches.
- **A2A gateway:**
  - `manager.py` builds one `DefaultRequestHandler` with an `InMemoryTaskStore` per agent.
  - In a2a-sdk 1.2.2 that name is `DefaultRequestHandlerV2`.
  - Each request creates a Query (`a2agw/query.py`) and polls it once a second until `done` or `error`.
- **Traffic paths:**
  - The dashboard proxies to the `ark-api` Service; kube-proxy picks a pod per connection.
  - localhost-gateway (nginx-gateway-fabric) sends requests straight to pod IPs.
  - `kubectl port-forward` always pins to one pod.

Related: [#3934](https://github.com/mckinsey/agents-at-scale-ark/issues/3934) covers the REST side, including the per-request TCP+TLS cost to the API server (profiled), the readiness probe calling Kubernetes, blocking calls in async routes, `GET /v1/queries` memory, and dashboard polling.

### Evidence

Benchmark: `services/ark-api/scripts/benchmark.sh`, run 2026-11-12 on minikube (one node, 8 CPUs, Kubernetes v1.37), production image, chart resources, load from `ab` in a pod in the cluster, one connection per request. The node runs everything (ark-api, API server, etcd, load), so the ratios matter more than the absolute numbers.

Requests per second at concurrency 10:

| Endpoint | 1 pod, 500m | 1 pod, 1 CPU | 2 pods, 500m | 3 pods, 500m |
|---|---|---|---|---|
| `GET /health` | 1113 | 2274 | 2225 | 2990 |
| `GET /v1/agents` | 144 | 311 | 284 | 317 |
| `GET /v1/agents/{name}` | 180 | 406 | 373 | 383 |
| `POST /v1/queries` (409 path) | 157 | 288 | 278 | 248 |

- One pod at 500m is CPU-bound (0.50 cores in every run). `GET /v1/agents` p50 goes from 4 ms at concurrency 1 to ~700 ms at 100.
- A second pod or a full CPU each doubles throughput. A third pod didn't help Kubernetes-backed endpoints on this node: the pods stopped using their full CPU, so the API server became the limit.
- CPU per Kubernetes-backed request is 2.3–4 ms vs 0.45 ms for `/health`. #3934 profiled this to a new TCP+TLS connection per request (3.79 → ~1.0 ms with a shared client).
- Memory: 425–440 MiB per pod against 512Mi (cgroup `memory.current`, includes page cache). 100 open SSE streams added ~67 MiB.
- #3934 (Kind): ~180–200 req/s at 500m, ~2.5 ms per request, ~450 req/s at 2 CPUs; 3 replicas brought p50 at 300 polling chats from 1.9 s to 17 ms.

A2A gateway (`MODE=a2a`, image built from #3938):

| Replicas | `tasks/get` found (2 runs × 20) | "Task not found" | `tasks/cancel` |
|---|---|---|---|
| 1 | 40 / 40 | 0 | "Task cannot be canceled" (already finished) |
| 2 | 22 / 40 | 18 (45%) | "Task not found" |
| 3 | 11 / 40 | 29 (73%) | "Task not found" |

Before #3938, every `message/send` failed with "Agent should enqueue Task before TaskStatusUpdateEvent event", so this test couldn't run.

## Goals / Non-Goals

**Goals:**
- The A2A gateway works on one replica: `message/send`, cancel and task lifetime behave as A2A clients expect.
- The A2A gateway works on several replicas: any replica can answer `tasks/get`, `tasks/cancel` and `tasks/subscribe` for any task.
- The chart can run ark-api with more than one replica, with an optional HPA.
- The docs describe what the chart actually supports.

**Non-Goals:**
- REST-side performance work from #3934: readiness probe, async Kubernetes calls, shared Kubernetes client, Query list watch cache, dashboard polling, moving `status.response.raw`.
- Broker scaling: traces stay in memory per broker replica.
- Dashboard replicas.
- uvicorn `--workers`. The FastAPI docs recommend one process per container on Kubernetes, scaled with pods.

## Decisions

### 1. Fix the A2A executor contract first

`ARKAgentExecutor` sent WORKING before any `Task` and returned the answer as a `Message`. `DefaultRequestHandlerV2` rejects both (`active_task.py:290-299`, `:240-244`).

The executor now enqueues a SUBMITTED `Task` with the user message, then status updates, with the answer on the COMPLETED status. Timeout and error text already went on the FAILED status, so the duplicate `Message` events are dropped.

Alternatives:
- **Switch to `LegacyRequestHandler`.** It keeps the old event rules but gives up V2's cluster mode, which decision 4 relies on.
- **Return the answer as an artifact** (`TaskArtifactUpdateEvent`). This is valid A2A, but clients that read the status message would change. It can be added later.

### 2. Cancel through the Query resource

The running work is a Query executed by the controller, not code in ark-api. Today `cancel` only cancels a coroutine if `isinstance(coroutine, asyncio.Task)`, which is never true (`execution.py:225`), and the Query keeps running.

Cancel will patch `spec.cancel: true`, the same patch as `PATCH /v1/queries/{name}/cancel`. The controller stops the run and sets phase `canceled` (`query_controller.go:301-309`). `wait_for_query` treats `canceled` as final. The Query name is kept per task, so any replica can cancel once task state is shared.

Alternative: cancel only the local coroutine. That stops ark-api waiting but not the agent and its LLM calls, and doesn't work across replicas.

### 3. One task store per agent, kept across rebuilds, with eviction

`_update_routes` rebuilds every handler, and with it every `InMemoryTaskStore`, whenever any agent changes. `InMemoryTaskStore` also never removes tasks.

Stores and executors will be created once per agent and reused across rebuilds. Finished tasks (`completed`, `failed`, `canceled`, `rejected`) are evicted when either limit is reached:
- a TTL after finish: `A2A_TASK_TTL_SECONDS`, default 3600;
- a per-agent cap: `A2A_TASK_MAX_FINISHED`, default 1000, oldest first.

Pruning happens on save, and an expired task counts as missing on get. Running tasks are never evicted.

Alternatives considered for eviction:
- **Global cap:** one agent can evict another agent's results.
- **Size cap:** needs size tracking per task.
- **Idle TTL:** polling keeps tasks alive forever.
- **Background sweep:** only needed if memory must shrink while idle.
- **Explicit delete:** A2A has no delete-task method.

### 4. Shared task state through a2a-sdk's Postgres cluster mode

a2a-sdk 1.2.2 supports multiple replicas when the handler gets a `VersionedTaskStore` and a `TaskEventStream` (`a2a/server/cluster/`):
- A cancel on a replica that doesn't run the task writes `CANCELED` with a version bump, and the owner aborts on its next save.
- The event stream lets `tasks/subscribe` work from any replica.

The SDK ships Postgres versions of both, `VersionedDatabaseTaskStore` and `DatabaseTaskEventStream`, with the `a2a-sdk[postgresql]` extra. The backend is selected by `a2a.taskStore.backend: memory | postgres` (default `memory`), so single-replica installs need nothing new.

Alternatives:
- **Redis:** the completions executor uses it (Go, trpc-a2a-go), but the Python SDK has no Redis store. We'd have to write a versioned store and a pub/sub event stream, and own their concurrency behaviour.
- **Kubernetes-backed store:** state on the Query or a ConfigMap. Every task update becomes an API-server write, and the API server is the shared limit in both benchmarks. Annotations also cap at 256KiB.
- **Sticky routing at the gateway** (`ip_hash`/`hash`): fragile behind NAT, and tasks are lost when their pod goes away.

### 5. Chart follows the completions executor

`ark/executors/completions/chart` already has the pattern:
- `replicaCount`, with `replicas` omitted when `autoscaling.enabled`, as the Kubernetes HPA docs recommend;
- `autoscaling` off by default;
- `podDisruptionBudget` off by default;
- `terminationGracePeriodSeconds` plus a `preStop` sleep.

ark-api adds `topologySpreadConstraints`, uvicorn `--timeout-graceful-shutdown` (long SSE streams would otherwise run until SIGKILL), and a higher memory limit, as #3934 suggests.

The HPA stays optional and off. One pod serves hundreds of Kubernetes-backed requests per second, the heavy work (LLM calls, tools) runs in the controller and executors, and a fixed replica count needs no metrics-server.

Alternative: HPA on by default. That needs metrics-server, which managed clusters don't always install.

## Risks / Trade-offs

- [More replicas don't add API-server capacity. All pods share one ServiceAccount, which falls under the `service-accounts` FlowSchema (`workload-low`)] → Pair scaling with #3934's shared Kubernetes client, which cuts CPU and connections per request.
- [Postgres becomes a dependency for multi-replica A2A] → It's opt-in; `memory` stays the default. Ark already supports Postgres for the broker and controller, and `charts/ark-storage-dev` covers dev.
- [A remote cancel only takes effect on the owner's next save, which comes when the Query finishes] → Cancel also patches the Query's `spec.cancel`, so the agent stops right away. The owner then sees `canceled` and finishes the task.
- [The v0.3 compatibility layer reports A2A errors as `-32603` with the original message, not `-32001`/`-32002`] → SDK behaviour (`a2a/compat/v0_3/jsonrpc_adapter.py:85-103`). Document it for v0.3 clients; don't work around it in Ark.
- [Eviction makes `tasks/get` fail for old tasks] → Same error as an unknown task, with documented limits that can be tuned.
- [A PDB with one replica blocks node drains] → Off by default; the docs say to enable it only with 2+ replicas.
- [The benchmark ran on a single-node cluster without auth or keep-alive] → Use the ratios for decisions, and re-measure on a real cluster before sizing.

## Migration Plan

1. #3938: executor contract fix.
2. Cancel through the Query (`fix`).
3. Task store per agent and eviction (`fix`).
4. Postgres backend and chart settings (`feat`). The chart settings may come from #3934's chart item instead.
5. Docs: correct `scalability.mdx` now; add the how-to-scale section with step 4.

Each step is backwards compatible. The defaults (`memory` backend, 1 replica, HPA off) keep today's behaviour. Rollback is a chart or image downgrade. The Postgres tables are created by the SDK and can be dropped.

## Open Questions

- Who takes #3934's chart item: the #3934 author or this change? It decides where `replicaCount`, the PDB and the HPA land.
- Default `replicaCount`: 1 (today) or 2 (#3934's proposal)?
- Should the gateway's once-a-second Query polling move to broker completion events, as #3934 plans? It changes the code that decision 2 touches.
- Do the eviction defaults (1h, 1000 per agent) fit external A2A clients' polling windows?
