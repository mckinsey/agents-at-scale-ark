# ark-substrate-executor

Ark `ExecutionEngine` backed by [Agent Substrate](https://github.com/agent-substrate/substrate):
runs agents as sandboxed actors instead of in-cluster pods.

**Status: Phase 1, code-complete, not yet run against a live Substrate** (OpenSpec change
`substrate-execution-backend`). An idiomatic `ark-sdk` executor (`BaseExecutor` + `ExecutorApp`)
whose `execute_agent` drives the Substrate actor lifecycle via the real `ateapi` gRPC client.

## What it does

An agent with `spec.executionEngine: substrate` has its queries dispatched here. For each query
the executor:

1. Derives the actor's egress allowlist from the model endpoint + `mcpServers` (default-deny
   otherwise) and applies it.
2. Ensures an `ActorTemplate` carrying the `ark-runner` image + the agent spec as env, then
   creates/resumes the actor.
3. Collects the agent's result from actor logs (the Phase-1 result channel), streams it, and
   returns it as Ark `Message`s — surfacing failures rather than reporting silent success.

Reuses one actor per `(agent, conversationId)` for stateful agents.

## Routing (which executor runs an agent)

Ark dispatches by the target agent's `spec.executionEngine` (unchanged mechanism):

- **unset** → the default **`completions` executor** — the non-sandboxed tier, kept as-is.
  Correct for stateless model calls where a sandbox adds latency/ops weight for no isolation
  benefit.
- **`substrate`** → this executor — the sandboxed-actor tier. Agents opt in explicitly;
  all other agents are untouched.

There is no global switch: sandboxing is per-agent opt-in, so the two tiers coexist.

## Layout

- `src/ark_substrate_executor/executor.py` — `SubstrateExecutor(BaseExecutor)`: egress
  derivation, actor orchestration, result collection, failure surfacing.
- `src/ark_substrate_executor/ateapi_client.py` — real Substrate `Control` gRPC client
  (ensure template, create/resume/suspend/delete actor, create egress policy).
- `src/ark_substrate_executor/ateapi_gen/` — generated protobuf/gRPC stubs (regen with
  `scripts/gen_ateapi.sh`).
- `src/ark_substrate_executor/substrate_client.py` — backend wrapper: prefers ateapi, falls
  back to `kubectl ate` (which cannot create templates, so they must pre-exist).
- `src/ark_substrate_executor/__main__.py` — `ExecutorApp(...).run()`
- `deploy/substrate-executor.yaml` — Deployment + Service + `ExecutionEngine`

## Config (env)

| Var | Meaning | Default |
| --- | --- | --- |
| `ARK_SUBSTRATE_ATEAPI_ADDR` | ateapi gRPC address; unset → `kubectl ate` fallback | unset |
| `ARK_SUBSTRATE_ATESPACE` | atespace actors run in | `default` |
| `ARK_SUBSTRATE_SNAPSHOT_URI` | object-store base for actor snapshots (template requires it) | "" |
| `ARK_SUBSTRATE_SANDBOX_CLASS` | `gvisor` or `microvm` | `gvisor` |
| `ARK_SUBSTRATE_SANDBOX_CONFIG` | cluster SandboxConfig object name | `default` |
| `ARK_RUNNER_IMAGE` | ark-runner image (digest-pinned in prod) | `ark-runner:latest` |
| `ARK_RUNNER_TEMPLATE` | ActorTemplate name | `ark-runner` |
| `AX_ALLOW_ALL_EGRESS` | local-dev allow-all egress (off by default) | off |
| `ARK_SUBSTRATE_RESULT_TIMEOUT_SECONDS` | how long to wait for the runner result | `300` |

## Remaining before it works end-to-end

- Running against a live Substrate cluster (currently on `kind-kind`) — tasks 1.x, 2.10, 3.6.
- Tool/MCP invocation loop + streaming intermediate output to `ark-broker` (task 2.8).
- Credential injection at the egress gateway, zero-creds-in-sandbox (task 3.4; env stopgap today).
- Stateful suspend/resume density + snapshot-backed memory (Phase 3).
