## Context

See `proposal.md` — Why. Relevant current state and constraints:

- Ark dispatches a `Query` to an executor; the default `completions` executor runs as a
  pod, and custom executors plug in via the `ExecutionEngine` CRD (an A2A address). Agent
  isolation today is Kubernetes namespaces/RBAC plus a prompt-level untrusted-tool-output
  boundary — there is no compute sandbox.
- Agent Substrate provides the runtime primitives this change depends on: `ActorTemplate`,
  `Actor` (create/suspend/resume), `EgressPolicy`, a `WorkerPool`, an ingress router
  (`atenet-router`), a default-deny egress gateway with out-of-band credential injection
  (`atenet-egress`), snapshotting, and a PID-1 **runner contract** (`/healthz`, `/readyz`,
  prepare workspace, run, SIGTERM, optional guest services). Substrate is pre-1.0.
- Google's AX is a working reference for "run agents on Substrate," but it bakes the agent
  framework and model into the runner image because it has no declarative agent model.

Requirements are in `specs/` (`substrate-execution-engine`, `substrate-agent-runner`,
`substrate-egress-credentials`).

## Goals / Non-Goals

**Goals:**
- Run tool/code-using agents inside Substrate sandboxes behind the existing
  `ExecutionEngine`/A2A seam, opt-in per agent.
- Make the in-sandbox runner **config-driven** from the `Agent`/`Model`/`Tool` CRDs, not
  framework-per-image.
- Derive least-privilege egress from the spec and keep credentials out of the sandbox.

**Non-Goals:**
- Changing Ark's declarative framework, team orchestration, or provider-agnostic model
  abstraction (reused as-is).
- Routing stateless completions through a sandbox.
- Reimplementing agent frameworks (adapters wrap existing ones) or building Substrate
  itself (it is a dependency).

## Decisions

- **D1 — Integrate at the `ExecutionEngine`/A2A seam, via a Substrate-backed A2A executor.**
  Reuses Ark's existing pluggability, keeps adoption opt-in per agent, and confines all
  Substrate/`ateapi` coupling to one service. *Alternatives:* teach the Ark controller to
  call `ateapi` directly (more invasive, couples the core controller to Substrate —
  rejected for v1); run AX unmodified behind A2A (used only as a Phase-0 proof, since AX is
  not config-driven).

- **D2 — One generic, config-driven runner, not framework-per-image.** The runner reads the
  agent spec and selects a framework adapter at runtime; the same image serves many agents.
  This uses Ark's declarative strength to fix AX's biggest limitation. *Alternative:*
  AX-style one-image-per-framework (simpler to bootstrap, but reintroduces AX's rigidity);
  fall back to it only for a framework that cannot be embedded as an adapter.

- **D3 — The completions adapter uses a provider-agnostic model client that mirrors Ark's.**
  *Revised during Phase-1 implementation (Option C).* The original intent was to **reuse**
  Ark's provider-agnostic model client directly, but that client is **Go**
  (`ark/executors/completions/model.go` + `provider_*.go`) and the generic runner is Python;
  ark-sdk exposes **no** Python model-calling client. So the runner implements a small
  Python client (`ark_runner/model_client.py`) that mirrors the Go dispatch, keyed off the
  exact `Model` shape ark-sdk delivers (`type` = provider, `config` = `{provider: {apiKey,
  baseUrl, apiVersion, properties}}`). It covers OpenAI, Azure, and Anthropic; Bedrock is a
  typed `NotImplementedError` (SigV4) pending a follow-up. The provider set and config keys
  MUST stay in sync with ark-sdk's `_resolve_model`. *Alternatives considered and rejected
  for now:* (A) port nothing and bake a provider per image — the AX trap D2 rejects;
  (B) run the Go completions executor as a sidecar inside each actor for true reuse — heavier
  image and two processes in the sandbox, revisit if provider drift becomes a maintenance
  burden.

- **D4 — Actor lifecycle: per-`(agent, conversationId)` for stateful agents (suspend when
  idle, resume per query); ephemeral per-query for stateless.** Matches Substrate's density
  and snapshot model and reuses Ark's existing `conversationId`. *Alternatives:*
  always-ephemeral (simple, but discards Substrate's warm-resume benefit — acceptable for a
  v1 stopgap); always-one-actor-per-agent (state bleeds across conversations — rejected).

- **D5 — Egress policy derived from `modelRef` + `tools`/`mcpServers`; credentials injected
  at the egress gateway; a non-default dev allow-all.** The declarative spec yields a
  least-privilege allowlist automatically, and zero-creds-in-sandbox is Substrate's model.
  *Alternative:* env-inject credentials (simpler, weaker) — acceptable only as a Phase-1
  stopgap.

- **D6 — Keep the `completions` executor as a non-sandboxed tier.** A stateless model call
  needs no sandbox; forcing it through Substrate adds latency and ops weight for no
  isolation benefit. Agents opt into the Substrate engine; others are untouched.

- **D7 — Version-pin Substrate to the release Ark builds against**, with a pre-flight
  compatibility check, because pre-1.0 protobuf/API skew breaks interop.

## Risks / Trade-offs

- One-shot `Query` vs long-lived actor impedance → the executor owns the mapping (D4);
  start ephemeral for v1, add per-conversation reuse in a later phase.
- Substrate wakeup/readiness timing vs minutes-long agent runs → decouple liveness
  (`/healthz`) from readiness (`/readyz`), reconcile readiness in the background, and mark a
  finished one-shot agent terminal so status reflects completion.
- Agent failures that look like success → the executor maps a failed/incomplete agent run to
  a failed `Query` status (per `substrate-execution-engine`), and agent logs are exposed.
- Default-deny egress blocks agent traffic → derive the allowlist from the spec (D5) and
  provide a clearly-non-default dev allow-all; return actionable errors.
- Operational weight of running Substrate → opt-in per agent; the completions tier stays;
  document infrastructure prerequisites.
- Pre-1.0 Substrate skew → pin + pre-flight check (D7).
- Credential-injection complexity → phase it (env-inject first, egress injection later).

## Migration Plan

- **Phase 0:** run AX behind A2A as an `ExecutionEngine` to prove the seam end-to-end.
- **Phase 1:** `ark-substrate-executor` + generic `ark-runner` with the completions adapter;
  env-injected credentials; agents opt in via `spec.executionEngine: substrate`.
- **Phase 2:** config-driven adapters; egress policy derived from the spec; egress-gateway
  credential injection.
- **Phase 3:** actor reuse + suspend/resume per conversation; snapshot-backed session state;
  idle auto-suspension for density.
- **Rollback:** adoption is opt-in; removing `spec.executionEngine: substrate` returns an
  agent to the completions tier. No data migration.
- **Deprecation:** `ark-sandbox`, per-framework executor Deployments, and creds-into-pod are
  retired only after Phase 2 adoption, announced as BREAKING for deployments that relied on
  them.

## Open Questions

- The exact adapter contract for non-completions frameworks (LangChain, Claude Agent SDK).
  Deferrable — the completions adapter unblocks Phases 0–1 and does not change their specs.
- Whether snapshot-backed session state should replace or merely complement Ark `Memory`.
  A Phase-3 decision; it does not affect the Phase 1–2 specs or task breakdown.
- Mapping between Ark namespaces and Substrate atespaces (default 1:1, refine later).
