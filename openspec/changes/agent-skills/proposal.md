## Why

Today, adding even trivial external logic to an Ark agent requires standing up a full MCPServer — write an MCP server in Python or Node, containerise it, push to a registry, author an `MCPServer` CRD, author a `Tool` CRD, attach it to the `Agent`. That's ~1 hour of scaffolding and a permanent registry dependency for what is often 20 lines of glue.

Skills (in the Claude-Code sense) compress that dramatically: a folder with a `SKILL.md` plus a couple of scripts is enough for the model to learn a new capability. We want the same property for Ark agents — and importantly, we want to be **drop-in compatible with the on-disk shape Claude Code already uses** so that any skill authored for Claude Code (or shared in the wider community) can be imported into an Ark cluster with one command.

Two motivations:

1. **Developer experience.** For "small things" — CSV munging, runbook automation, in-cluster diagnostics, glue between APIs — authors should not need to build and push an image. Full MCPServers remain the right tool when logic grows large, needs persistent connections, or handles third-party auth; skills are the on-ramp below that threshold.
2. **Pluggable expertise + drop-in import.** A skill is a reusable unit — prose guidance plus the scripts it refers to — that can be attached to many agents, versioned independently, and shared via the marketplace. Adopting the Claude-Code on-disk convention (a `SKILL.md` with frontmatter, a `scripts/` directory, optional reference files) means existing skills round-trip without re-authoring.

## What Changes

- **New `Skill` CRD** (`ark.mckinsey.com/v1alpha1`) that wraps a Claude-Code-shaped file bundle: a `files` map keyed by relative path (containing a required `SKILL.md` plus any number of script and reference files) and optional security knobs. Security posture defaults to deny-all. Crucially, **a skill is not pinned to one language** — see the next bullet.
- **`SKILL.md` is the source of truth for prose and metadata.** Frontmatter (`description`, optional triggers, optional version) drives the catalog; the markdown body is what `load_skill` returns. The CRD has no separate `description`/`instructions` fields.
- **Two authoring paths, one storage shape.** Authors can write a single `SKILL.md` with inline fenced code blocks marked `name=<filename>` (the simplest case — one document, Ark figures out which fences are scripts), or supply explicit `files["scripts/<name>"]` entries (what `ark skill import` produces from a Claude-Code folder). The controller materialises both styles into the same runtime ConfigMap; explicit `files["scripts/<name>"]` wins on conflict.
- **Scripts are auto-discovered.** Any file under `files["scripts/<name>"]` (whether explicit or extracted from an inline fence) whose first line is a shebang or whose extension is in the runtime allow-list is exposed as an MCP tool named `<skill>_<basename>`. Other files are mounted at `/skill/<path>` as read-only reference material the scripts can use, but are not exposed as tools. Authors can override via `spec.tools.exclude` (skip a discovered script) or `spec.tools.include` (expose a non-`scripts/` file).
- **Tool naming uses `_` not `.`** so that names are valid for OpenAI / Azure OpenAI tool calling (which rejects `.`). Anthropic accepts both, so this is universally compatible.
- **New `Skill` controller** in the operator that reconciles each `Skill` into a `ConfigMap` (the file bundle, content-hashed), a `ServiceAccount`, a `NetworkPolicy`, a `Deployment` (replicas: 0 by default), a `Service`, a synthetic `MCPServer`, and one `Tool` per discovered script. Agents use these through the existing MCP plumbing — no new tool-call path.
- **New scale-to-zero activator** in the operator: a lightweight HTTP component that fronts each skill's `Service`, scales the `Deployment` from 0 → 1 on first request, forwards once ready, and scales back to 0 after an idle window (~60 s default). Custom, not Knative.
- **One multi-language runner image** published by Ark for v1: `ark-skill-runner:v1`, an Alpine-based image (~150 MB) that contains `bash`, `python@3.12`, and `node@20`. It mounts the skill's `ConfigMap` at `/skill`, walks `/skill/scripts/` to advertise tools, and dispatches each invocation to the right interpreter based on the script's shebang or its file extension. Mixing languages within a single skill is the expected case — `extract.sh` (bash) and `summarise.py` (python) coexist freely. Languages outside the v1 image (Go, Rust, Ruby, custom interpreter versions) are out of v1 scope; authors needing them keep using `MCPServer`.
- **`Agent.spec.skills`** — new optional field, a list of `{ name, namespace? }` references. Attaching a skill is the *entire* attachment: the execution engine automatically registers a built-in `load_skill` plus one `<skill>_<script>` tool per discovered script on the agent's effective tool surface for each turn. Authors do not (and must not) duplicate the per-script tools into `Agent.spec.tools`.
- **Lazy-load protocol.** The Ark execution engine injects a catalog (`name: description` per attached skill — `description` parsed from the SKILL.md frontmatter) into the system prompt plus a single built-in `load_skill(name)` meta-tool. The full SKILL.md body lands in context only when the model invokes `load_skill`. Script tools (one per discovered script) are always exposed but named `<skill>_<basename>` so their affordance is clear to the model.
- **Model-aware injection (open question).** Anthropic models are trained on the lazy-load convention; non-Anthropic models (Azure OpenAI, OpenAI, Bedrock, Gemini) are not, and may not consistently call `load_skill` before script tools. The execution engine knows which model an agent uses; it may, in v1.5, choose between lazy and eager-inject per provider. v1 ships with lazy as default plus a `spec.preload: true` escape hatch on each skill.
- **`ark skill import` / `export` CLI subcommands** that round-trip between a Claude-skill directory on disk and the `Skill` CRD YAML. Existing skills land in Ark with one command.

## Capabilities

### New Capabilities

- `agent-skills`: lifecycle for `Skill` CRDs, reconciliation to per-skill runner infra, scale-to-zero activation, lazy-load in the execution engine, the sandboxed runtime contract for script execution, and `ark skill import / export`.

### Modified Capabilities

- None — `Agent.spec.skills` is additive and has no interaction with existing agent fields. Existing MCP / Tool plumbing is reused unchanged.

## Impact

- `ark/api/v1alpha1/skill_types.go` — new `Skill` type and generated deepcopy.
- `ark/api/v1alpha1/agent_types.go` — adds `Skills []AgentSkillRef` to `AgentSpec`.
- `ark/config/crd/bases/…_skills.yaml` — generated CRD manifest.
- `ark/internal/controller/skill_controller.go` — reconciler, including SKILL.md frontmatter parser, the inline-fenced-script extractor, and the script discovery rule.
- `ark/internal/skillactivator/…` — new subsystem (~300 lines).
- `ark/images/skill-runner/` — single multi-language Dockerfile (Alpine base + bash + python@3.12 + node@20) plus the minimal MCP server implementing the discovery rule, per-script interpreter dispatch, and I/O contract.
- `ark/dist/chart/templates/crd/…_skills.yaml` — Helm sync.
- `ark/internal/executors/completions/…` — injects catalog from SKILL.md frontmatter, registers `load_skill` built-in tool, generates `<skill>_<basename>` tool names.
- `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/…` — regenerate types; `ExecutorApp` learns the same catalog + `load_skill` path so external executors benefit too.
- `tools/ark-cli/…` — new `ark skill import <dir>` and `ark skill export <name> [--to-dir]` subcommands.
- `services/ark-api/…` + `services/ark-dashboard/…` — Skill CRUD endpoints and UI land in a follow-up PR; not in v1 scope.
- `docs/` — new user-guide page under "developer guide" plus an "import a Claude-Code skill" how-to.
- `samples/skills/` — one or two illustrative skills shipped as Claude-skill folders, plus their `kubectl apply`-able YAML form.

v1 deliberately scopes out: dashboard UI, marketplace publishing, languages outside the default runner image (Go, Rust, Ruby, custom interpreter versions), per-skill custom runner images, model-aware eager-inject (handled by v1's `spec.preload: true` escape hatch only), and cross-namespace skill references. All are compatible with the shape proposed here — additional language support in a future version would arrive as either an expanded default image or per-skill `spec.image` opt-in.
