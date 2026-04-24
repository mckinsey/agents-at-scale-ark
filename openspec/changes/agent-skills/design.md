## Context

Ark agents acquire external capabilities today by referencing an `MCPServer` plus one or more `Tool` objects. That model is correct for real external services (databases, vendor APIs, anything with auth or streaming) but disproportionate for the long tail of "small things" agents need: parse a CSV, grep vendor docs, render a report, follow a runbook. The overhead — writing an MCP server, containerising it, publishing an image, authoring three CRDs — buys nothing for a 20-line script.

Claude Code's skill format is the canonical minimal form for the small case: a folder with a `SKILL.md` (prose) and optional executable scripts, selected by description at turn time. We want the same ergonomics in Ark, with two hard constraints:

1. It must not invent a new tool-invocation path. The existing MCP plumbing handles auth, audit, tracing, rate limits, and broker integration; reinventing any of that is not worth the cost.
2. The security boundary must hold from the first commit. Skills will run user-authored code. If we can't defend that from day one, we can't later open this to the marketplace.

## Goals / Non-Goals

**Goals**

- A skill is authorable in a single YAML file and deployable via `kubectl apply` with no image build, no registry, and no additional CRDs to author by hand.
- An agent can attach many skills cheaply; attached-but-unused skills cost approximately zero memory in the model's context and zero pods in the cluster.
- Existing MCP/Tool tracing, auditing, and observability apply to skill invocations unchanged.
- The default security posture (no egress, no secrets, read-only root, non-root user, no K8s token) is strong enough that an operator can trust a skill authored by a teammate.
- Script authors hit one CRD shape and one runtime contract — no new concepts to learn beyond what Claude skills already imply.

**Non-Goals**

- Solving the "ship a whole Python app as a skill" case. That's what MCPServer is for. Skills cap at what fits inside a CRD and is worth running inside a sandboxed runner image.
- Custom runner images in v1. Authors pick from `python@3.12`, `node@20`, `bash`. Bringing your own image is plausible later but out of scope now.
- A marketplace publishing story. v1 is `kubectl apply`; marketplace integration lives in a follow-up design.
- Dashboard UI and `ark-api` CRUD endpoints. Also follow-up work, intentionally decoupled so the platform piece can ship first.
- Cross-namespace skill references. v1 requires agent and skill to share a namespace.
- Streaming tool responses. Skills run short-lived scripts; anything that needs long-lived connections should be an MCPServer.

## Decisions

### Decision: Packaging — inline in the CRD

The `Skill` CRD embeds the scripts as a string map (`spec.scripts: { "extract.sh": "#!/usr/bin/env bash\n…" }`). No OCI image, no Git reference, no external storage.

**Why.** The whole value proposition is "write one YAML file and `kubectl apply`". Externalising the scripts (OCI image or Git URL) re-introduces the very friction we're trying to remove. Per-object size in etcd caps at 1 MiB, which is plenty for "small" skills — if you need more, you should be writing an MCPServer.

**Alternative considered.** `spec.source: { image: "…" }` or `spec.source: { git: "…" }`. Rejected for v1. A future Skill v2 may add a `source` field for authors who outgrow inline, but v1 intentionally draws a hard line between "small skill" and "real MCPServer".

### Decision: Execution — synthetic MCPServer

The controller reconciles each `Skill` into a running MCPServer (plus supporting resources). Tool calls to scripts flow through MCP exactly as they do today. No new RPC protocol, no new audit path, no new tracing work.

**Why.** The agent, the execution engine, the telemetry pipeline, and the ark-broker already speak MCP. Reusing that path is hundreds of engineering hours saved — and more importantly, a skill's security and observability story is the same story we already tell for MCPServers.

**Alternative considered.** A new in-process skill runtime colocated with the execution engine (no network hop, faster cold start). Rejected — it would duplicate the MCP plumbing and make per-skill isolation harder.

### Decision: Pod model — one Deployment per skill

Each `Skill` reconciles to a dedicated `Deployment` / `ServiceAccount` / `NetworkPolicy` / `Service`. Multiple skills never share a pod.

**Why.** Security boundary. A malicious or buggy skill must not be able to read another skill's files, use another skill's SA, or exfiltrate via another skill's network allow-list. Colocating skills in a shared runner would turn script-level exploits into cross-skill compromises.

**Trade-off.** In a steady state with 10 attached skills, that's 10 Deployments on the cluster. Scale-to-zero (see next decision) makes "attached but unused" free; active use remains one pod per skill, which is the cost of the isolation guarantee.

**Alternative considered.** Shared runner with per-skill namespace + mount hardening. Rejected — the shared process model makes the sandbox story much harder to defend and doesn't save meaningfully in the steady state once scale-to-zero is on the table.

### Decision: Scheduling — scale-to-zero via a custom activator

Each skill Deployment starts at `replicas: 0`. Traffic to the skill's `Service` goes through an Ark-operated HTTP activator that: (a) forwards the request to an in-memory queue, (b) scales the Deployment to 1, (c) waits for readiness, (d) proxies the request to the pod, (e) marks the skill "warm" and decrements an idle timer. After `~60s` idle, the controller scales back to 0.

**Why.** Without scale-to-zero, "attach ten skills" becomes "run ten idle pods", which is worse DX than MCPServer today. Custom (rather than Knative or KEDA) because our requirements are narrow — one protocol (HTTP/MCP), one scale signal (any in-flight request) — and a focused ~300-line component is cheaper to ship and support than a Knative dependency for every Ark installation.

**Alternatives considered.**

- *Knative Serving.* Full-featured but heavy — operators take on Knative's autoscaler, activator, and ingress model. Over-spec for this.
- *KEDA + HTTP scaler.* Lighter than Knative but still adds a cluster-scoped operator and a scaler add-on. Defensible, but we'd be importing capability we don't need.
- *Always-on with `replicas: 1`.* Simple to ship. Unacceptable steady-state cost once folks attach >5 skills. Kills the DX pitch.

**Trade-off.** Cold-start latency on the first call after idle (~1–3 s to pull/image-cache-hit, start the pod, pass readiness). Acceptable for v1 — skills are for interactive-ish use, not hot paths. A `spec.keepWarm: true` escape hatch exists for skills that need always-on.

### Decision: Loading — lazy, via a `load_skill` meta-tool

At turn time, the execution engine injects only a compact catalog into the system prompt:

```
You have access to these skills:
  - cobol-migrator: Analyse a COBOL file and draft a Python rewrite
  - incident-runbook: Respond to paging-tier alerts per runbook §3
Call load_skill(name) before using a skill's scripts.
```

A single built-in tool `load_skill(name: string)` returns the full `instructions` block. Script tools (`<skill>.<script>`) are registered on the model's tool surface from the start — but their per-tool descriptions are intentionally minimal ("Run `extract.sh` on behalf of skill `cobol-migrator`"). The model learns how to use them from the `instructions` it fetches via `load_skill`.

**Why.** Injecting every skill's full prose every turn doesn't scale past ~3–5 attached skills. Catalog-plus-load mirrors how Claude Code handles its own skills, so we're importing a pattern that's been shown to work. The token cost per extra attached skill is just the one-line description.

**Alternative considered.** Eager injection of all skills' instructions. Rejected — caps useful attachment at a handful of skills and undermines the "pluggable expertise" story.

**Trade-off.** The model must make two tool calls before it can usefully invoke a skill (`load_skill` then `<skill>.<script>`). That's one extra round-trip of latency versus an eager-inject model but is functionally negligible compared to the cost savings on token spend.

### Decision: Script → tool mapping — one tool per script

Each script in `spec.scripts` becomes a distinct MCP tool named `<skill>.<script-basename>`. The controller writes one `Tool` CRD per script, and the runner image advertises them via MCP's `list_tools` response.

**Why.** The model performs better when tool names are specific. Logs and audit records show exactly which script ran. JSON-schema arguments per script (optional, declared in `spec.scripts.<name>.schema`) give typed affordances.

**Alternative considered.** One generic `<skill>.run(script, argv)` tool per skill. Rejected — it collapses every script invocation into a single opaque call in audit logs, erodes model-side sharpness, and reinvents `run_shell_command` with extra steps.

**Trade-off.** N `Tool` objects per skill (hidden from the author; the controller writes them). The controller does the bookkeeping; humans never author these objects.

### Decision: Security defaults — locked down, opt-in to relax

The runner pod's default PodSpec is:

- `automountServiceAccountToken: false`
- `securityContext: { runAsNonRoot: true, runAsUser: 65532, readOnlyRootFilesystem: true, allowPrivilegeEscalation: false, capabilities: { drop: [ALL] }, seccompProfile: { type: RuntimeDefault } }`
- `resources.limits: { cpu: 500m, memory: 256Mi }` (override via `spec.resources`)
- Mounts: the scripts ConfigMap at `/skill` (read-only); an `emptyDir` at `/tmp` (writable, sized)
- `NetworkPolicy`: deny all egress. Opt-in via `spec.network.egress: [{host, port}]` which the controller translates to matching egress rules.
- `ServiceAccount`: one per skill, no roles bound. Opt-in via `spec.serviceAccount.roles: [<RoleName>]` — only cluster-admin-approved roles may be referenced (enforced by a validating webhook).
- Secrets: none mounted by default. Opt-in via `spec.secrets: [{name, mountPath}]`.
- Runtime images: only images from an operator-configurable allow-list are accepted. v1 seed: `ghcr.io/mckinsey/ark-skill-runner-python:3.12`, `…-node:20`, `…-bash`.

**Why.** Either we build the constraints now, or we build a migration later under time pressure when the first security review lands. The deny-by-default posture means an author who does nothing gets a fully sandboxed skill.

**Trade-off.** "Hello world" skills that do nothing but print "hi" work. Any skill that needs the network, a secret, or an API token requires thought — which is the point.

### Decision: Attachment — new `Agent.spec.skills` field, not reusing `spec.tools`

Skills are a new concept (prose + scripts, lazy-loaded) distinct from tools (discrete callables). Adding them to the existing `spec.tools` discriminated union would either break the type (by allowing a skill reference where a tool is expected) or silently change the semantics of an existing tool ref.

**Why.** Skills have lazy-load behaviour; tools don't. Skills bundle instructions; tools don't. Mashing them into `spec.tools` would force the controller to distinguish them anyway and confuse the CRD contract.

**Alternative considered.** `AgentTool.type: "skill"`. Rejected — the behaviour of a skill entry and a tool entry diverge (catalog injection, `load_skill`, per-script tool fan-out) and the type guards on the controller side get messy.

### Decision: Versioning — content hash, not semver, in v1

`ConfigMap/<skill>-<hash>` is created for every unique content (scripts + instructions). The Deployment references the hashed CM directly. An author editing a skill produces a new CM; the old one is GC'd once no Deployment points at it. The `Skill` itself is mutable.

**Why.** Keeps v1 simple. An explicit `spec.version` field is useful for marketplace skills but can be added later without breaking the shape.

**Trade-off.** No straightforward "pin to version 1.3" story yet. Acceptable for v1 since the attachment surface is per-namespace and controlled by the same team that edits the skill.

## Risks / Trade-offs

- **Scale-to-zero cold start.** First call after idle eats 1–3 s of latency. Mitigations: image pre-pull via DaemonSet, `spec.keepWarm: true` escape hatch, warmup annotation for agents that always use a skill on first turn.
- **ConfigMap 1 MiB cap.** A few weeks of use will surface an author who hits this. The cap pushes them toward a real MCPServer, which is arguably the right answer. We document the cap prominently and will point people there.
- **Activator is a new SPOF.** If the activator deploy falls over, all skill traffic stalls. Mitigations: the activator is stateless and runs as a Deployment with ≥2 replicas in production; its failure mode is "existing warm skills keep working, newly-cold ones don't wake up".
- **Tool sprawl in the cluster.** Every skill generates one Tool CRD per script. A cluster with 20 skills averaging 3 scripts apiece is 60 extra Tool objects. These are controller-owned and cheap, but they do show up in `kubectl get tools`. Acceptable — they're filterable via an `ark.mckinsey.com/source-skill` label we add.
- **Author escape hatches are gateways to privilege.** `spec.serviceAccount.roles`, `spec.network.egress`, and `spec.secrets` can be used to grant a skill meaningful power. A validating webhook must enforce that role references are on an allow-list configured by a cluster admin; skills from less-trusted authors should not be allowed to pick arbitrary roles.
- **Lazy-load chattiness.** Two tool calls to use a skill (one `load_skill`, one script) adds latency for the happy path. Latency budget is fine for interactive agents; may be worth auto-eager-inject for skills marked `spec.preload: true`.

## Open Questions

- Should `load_skill` be a built-in tool on every Ark execution engine, or an MCP tool served by a cluster-scoped "skill-catalog" MCPServer that the controller provisions? A built-in is simpler; a catalog MCPServer slots more cleanly into the existing plumbing. Likely built-in for v1.
- Is `spec.scripts` a map (`{ "extract.sh": "..." }`) or a list (`- name: extract.sh, content: "..."`)? Map is terser and prevents duplicate names; list permits per-script JSON schema / args / resource overrides without a nested key-value gymnastic. Leaning list for extensibility.
- Does the activator scale horizontally (many replicas, sticky by skill) or stay at a single replica per namespace? Single is simpler; horizontal is required for larger clusters. Probably single-replica for v1 with a scale-out plan documented.
- Should `spec.resources` allow the author to override the defaults, or only an operator annotation? Authors need some control (bigger memory for LLM-summariser skills) but we shouldn't let them set `cpu: 32` unchecked. Probably expose with a controller-level cap enforceable by webhook.
- Per-skill audit annotations: do we emit a K8s Event per `load_skill` call, per script invocation, both, or neither? Lean "script invocation only" since the broker already captures detailed tool-call events.
