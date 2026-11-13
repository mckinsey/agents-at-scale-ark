## 1. Design record and benchmark (this PR)

- [x] 1.1 Add `services/ark-api/scripts/benchmark.sh` (full mode and `MODE=a2a`)
- [x] 1.2 Record benchmark results and decisions in `design.md`
- [x] 1.3 Correct the ark-api statement in `docs/content/reference/scalability.mdx`: it runs one replica today, and the A2A gateway keeps task state per pod

## 2. A2A executor contract (#3938)

- [x] 2.1 Enqueue a `submitted` `Task` with the user message before the first status update in `a2agw/execution.py`
- [x] 2.2 Return the answer as the `completed` status message; drop standalone `Message` events
- [x] 2.3 Test blocking and non-blocking `message/send` through `DefaultRequestHandler`
- [ ] 2.4 Merge #3938

## 3. Cancel through the Query

- [ ] 3.1 Keep the Query name per task in `a2agw/execution.py`
- [ ] 3.2 On `cancel`, patch the Query with `spec.cancel: true`, as `PATCH /v1/queries/{name}/cancel` does
- [ ] 3.3 Treat phase `canceled` as final in `wait_for_query` (`a2agw/query.py`)
- [ ] 3.4 Remove the `isinstance(..., asyncio.Task)` check in `cancel`
- [ ] 3.5 Tests: cancel patches the Query; a `canceled` Query ends the task as `canceled`; a finished task isn't cancelable

## 4. Task store lifetime and eviction

- [ ] 4.1 Create each agent's task store and executor once in `a2agw/manager.py` and reuse them in `_update_routes`; drop them when the agent is removed
- [ ] 4.2 Add an evicting wrapper around `InMemoryTaskStore`: TTL after finish (`A2A_TASK_TTL_SECONDS`, default 3600) and a per-agent cap (`A2A_TASK_MAX_FINISHED`, default 1000), pruned on save, expired treated as missing on get
- [ ] 4.3 Tests: tasks survive another agent being added; TTL expiry; cap eviction; running tasks are kept

## 5. Shared task store (Postgres)

- [ ] 5.1 Add the `a2a-sdk[postgresql]` dependency (developer runs `uv add`)
- [ ] 5.2 Select `memory` or `postgres` from env; with `postgres`, build `VersionedDatabaseTaskStore` and `DatabaseTaskEventStream` and pass both to each handler; fail at startup without a URL
- [ ] 5.3 Apply the eviction limits to the Postgres store
- [ ] 5.4 Chart values `a2a.taskStore.backend`, `a2a.taskStore.postgres.url` / `existingSecret`
- [ ] 5.5 devspace profile with 2 ark-api replicas and `charts/ark-storage-dev`
- [ ] 5.6 Tests: backend selection and the missing-URL error
- [ ] 5.7 Rerun `MODE=a2a services/ark-api/scripts/benchmark.sh` with the Postgres backend: 0 "Task not found" with 2 and 3 replicas

## 6. Chart scaling (owner to agree on #3934)

- [ ] 6.1 `replicaCount` in `values.yaml`; omit `replicas` in `templates/deployment.yaml` when `autoscaling.enabled`
- [ ] 6.2 `templates/hpa.yaml` (off by default) and `templates/pdb.yaml` (off by default)
- [ ] 6.3 Optional `topologySpreadConstraints`
- [ ] 6.4 `terminationGracePeriodSeconds`, a `preStop` sleep and uvicorn `--timeout-graceful-shutdown`
- [ ] 6.5 Review the default memory limit against the measured 425–440 MiB per pod
- [ ] 6.6 `helm template` with autoscaling off and on

## 7. Docs

- [ ] 7.1 How to scale ark-api in `scalability.mdx`: replica count, optional HPA (needs metrics-server), PDB only with 2+ replicas, Postgres for the A2A gateway
- [ ] 7.2 Note that v0.3 A2A clients get errors as `-32603` with the original message
