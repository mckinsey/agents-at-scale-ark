## Context

Ark agents acquire external capabilities today by referencing an `MCPServer` plus one or more `Tool` objects. That model is correct for real external services (databases, vendor APIs, anything with auth or streaming) but disproportionate for the long tail of "small things" agents need: parse a CSV, grep vendor docs, render a report, follow a runbook. The overhead — writing an MCP server, containerising it, publishing an image, authoring three CRDs — buys nothing for a 20-line script.

Claude Code's skill format is the canonical minimal form for the small case: a folder with a `SKILL.md` (prose) and optional executable scripts, selected by description at turn time. We want the same ergonomics in Ark — and concretely, we want to be able to import a Claude-Code skill folder one-to-one, with no re-authoring. Three hard constraints:

1. The wire-level invocation path must reuse Ark's existing MCP plumbing — auth, audit, tracing, broker integration, rate limits. Reinventing any of that is not worth the cost.
2. The security boundary must hold from the first commit. Skills will run user-authored code. If we can't defend that from day one, we can't later open this to the marketplace.
3. The on-disk shape Claude Code uses (`SKILL.md` with frontmatter + body, `scripts/` directory, optional reference files) must be the canonical shape inside the CRD too. Any author who already has a skill should be able to import it with one command.

## Where scripts run (and don't)

A common point of confusion is whether "skills" require something Claude-specific. They don't. Skills are a *harness-side* construct — neither Anthropic's API nor any other provider has a native "skill" concept. What models supply is **tool calling**, and skills are implemented on top of that.

```
   Claude Code's design               Ark's design
   ──────────────────────             ──────────────────────────
   Model picks the tool   ╗   Model picks the tool   ╗
   Tool call comes back   ║   Tool call comes back   ║   Same.
   ──────────────────────  ║  ──────────────────────  ║   The model
   Tool runs on YOUR       ║   Tool runs in the       ║   side is
   LAPTOP                  ║   PER-SKILL POD inside   ║   identical
                           ║   the cluster             ║   regardless of
                           ║                           ║   provider.
   Swapping the model     ╝   Swapping the model     ╝
   doesn't move where         doesn't move where
   the script runs.           the script runs.
```

The script always runs in the per-skill pod, regardless of the agent's model provider. This means the design works with Anthropic, OpenAI, Azure OpenAI, Bedrock, and Gemini equally. It also means the security model is "per-skill pod sandbox", not "wherever the LLM happens to be hosted".

## Goals / Non-Goals

**Goals**

- A skill is authorable in a single YAML file and deployable via `kubectl apply` with no image build, no registry, and no additional CRDs to author by hand.
- A skill folder authored for Claude Code (`SKILL.md` + `scripts/` + optional reference files) can be imported into Ark with one CLI command and no manual re-shaping.
- An agent can attach many skills cheaply; attached-but-unused skills cost approximately zero memory in the model's context and zero pods in the cluster.
- Existing MCP/Tool tracing, auditing, and observability apply to skill invocations unchanged.
- The default security posture (no egress, no secrets, read-only root, non-root user, no K8s token) is strong enough that an operator can trust a skill authored by a teammate.
- Skill authors hit one CRD shape and one runtime contract; **the CRD shape mirrors the on-disk skill folder one-to-one.**

**Non-Goals**

- Solving the "ship a whole Python app as a skill" case. That's what MCPServer is for.
- Custom runner images in v1. Authors pick from `python@3.12`, `node@20`, `bash`. Bringing your own image is plausible later but out of scope now.
- A marketplace publishing story. v1 is `kubectl apply`; marketplace integration lives in a follow-up design.
- Dashboard UI and `ark-api` CRUD endpoints. Also follow-up work, intentionally decoupled so the platform piece can ship first.
- Cross-namespace skill references. v1 requires agent and skill to share a namespace.
- Streaming tool responses. Skills run short-lived scripts; anything that needs long-lived connections should be an MCPServer.
- OCI-image / Git-based skill sources. Anyone who outgrows what fits in a `ConfigMap` should be writing an MCPServer instead.

## Decisions

### Decision: CRD shape mirrors the on-disk skill folder

The `Skill` spec is essentially a YAML wrapper around a Claude-Code-shaped directory. The whole bundle lives in `spec.files`, a map keyed by relative path:

```yaml
spec:
  files:
    SKILL.md: |
      ---
      description: Analyse a COBOL file and draft a Python rewrite
      ---
      When analysing a COBOL program:
      - Run scripts/extract.sh to pull COPY statements
      - Run scripts/structure.py to map paragraphs → sections
    scripts/extract.sh: |
      #!/usr/bin/env bash
      grep -iE '^ +COPY ' "$1" | awk '{print $2}' | sort -u
    scripts/structure.py: |
      import re, sys
      …
    templates/example.cbl: |
      …
```

Note there is no `runtime` field. A skill is not pinned to a single language — see "Single multi-language runner image" below.

`SKILL.md` is required and is the source of truth for `description` (frontmatter) and `instructions` (body). There are no separate `description` / `instructions` fields on the CRD.

**Why.** This is the on-ramp for the "I have a Claude-Code skill, import it" use case. Any other shape (separate `description`, `instructions`, `scripts` fields) means re-authoring the skill on the way in and re-authoring on the way out. Keeping the file bundle as the canonical form means import/export are direct serialisations of a directory.

**Why not a separate `description` shortcut field?** Two sources of truth invite drift. If the CRD has `spec.description: "Foo"` *and* SKILL.md says `description: "Bar"`, the catalog is ambiguous. Single source: SKILL.md.

**Alternative considered.** OCI image- or Git-based sources (`spec.source: { image: … }` / `spec.source: { git: … }`). Rejected for v1 — re-introduces the very friction we're trying to remove (build, push, register). A future Skill v2 may add a `source` field.

### Decision: Single multi-language runner image; per-script dispatch by shebang/extension

A skill commonly bundles cooperating scripts in different languages — `extract.sh` to scrape, `summarise.py` to crunch, maybe a `format.js` to render. Pinning each `Skill` to one language image (the earlier draft of this doc) made the cross-language case impossible: a python image can't run bash + node + python in the same skill.

v1 ships **one** runner image, `ark-skill-runner:v1`, on an Alpine base, containing:

- `bash` (5.x)
- `python@3.12` (exposed as `python` and `python3`)
- `node@20` (exposed as `node`; `tsx` for `.ts`)

Estimated image size ≈ 150 MB. Image-pull cost on cold start is dominated by container startup once the image is cached on a node, not by a one-time pull.

Per-script dispatch happens at tool-call time inside the runner:

```
   Script discovered at  /skill/scripts/foo.<ext>
        │
        ▼
   First line is a shebang (#!)        ──►  exec the file directly;
                                            kernel honours the shebang
        │
        else
        ▼
   Extension dispatch:                       
     .sh                          ──►  bash <file>
     .py                          ──►  python3 <file>
     .js                          ──►  node <file>
     .ts                          ──►  tsx <file>
     anything else                ──►  tool error: "no interpreter
                                       for extension <ext> — see the
                                       runtime allow-list, or use an
                                       MCPServer for this language"
```

There is **no `spec.runtime` field**. A skill that only uses bash works the same way as one that only uses python — the runner doesn't care, the file extensions and shebangs do.

**Why one image, not three.** The "one language per skill" model would have forced authors to either split a logically-coherent skill across multiple Skill CRDs or rewrite scripts in a single language. Both options are bad. A single image with the three commodity languages preinstalled is the natural fit for the "small things" target.

**Why not a bigger image with Go / Rust / Ruby etc.** Each interpreter or toolchain costs disk, image-pull time, and a security surface. v1 covers ~95% of "small thing" use cases with bash + python + node. Authors who need Go (300 MB toolchain, compiled language, awkward as a "script") or Rust should write an MCPServer — that's the explicit v1 boundary.

**What about specific language versions.** A future Skill v2 may add an optional `spec.image` field that lets a skill pin to `ark-skill-runner-python:3.13` or a different node major. v1 ships exactly one image; that's it.

**Alternative considered.** Per-skill `spec.runtime: python@3.12 | node@20 | bash` selecting one of three single-language images. Rejected for the reasons above (forces single-language skills, contradicts the Claude-Code mental model). Authors who need multiple languages would have ended up authoring multiple skills with the same prose duplicated — exactly the friction skills are meant to remove.

**Alternative considered.** Per-script `spec.runtime` (one runtime per file) selecting an image per script. Rejected — would multiply the per-skill pod count by the number of languages, gut the per-skill isolation guarantee, and turn one Skill into many.

### Decision: SKILL.md is required; minimal frontmatter only

`SKILL.md` is parsed as YAML frontmatter delimited by `---` followed by a markdown body. v1 frontmatter recognises:

- `description` (required, ≤ 200 chars) — what lands in the agent's catalog
- `triggers` (optional, list of strings) — informational metadata; v1 does not use it for selection
- `version` (optional, string) — informational, useful when marketplace publishing arrives

Anything else in frontmatter is preserved but ignored. The body — everything after the second `---` — is what `load_skill(name)` returns.

**Why.** Restraint at v1: the only frontmatter field whose value the controller depends on is `description`. Keeping the parser minimal means imported Claude-Code skills are accepted regardless of which extra frontmatter fields a community author included.

### Decision: Auto-discovery rule for scripts

A file in the bundle becomes a runnable tool iff **all** of:

1. The path is exactly two segments and the first segment is `scripts/`.
2. The file's first line starts with `#!` **or** the extension is in the dispatch allow-list (`.sh`, `.py`, `.js`, `.ts`).
3. The path is not in `spec.tools.exclude`.

(The language each script will run as is determined separately at invocation time per "Single multi-language runner image" above. Discovery only decides whether a file becomes a tool *at all*.)

A discovered script is exposed as an MCP tool named `<skill-name>_<basename-without-extension>`. The discovery is performed by the runner image at startup, advertised via `list_tools`, and the result is reflected back to the controller (which writes the corresponding `Tool` CRD records).

Files not matching the rule are still mounted at `/skill/<path>` so scripts can read them, but are not exposed as tools.

```
   files["SKILL.md"]               ──► instructions + description
   files["scripts/extract.sh"]     ──► tool: cobol-migrator_extract
   files["scripts/lib.sh"]         ──► tool: cobol-migrator_lib
                                       (hide via spec.tools.exclude)
   files["scripts/_helper.py"]     ──► tool: cobol-migrator__helper
                                       (convention: leading underscore =
                                        helper; author should exclude)
   files["scripts/notes.txt"]      ──► reference (not tool)  
                                       — no shebang, not in extension
                                       allow-list
   files["templates/example.cbl"]  ──► reference (not tool)
                                       — wrong path prefix
```

**Why.** Predictable, dull, zero magic. Everything is a path-and-filename decision; nothing depends on parsing code. Authors can reason about "is this a tool?" without reading the controller's source.

**Alternative considered.** *Implicit* heuristic detection from any fenced code block inside `SKILL.md` (every `\`\`\`bash` becomes a script). Rejected — fenced blocks are often documentation or examples, not necessarily intended to be runnable. False positives would be common. The next decision keeps the spirit (one-textarea authoring) but uses an *explicit* opt-in marker.

### Decision: Inline fenced scripts in SKILL.md auto-extract to `scripts/`

Authors who don't want to think about a separate `files` map can write a single `SKILL.md` with their scripts as fenced code blocks marked with a `name=<filename>` attribute on the info string:

````markdown
---
description: Analyse a COBOL file and draft a Python rewrite
---

When analysing a COBOL program, run extract first then summarise:

```bash name=extract.sh
#!/usr/bin/env bash
grep -iE '^ +COPY ' "$1" | awk '{print $2}' | sort -u
```

```python name=structure.py
import re, sys
src = open(sys.argv[1]).read()
…
```
````

The controller treats the block as if the author had written `files["scripts/extract.sh"]` directly:

1. Walks `files["SKILL.md"]`, finds every fenced block whose info string matches `\bname=("…"|'…'|<token>)`.
2. If the captured name has no slash, the resolved path is `scripts/<name>`. If it has a slash, the path is preserved verbatim (lets a power-user write `name=bin/foo` for the rare non-default layout).
3. **Conflict rule.** If `files["scripts/<name>"]` is *also* set explicitly, the explicit entry wins. The author put it there deliberately, and that's the form `ark skill import` produces from a Claude-Code folder.
4. The discovery rule from the previous decision then runs over the materialised result — same gate, same allow-list, same `tools.exclude`/`tools.include` overrides.
5. Fenced blocks *without* `name=…` are pure documentation. They are returned to the model verbatim by `load_skill` (so it sees the example), but never become runnable tools.

```
   AUTHORING                                         RUNTIME

   files["SKILL.md"] only,                           same materialised
   with inline `name=…` fences                       files map ──► same
                                            ─►       discovery ──► same
   files["SKILL.md"] + explicit                      tool surface
   files["scripts/<name>"]                           on the agent
                                            ─►
```

**Why.** It is the difference between "drop in any existing skill" (the explicit-files form, what `ark skill import` produces) and "open one textarea, type a SKILL.md" (the inline-fence form, what the dashboard's editor produces). Both styles converge on the same on-cluster shape, so neither is privileged.

**Why not just store the SKILL.md and parse fences at runtime?** Because the runner image is intentionally dumb — it walks `/skill/` and discovers tools from filenames, no markdown parsing involved. Doing the extraction at apply time keeps that contract clean and keeps `kubectl get configmap <skill>-<hash>` legible — every script is its own key.

**Alternative considered.** Single-source storage where only `files["SKILL.md"]` is stored and the controller re-extracts at every reconcile. Rejected — the inline form is an authoring convenience, not a storage shape; round-tripping through `ark skill export` is simpler when extracted scripts are first-class on disk.

### Decision: `spec.tools.exclude` and `spec.tools.include` for discovery overrides

- `spec.tools.exclude: [scripts/lib.sh]` removes a discovered script from the tool surface (still mounted, still runnable from another script via `bash /skill/scripts/lib.sh`, just not advertised to the model).
- `spec.tools.include: [bin/foo]` exposes a non-`scripts/`-prefixed file as a tool (for power users who reach for non-default layouts).

Both are optional. The default behaviour with neither set is the discovery rule above.

**Why.** "Helpers under `scripts/`" is a real pattern — `lib.sh`, `common.py` — and authors shouldn't have to either rename them or accept a polluted tool surface. `include` is the rarer escape hatch: probably useful in <5% of skills, but its absence would force authors to rename a folder.

### Decision: Tool-name separator is `_`, not `.`

`<skill-name>_<basename-without-extension>` rather than `<skill-name>.<basename-without-extension>`.

**Why.** The OpenAI Chat Completions API requires tool names to match `^[a-zA-Z0-9_-]{1,64}$` and rejects `.`. Anthropic accepts both. Choosing `_` makes generated tools valid for every supported provider.

**Alternative considered.** Per-provider name mapping (rewrite `.` to `_` only when the engine talks to OpenAI). Rejected — having tool names differ depending on which model the agent runs against breaks logs/audits and confuses humans.

### Decision: Execution — synthetic MCPServer

The controller reconciles each `Skill` into a running MCPServer (plus supporting resources). Tool calls to scripts flow through MCP exactly as they do today. No new RPC protocol, no new audit path, no new tracing work.

**Why.** The agent, the execution engine, the telemetry pipeline, and the ark-broker already speak MCP. Reusing that path is hundreds of engineering hours saved — and more importantly, a skill's security and observability story is the same story we already tell for MCPServers.

**Alternative considered.** A new in-process skill runtime colocated with the execution engine (no network hop, faster cold start). Rejected — would duplicate MCP plumbing and make per-skill isolation harder.

### Decision: Pod model — one Deployment per skill

Each `Skill` reconciles to a dedicated `Deployment` / `ServiceAccount` / `NetworkPolicy` / `Service`. Multiple skills never share a pod.

**Why.** Security boundary. A malicious or buggy skill must not be able to read another skill's files, use another skill's SA, or exfiltrate via another skill's network allow-list. Colocating skills in a shared runner would turn script-level exploits into cross-skill compromises.

**Trade-off.** N attached skills → N Deployments. Scale-to-zero (next decision) makes "attached but unused" free; active use remains one pod per skill, which is the cost of the isolation guarantee.

### Decision: Scheduling — scale-to-zero via a custom activator

Each skill Deployment starts at `replicas: 0`. Traffic to the skill's `Service` goes through an Ark-operated HTTP activator that: (a) forwards the request to an in-memory queue, (b) scales the Deployment to 1, (c) waits for readiness, (d) proxies the request to the pod, (e) marks the skill "warm" and decrements an idle timer. After `~60s` idle, the controller scales back to 0.

**Why.** Without scale-to-zero, "attach ten skills" becomes "run ten idle pods", which is worse DX than MCPServer today. Custom (rather than Knative or KEDA) because our requirements are narrow — one protocol (HTTP/MCP), one scale signal (any in-flight request) — and a focused ~300-line component is cheaper to ship and support than a Knative dependency for every Ark installation.

**Alternatives considered.**

- *Knative Serving.* Full-featured but heavy — operators take on Knative's autoscaler, activator, and ingress model. Over-spec for this.
- *KEDA + HTTP scaler.* Lighter than Knative but still adds a cluster-scoped operator and a scaler add-on. Defensible, but we'd be importing capability we don't need.
- *Always-on with `replicas: 1`.* Simple to ship. Unacceptable steady-state cost once folks attach >5 skills.

**Trade-off.** Cold-start latency on the first call after idle (~1–3 s). Acceptable for v1 — skills are for interactive-ish use. A `spec.keepWarm: true` escape hatch exists for skills that need always-on.

### Decision: Loading — lazy, via a `load_skill` meta-tool

At turn time, the execution engine injects only a compact catalog into the system prompt:

```
You have access to these skills:
  - cobol-migrator: Analyse a COBOL file and draft a Python rewrite
  - incident-runbook: Respond to paging-tier alerts per runbook §3
Call load_skill(name) before using a skill's scripts.
```

A single built-in tool `load_skill(name: string)` returns the skill's full SKILL.md body (markdown, frontmatter stripped). Per-script tools (`<skill>_<script>`) are registered on the model's tool surface from the start — but their per-tool descriptions are intentionally short ("Run `extract.sh` on behalf of skill `cobol-migrator`"). The model learns how to use them from the body it fetches via `load_skill`.

**Why.** Injecting every skill's full prose every turn doesn't scale past ~3–5 attached skills. Catalog-plus-load mirrors how Claude Code handles its own skills.

**Trade-off.** Two tool calls before a script invocation (load_skill, then the script). Latency cost is negligible vs. the token-cost saving on attached-but-unused skills.

### Decision: `spec.preload: true` escape hatch for non-Anthropic models

Anthropic models are explicitly trained on the lazy-load convention; non-Anthropic models (Azure OpenAI / OpenAI / Bedrock / Gemini) are not. They support tool calling fine but may not consistently call `load_skill` before reaching for a script tool — they may answer in text without using the skill, or call the script tool blind.

For v1, the answer is `spec.preload: true` on individual skills the operator wants always-on:

- `preload: false` (default): skill description in catalog, full body via `load_skill`.
- `preload: true`: skill's full SKILL.md body inlined into the system prompt every turn. Bypasses `load_skill` for that skill.

**Why this v1 answer.** Adds one boolean. Doesn't require the engine to be model-aware. Operators who run Azure OpenAI agents with critical skills can opt in skill-by-skill. v1.5 may add automatic model-aware injection (see Open Questions).

**Trade-off.** Tokens. If you `preload` 10 skills, you're paying for 10 full SKILL.md bodies on every turn. The right call for "always relevant" skills, not for "maybe relevant" ones.

### Decision: Tool-per-script — kept

Each discovered script becomes its own MCP tool with a name like `<skill>_<basename>`.

**Why.** Models perform better when tool names are specific. Logs and audit records show exactly which script ran. The CRD bookkeeping (one Tool object per discovered script) is hidden from the author — the controller writes them.

### Decision: Security defaults — locked down, opt-in to relax

The runner pod's default PodSpec is:

- `automountServiceAccountToken: false`
- `securityContext: { runAsNonRoot: true, runAsUser: 65532, readOnlyRootFilesystem: true, allowPrivilegeEscalation: false, capabilities: { drop: [ALL] }, seccompProfile: { type: RuntimeDefault } }`
- `resources.limits: { cpu: 500m, memory: 256Mi }` (override via `spec.resources`)
- Mounts: the bundle ConfigMap at `/skill` (read-only); an `emptyDir` at `/tmp` (writable, sized)
- `NetworkPolicy`: deny all egress. Opt-in via `spec.network.egress: [{host, port}]` which the controller translates to matching egress rules.
- `ServiceAccount`: one per skill, no roles bound. Opt-in via `spec.serviceAccount.roles: [<RoleName>]` — only cluster-admin-approved roles may be referenced (enforced by a validating webhook).
- Secrets: none mounted by default. Opt-in via `spec.secrets: [{name, mountPath}]`.
- Runtime images: only images from an operator-configurable allow-list are accepted. v1 seed: `ghcr.io/mckinsey/ark-skill-runner-python:3.12`, `…-node:20`, `…-bash`.

**Why.** Build the constraints now, not later under time pressure. Deny-by-default means an author who does nothing gets a fully sandboxed skill.

### Decision: Attachment — new `Agent.spec.skills` field, not reusing `spec.tools`

Skills are a new concept (prose + scripts, lazy-loaded) distinct from tools (discrete callables). Adding them to the existing `spec.tools` discriminated union would either break the type or silently change the semantics of an existing tool ref.

**Crucial property: attaching a skill is the *entire* attachment.** The execution engine resolves `Agent.spec.skills` and automatically registers the built-in `load_skill` plus one `<skill>_<script>` tool per discovered script on the agent's effective tool surface for that turn. Authors do not list those tools in `spec.tools`, and they MUST NOT — duplicating them would create two sources of truth and confuse the catalog/load_skill protocol.

```
   YOUR YAML — SHORT FORM            WHAT GETS REGISTERED FOR THE TURN
   ────────────────────────          ─────────────────────────────────
   spec:                             Tools:
     tools:                            - my-mcp-tool          ← from spec.tools
       - mcp:                          - cobol-migrator_extract
           mcpServerRef: my-mcp          (auto from skills[])
           toolName: my-tool           - cobol-migrator_summary
     skills:                             (auto)
       - name: cobol-migrator         - load_skill            ← built-in
```

This composes cleanly: `spec.tools` and `spec.skills` are independent input surfaces; the engine merges them into the model's tool list. Removing a skill from `spec.skills` cleanly removes its `<skill>_*` tools from the next turn — operators don't have to remember to also prune `spec.tools`.

### Decision: Versioning — content hash, not semver, in v1

`ConfigMap/<skill>-<hash>` is created for every unique content (the entire `files` map). The Deployment references the hashed CM directly. An author editing a skill produces a new CM; the old one is GC'd once no Deployment points at it. The `Skill` itself is mutable.

**Why.** Keeps v1 simple. An explicit `spec.version` field is useful for marketplace skills but can be added later without breaking the shape.

### Decision: Ship `ark skill import` / `export` CLI subcommands in v1

`ark skill import <dir>` reads a Claude-skill folder and emits the corresponding `Skill` CRD YAML on stdout. `ark skill export <name> [--to-dir <dir>]` does the inverse. Authors and operators can round-trip between the two forms freely.

**Why.** "Import compatibility" is a value proposition, not a follow-up — it has to ship in v1 or the marketing claim is hollow. The implementation is small (recursive read + a Skill struct), and it doubles as the way we ship our own sample skills (folder in `samples/skills/<name>/`, generated YAML next to it).

## Risks / Trade-offs

- **Scale-to-zero cold start.** First call after idle eats 1–3 s of latency. Mitigations: image pre-pull via DaemonSet, `spec.keepWarm: true`, warmup annotation for agents that always use a skill on first turn.
- **ConfigMap 1 MiB cap.** Authors who hit it should be writing an MCPServer, and the validating webhook says so explicitly. Documented prominently.
- **Activator is a new SPOF.** Stateless Deployment with ≥2 replicas in production. Failure mode: warm skills keep working, cold ones don't wake.
- **Tool sprawl in the cluster.** Every skill generates one Tool CRD per discovered script. A cluster with 20 skills averaging 3 scripts apiece is 60 extra Tool objects. Filterable via the `ark.mckinsey.com/source-skill` label.
- **Author escape hatches grant privilege.** `spec.serviceAccount.roles`, `spec.network.egress`, `spec.secrets` are real powers. A validating webhook must enforce role allow-lists configured by a cluster admin.
- **Lazy-load chattiness on non-Anthropic models.** GPT-4o may sometimes call script tools without first calling `load_skill`. Two mitigations in v1: per-script tool descriptions inline a short snippet of the skill description, and `spec.preload: true` is available skill-by-skill. Worth flagging on day-one docs.
- **`SKILL.md` parser surface.** Even a minimal frontmatter parser is a parser. Use a vetted library (e.g. `gopkg.in/yaml.v3` for the frontmatter, with a strict separator regex for `---`); fail loudly on malformed input rather than guessing.

## Open Questions

- Should the execution engine choose **eager-inject vs lazy** automatically based on the agent's model provider? (e.g., Anthropic → lazy, OpenAI/Azure → eager). Likely v1.5; v1 ships with `spec.preload: true` as the per-skill manual override.
- Should `load_skill` be a built-in tool on every Ark execution engine, or an MCP tool served by a cluster-scoped "skill-catalog" MCPServer that the controller provisions? Built-in is simpler; catalog server slots more cleanly into existing plumbing. Likely built-in for v1.
- Does the activator scale horizontally (many replicas, sticky by skill) or stay at a single replica per namespace? Single is simpler; horizontal is required for larger clusters. Probably single-replica for v1 with a scale-out plan documented.
- Should `spec.resources` allow author override, or only an operator annotation? Authors need some control (bigger memory for an LLM-summariser skill) but not unbounded. Probably expose with a controller-level cap enforceable by webhook.
- Per-skill audit annotations: K8s Event per `load_skill`, per script invocation, both, or neither? Lean script-invocation-only since the broker already captures detailed tool-call events.
- Should imported Claude-Code skills with frontmatter `triggers` translate into anything Ark uses, or stay informational? v1 is informational; v1.5 might use them as catalog hints.
