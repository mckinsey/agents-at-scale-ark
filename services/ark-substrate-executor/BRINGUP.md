# Substrate execution backend — bring-up & guide

How to run Ark agents as sandboxed Agent Substrate actors, and the contracts behind it.
Covers OpenSpec tasks 1.1–1.3, 2.10, 3.6, 4.4 (the e2e steps that need a live cluster).

## Architecture

```
Ark controller ──A2A──▶ ark-substrate-executor        │  ark-runner (PID-1, in the actor)
                        (ExecutionEngine, cluster-side) │  completions adapter + model + MCP
                        ateapi: template/actor/egress   │  __ARK_EVENT__ / __ARK_RESULT__ (logs)
```

- **Executor** (`ark-substrate-executor`) — an `ark-sdk` `BaseExecutor` registered as an
  `ExecutionEngine`. Per query it derives egress, ensures the `ActorTemplate` (ark-runner image +
  the agent spec as env), creates/resumes an actor, collects the result, and surfaces failures.
- **Runner** (`ark-runner`) — the config-driven PID-1 inside the actor. Honors the Substrate
  runner contract (`/healthz`, `/readyz` on :80, stay up until SIGTERM), selects a framework
  adapter from `ARK_FRAMEWORK` (default `completions`), calls the model via a provider-agnostic
  client, runs MCP tools, and returns the result.

## Contracts

- **Executor result channel (Phase 1):** the runner prints one `__ARK_RESULT__ <json>` line and
  streams `__ARK_EVENT__ <text>` lines; the executor reads them from actor logs, relays events to
  `ark-broker`, and sets the query result. A missing result within
  `ARK_SUBSTRATE_RESULT_TIMEOUT_SECONDS` is a failure, never a silent success.
- **Runner env contract** (executor → runner): `ARK_AGENT_REQUEST` (serialized
  `ExecutionEngineRequest`), `ARK_FRAMEWORK`, `ARK_RESULT_PATH`.
- **Egress** is derived from the agent spec: the model endpoint host (https) plus each
  `mcpServers` host (scheme-aware); everything else is denied. `AX_ALLOW_ALL_EGRESS=true` is a
  local-dev override only.
- **Lifecycle:** one actor per `(agent, conversationId)` — suspended after each turn and resumed
  on the next (warm); a stateless agent (no `conversationId`) gets an ephemeral actor, deleted
  after the turn.

## Prerequisites (task 1.1 — stand up Substrate)

Substrate is kind-only. In its repo:

```bash
hack/create-kind-cluster.sh
hack/install-ate-kind.sh          # control plane + a WorkerPool + egress gateway
kubectl ate list atespaces        # sanity check
```

Note the ateapi service address, the snapshot object-store URI, and the cluster `SandboxConfig`
name — the executor needs them.

## Build & deploy the executor + runner (tasks 1.2, 2.10)

```bash
# Build images into the kind cluster (adjust to your registry/loader).
docker build -t ark-runner:latest            -f services/ark-runner/Dockerfile .
docker build -t ark-substrate-executor:latest services/ark-substrate-executor
kind load docker-image ark-runner:latest ark-substrate-executor:latest

# Point the executor at ateapi (edit deploy/substrate-executor.yaml env, or patch):
#   ARK_SUBSTRATE_ATEAPI_ADDR, ARK_SUBSTRATE_SNAPSHOT_URI, ARK_SUBSTRATE_SANDBOX_CONFIG
kubectl create namespace ark-system --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f services/ark-substrate-executor/deploy/substrate-executor.yaml
```

On startup the executor runs a **preflight** (ateapi `ListAtespaces`) and fails fast on an
unreachable or version-incompatible Substrate (stubs are pinned — see `SUBSTRATE_VERSION`).

### ateapi auth (the `api` service is TLS on :443)

The Substrate control API uses TLS + a per-RPC bearer token (SPIFFE-style), so the executor
needs a CA bundle and a token mounted into its pod (mirrors AX's `internal/substrate/client.go`):

- `ARK_SUBSTRATE_ATEAPI_ADDR=api.ate-system.svc.cluster.local:443`
- `SUBSTRATE_CA_FILE` — CA bundle (auto-detected at `/run/servicedns-ca/trust-bundle.pem` or
  `/run/servicedns-ca/ca.pem` if present)
- `SUBSTRATE_TOKEN_FILE` — bearer token (auto-detected at `/var/run/secrets/ateapi/token`)
- `SUBSTRATE_AUTHORITY` — TLS server name (defaults to `api.ate-system.svc` for the ate service)
- `ARK_SUBSTRATE_PLAINTEXT=true` — only for an insecure/local endpoint

Provision the CA + token to the executor pod the same way AX's controller receives them
(cert-manager / the ateapi token projection). Without them, preflight fails with an auth error.

## Run an agent end-to-end (task 1.3)

```bash
export OPENAI_GATEWAY_TOKEN="<jwt>"
envsubst < services/ark-substrate-executor/samples/model.yaml | kubectl apply -f -
kubectl apply -f services/ark-substrate-executor/samples/agent.yaml   # executionEngine: substrate
kubectl apply -f services/ark-substrate-executor/samples/query.yaml

kubectl get query substrate-demo -o jsonpath='{.status.phase}'        # -> done
kubectl ate logs actors substrate-agent -a default                    # agent output in the actor
```

## Verify egress + lifecycle (tasks 3.6, 4.4)

- **Egress (3.6):** set `AX_ALLOW_ALL_EGRESS=false`. A query to the declared model/MCP host
  succeeds; add a tool/step reaching an undeclared host and confirm it is denied.
- **Lifecycle (4.4):** send a query with a `conversationId`, confirm the actor is suspended
  after the turn; send a follow-up with the same `conversationId` and confirm it resumes the
  warm actor (`resumed=true`) rather than creating a new one. A query with no `conversationId`
  leaves no actor behind.

## Opt-in guide

Add `spec.executionEngine: { name: substrate }` to any `Agent`. Its queries run sandboxed;
every other agent is untouched and keeps using the default (non-sandboxed) completions executor.
Remove the field to opt back out. There is no global switch — sandboxing is per-agent.

## Troubleshooting

- Query stuck `running` then failing: check `kubectl logs deploy/ark-substrate-executor -n
  ark-system` and `kubectl ate logs actors <name>`; a missing `__ARK_RESULT__` line means the
  runner errored (see its traceback in the actor logs).
- Preflight failure on boot: ateapi unreachable or a Substrate version skew — regenerate stubs
  with `scripts/gen_ateapi.sh` against the deployed version.
