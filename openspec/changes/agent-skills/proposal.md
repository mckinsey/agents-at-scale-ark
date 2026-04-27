## Why

Today, adding even trivial external logic to an Ark agent requires standing up a full MCPServer — write an MCP server in Python or Node, containerise it, push to a registry, author an `MCPServer` CRD, author a `Tool` CRD, attach it to the `Agent`. That's ~1 hour of scaffolding and a permanent registry dependency for what is often 20 lines of glue.

Skills (in the Claude-Code sense) compress that dramatically: a folder with a `SKILL.md` plus a couple of scripts is enough for the model to learn a new capability. We want the same property for Ark agents: a single YAML artefact that bundles prose expertise with a handful of executable scripts, attachable to an agent with a one-line reference, deployable via `kubectl apply`.

Two motivations:

1. **Developer experience.** For "small things" — CSV munging, runbook automation, in-cluster diagnostics, glue between APIs — authors should not need to build and push an image. Full MCPServers remain the right tool when logic grows large, needs persistent connections, or handles third-party auth; skills are the on-ramp below that threshold.
2. **Pluggable expertise.** A skill is a reusable unit — prose guidance plus the scripts it refers to — that can be attached to many agents, versioned independently, and eventually shared via the marketplace. That gives us a unit of "expertise" at a higher level than a single tool.

## What Changes

- **New `Skill` CRD** (`ark.mckinsey.com/v1alpha1`) that packages a short `description`, a longer `instructions` block, a `runtime` choice (from an allow-list), and an inline `scripts` map. Security posture is declared in-spec and defaults to deny-all.
- **New `Skill` controller** in the operator that reconciles each `Skill` into a `ConfigMap` (scripts, content-hashed), a `ServiceAccount`, a `NetworkPolicy`, a `Deployment` (replicas: 0 by default), a `Service`, a synthetic `MCPServer`, and one `Tool` per script. Agents use these through the existing MCP plumbing — no new tool-call path.
- **New scale-to-zero activator** in the operator: a lightweight HTTP component that fronts each skill's `Service`, scales the `Deployment` from 0 → 1 on first request, forwards once ready, and scales back to 0 after an idle window (~60 s default). Custom, not Knative.
- **Skill runtime images** published by Ark for v1: `skill-runner-python:3.12`, `skill-runner-node:20`, `skill-runner-bash`. Each image boots an MCP server that mounts the skill's `ConfigMap` at `/skill`, exposes one tool per script, and enforces the I/O contract (argv in, stdout out, non-zero exit → error).
- **`Agent.spec.skills`** — new optional field, a list of `{ name, namespace? }` references. Attached skills contribute to the agent's effective tool surface without touching `Agent.spec.tools`.
- **Lazy-load protocol.** The Ark execution engine injects a catalog (`name: description` per attached skill) into the system prompt plus a single built-in `load_skill(name)` meta-tool. Full `instructions` land in context only when the model invokes `load_skill`. Script tools (one per script) are always exposed but named `<skill>.<script>` so their affordance is clear to the model.

## Capabilities

### New Capabilities

- `agent-skills`: lifecycle for `Skill` CRDs, reconciliation to per-skill runner infra, scale-to-zero activation, lazy-load in the execution engine, and the sandboxed runtime contract for script execution.

### Modified Capabilities

- None — `Agent.spec.skills` is additive and has no interaction with existing agent fields. Existing MCP / Tool plumbing is reused unchanged.

## Impact

- `ark/api/v1alpha1/skill_types.go` — new `Skill` type and generated deepcopy.
- `ark/api/v1alpha1/agent_types.go` — adds `Skills []AgentSkillRef` to `AgentSpec`.
- `ark/config/crd/bases/…_skills.yaml` — generated CRD manifest.
- `ark/internal/controller/skill_controller.go` — reconciler.
- `ark/internal/skillactivator/…` — new subsystem (~300 lines).
- `ark/images/skill-runner-{python,node,bash}/` — new Dockerfiles + minimal MCP server.
- `ark/dist/chart/templates/crd/…_skills.yaml` — Helm sync.
- `ark/internal/executors/completions/…` — injects catalog, registers `load_skill` built-in tool.
- `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/…` — regenerate types; `ExecutorApp` learns the same catalog + `load_skill` path so external executors benefit too.
- `services/ark-api/…` + `services/ark-dashboard/…` — Skill CRUD endpoints and UI land in a follow-up PR; not in v1 scope.
- `docs/` — new user-guide page under "developer guide".
- `samples/skills/` — one or two illustrative skills.

v1 deliberately scopes out: dashboard UI, marketplace publishing, runtime images beyond python/node/bash, custom runtime images, and cross-namespace skill references. All are compatible with the shape proposed here.
