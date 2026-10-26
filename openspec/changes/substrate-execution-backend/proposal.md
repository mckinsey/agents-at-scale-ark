## Why

Ark has no compute sandbox of its own: agents that run code or call tools execute as
ordinary pods, isolated only by Kubernetes namespaces/RBAC plus a prompt-level
untrusted-tool-output boundary. That is not a strong enough boundary for untrusted,
tool-using agent code, and Ark separately reinvents runtime concerns (the `ark-sandbox`
marketplace service, per-framework executor Deployments, delivering credentials into
agent pods, and scaling those Deployments). Agent Substrate already provides VM-grade
sandboxing (gVisor/microVM), actor-to-worker multiplexing, snapshot-based suspend/resume,
and zero-trust networking with out-of-band credential injection. Integrating Substrate as
an execution backend gives Ark secure, dense, stateful agent execution while keeping its
declarative framework and product layer — and consolidates the runtime instead of
maintaining a bespoke one. Google's AX is a working reference for "run agents on
Substrate"; this change brings that pattern under Ark's richer, config-driven front end.

## What Changes

- Add **`ark-substrate-executor`** — an A2A server registered as an Ark `ExecutionEngine`
  that bridges a `Query` to Substrate actor lifecycle: resolve the `Agent`/`Model`/`Tool`
  specs, ensure an `ActorTemplate` and `EgressPolicy`, create or resume an actor, run the
  agent in the sandbox, and stream results back over A2A. Reuses the existing
  `ExecutionEngine`/A2A seam, so it is opt-in per agent (`spec.executionEngine: substrate`)
  with no new agent-facing API.
- Add **`ark-runner`** — a generic, config-driven PID-1 runner image that honors
  Substrate's runner contract (`/healthz`, `/readyz`, prepare workspace, run, SIGTERM,
  guest services) and reads the `Agent`/`Model`/`Tool` spec at runtime to run a framework
  adapter (default: `completions`, reusing Ark's provider-agnostic model client). The CRD
  drives the runner, rather than baking a framework per image as AX does.
- Derive each actor's **`EgressPolicy`** from the agent's `modelRef` + `tools`/`mcpServers`
  (default-deny otherwise), and inject model/tool credentials via Substrate's egress
  credential injection (zero-creds-in-sandbox) instead of mounting secrets into pods.
- Map the lifecycle impedance: one actor per `(agent, conversationId)` with
  suspend/resume for stateful agents; ephemeral actor-per-query for stateless agents.
- Keep the existing `completions` executor as a lightweight, **non-sandboxed tier** for
  stateless model calls — do not force plain completions through a sandbox.
- Retire/absorb (phased, after the Substrate path is proven): the `ark-sandbox`
  marketplace service, per-framework executor Deployments, and creds-into-pod delivery.
  **BREAKING** only at the final phase for deployments that depended on those.

Rollout is phased so nothing is a big-bang: (0) wrap AX behind A2A as an `ExecutionEngine`
to prove the seam; (1) `ark-substrate-executor` + generic `ark-runner` with the
completions adapter; (2) config-driven adapters + egress-derived policy + credential
injection; (3) actor reuse/suspend-resume + snapshot-backed session state.

## Capabilities

### New Capabilities
- `substrate-execution-engine`: An `ExecutionEngine` whose backend is Agent Substrate — an
  A2A executor that maps Ark `Query` dispatch onto Substrate actor lifecycle (template,
  egress policy, create/resume, stream, suspend), including the stateful-vs-stateless actor
  lifecycle mapping.
- `substrate-agent-runner`: A generic PID-1 runner that satisfies Substrate's runner
  contract and executes an agent from its `Agent`/`Model`/`Tool` spec via a selectable
  framework adapter (completions by default), reusing Ark's model client.
- `substrate-egress-credentials`: Per-actor egress allowlists derived from the agent's
  model and tool/MCP destinations, with model/tool credentials injected at the Substrate
  egress gateway rather than inside the sandbox.

### Modified Capabilities
<!-- None: this adds a new engine behind the existing ExecutionEngine/A2A seam and is
     opt-in per agent. The completions executor's behavior is unchanged. -->

## Impact

- **New components**: `ark-substrate-executor` service; `ark-runner` image (+ framework
  adapters).
- **New dependency**: Agent Substrate running in-cluster (ateapi control plane, a
  WorkerPool, egress gateway, atenet-router), version-pinned to the release Ark builds
  against (pre-1.0 — protobuf/API skew is a real risk).
- **Reused unchanged**: the controller, all CRDs, the `ExecutionEngine`/A2A seam,
  `ark-broker` (streaming/traces/sessions), `ark-api`/dashboard, and the provider-agnostic
  model client.
- **Retired (phased)**: `ark-sandbox`; per-framework executor Deployments become actor
  images; secret-into-pod delivery moves to egress injection.
- **Operational**: substantially more infrastructure to run and secure (Substrate), plus
  default-deny egress configuration per agent.
- **Risks**: one-shot `Query` vs long-lived actor impedance; Substrate wakeup-probe and
  readiness timing; default-deny egress + credential wiring; pre-1.0 version skew.
