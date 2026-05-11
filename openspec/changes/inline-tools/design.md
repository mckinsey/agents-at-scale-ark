## Context

Ark agents acquire external capabilities today by referencing an `MCPServer` plus one or more `Tool` objects. That model is correct for real external services (databases, vendor APIs, anything with auth or streaming) but disproportionate for the long tail of "small things" agents need: parse a CSV, drive a runbook step, transform some text, glue two APIs together. The overhead — writing an MCP server, containerising it, publishing an image, authoring three CRDs — buys nothing for a 20-line script.

The earlier `agent-skills` proposal tried to address this by adapting Claude Code's full skill shape — a `SKILL.md` document with prose + frontmatter + `scripts/` + reference files, surfaced through a `load_skill` catalog. User testing of the dashboard mockup showed that the prose/catalog half of that design wasn't carrying its weight: testers reached for the "I can write a Python function inline" affordance and largely ignored the markdown/expertise framing. `inline-tools` keeps the carrying primitive and drops the rest.

Three hard constraints carry forward from `agent-skills`:

1. **The wire-level invocation path must reuse Ark's existing MCP plumbing.** Auth, audit, tracing, broker integration, rate limits — reinventing any of that is not worth the cost.
2. **The security boundary must hold from the first commit.** Inline tools will run user-authored code. The default posture has to be defensible without authors thinking about it.
3. **The CRD shape must be additive to today's `Tool`.** No new kind, no new attachment field on `Agent`. An inline tool should be indistinguishable from an HTTP or MCP tool from the agent author's point of view.

## Where scripts run (and don't)

A common point of confusion is whether "inline tools" mean the model runs code locally. They don't. Inline tools are a *harness-side* primitive — neither Anthropic's API nor any other provider has a native concept here. What models supply is **tool calling**, and inline tools are implemented on top of that.

```
   Conventional MCP tool                 Inline tool
   ──────────────────────                ──────────────────────
   Model picks the tool   ╗   Model picks the tool   ╗
   Tool call comes back   ║   Tool call comes back   ║   Same.
   ──────────────────────  ║  ──────────────────────  ║   The model
   Executor calls          ║   Executor calls          ║   side is
   author-built MCP        ║   per-tool runner pod     ║   identical
   server                  ║   (Ark-managed)           ║   regardless of
                           ║                           ║   provider.
   Swapping the model     ╝   Swapping the model     ╝
   doesn't change where        doesn't change where
   the script runs.            the script runs.
```

The script always runs in a per-tool sandbox pod inside the cluster, regardless of the agent's model provider. The design works with Anthropic, OpenAI, Azure OpenAI, Bedrock, and Gemini equally.

## Goals / Non-Goals

**Goals**

- A custom tool is authorable in a single YAML file and deployable via `kubectl apply` with no image build, no registry, and no additional CRDs to author by hand.
- Inline tools attach to agents via the existing `Agent.spec.tools` — agent authors do not learn a new concept to use them.
- An agent can attach many inline tools cheaply; attached-but-unused tools cost zero pods (scale-to-zero) and zero new memory in the model's context beyond their tool descriptions.
- Existing MCP/Tool tracing, auditing, and observability apply to inline-tool invocations unchanged.
- The default security posture (no egress, no secrets, read-only root, non-root user, no Kubernetes token) is strong enough that an operator can trust an inline tool authored by a teammate without reviewing its YAML for boilerplate hardening.
- Authors hit one CRD shape and one runtime contract per inline tool. Mixing languages across an agent's tool set is free — each tool is its own pod.

**Non-Goals**

- Bundling multiple scripts into one resource. If you have three related scripts, you author three `Tool` resources. The `agent-skills` proposal explored bundling; user testing didn't find the grouping load-bearing.
- The full Claude-Code skill shape (`SKILL.md` + frontmatter + body + lazy-load catalog). Out of scope for `inline-tools`; future work if demand materialises.
- Custom runner images in v1. Authors pick from the built-in `python@3.12`, `node@20`, or `bash`. Bringing your own image is plausible later but punted now.
- A marketplace publishing story for inline tools. v1 is `kubectl apply` and a sample directory.
- Cross-namespace tool references. Existing `Tool` constraint stands.
- Streaming tool responses. Inline tools run short-lived scripts; anything long-lived should be an `MCPServer`.
- OCI image, Git, or HTTP source URLs for the script. The script lives inline in the CRD; anything that outgrows what fits in a `ConfigMap` should be an `MCPServer`.
- Reference-file mounts (a "skill" pattern). If a script needs static data files alongside it, that's an `MCPServer`.

## Decisions

### Decision: Extend the existing `Tool` CRD; do not introduce a new kind

The `Tool` CRD already has discriminated subtypes (`http`, `mcp`, `agent`, `team`, `builtin`). `inline` slots in as a sixth variant with its own typed sub-object `spec.inline`. The author surface is:

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Tool
metadata:
  name: csv-summarise
spec:
  type: inline
  description: Summarise a CSV — column types, row count, basic stats
  inputSchema:
    type: object
    properties:
      file: { type: string, description: "Path to the CSV file" }
    required: [file]
  inline:
    language: python   # optional; auto-detected from shebang
    source: |
      #!/usr/bin/env python
      import sys, json, pandas as pd
      args = json.loads(sys.argv[1])
      df = pd.read_csv(args["file"])
      print(df.describe().to_json())
```

**Why.** Inline tools are *tools*. Adding a separate kind (`InlineTool`, `Function`, `Script`) would split the agent author's mental model — "Tools come from one place, except inline tools, which come from another" — for no clear benefit. The discriminated-union shape is exactly what the existing `Tool` CRD already does for four different runtime models; this is the fifth.

**Alternative considered: new kind `InlineTool`.** Cleaner isolation, easier to remove later, mirrors what the `agent-skills` proposal did. Rejected because it adds a second attachment surface on `Agent` (or forces inline tools through a translator) and because the existing `Tool` CRD's discriminator is the closest fit in the codebase.

**Alternative considered: extend `Tool` with a `script` type instead of `inline`.** Slightly more accurate ("the tool is a script") but `inline` better captures the value prop versus the other types (which all delegate to *something external* — an HTTP endpoint, an MCP server, an agent, a team).

### Decision: One tool per CRD; no bundling

A `Tool` of `type: inline` is exactly one script with exactly one input schema. Multiple related scripts mean multiple `Tool` resources.

**Why.** Bundling was the `agent-skills` shape (one `Skill` containing many scripts) and it carried real cost: a `SKILL.md` to define the bundle, a discovery rule to map files to tools, an extraction rule to handle inline fences, a separate attachment surface on `Agent`. User testing didn't find any of that load-bearing. Without bundling, every one of those drops out and inline tools become "just tools that happen to be scripts".

**Cost accepted.** One Deployment per inline tool, even where two tools could have shared a pod. Mitigated entirely by scale-to-zero: idle tools cost nothing. Future work could pool same-language runners if this becomes a real problem in practice.

### Decision: Single multi-language runner image; per-tool dispatch by shebang/language

v1 ships **one** runner image, `ark-inline-runner:v1`, on an Alpine base, containing `bash` (5.x), `python@3.12` (as `python` / `python3`), and `node@20` (as `node`; `tsx` for `.ts`). Estimated size ≈ 150 MB.

The runner mounts the tool's `ConfigMap` at `/tool/source` and dispatches on first invocation:

```
   /tool/source first line starts with #!  ──►  exec the file directly,
                                                kernel honours the shebang
        │
        else use spec.inline.language:
          bash    ──►  bash /tool/source "$ARGS_JSON"
          python  ──►  python3 /tool/source "$ARGS_JSON"
          node    ──►  node /tool/source "$ARGS_JSON"
          ts      ──►  tsx /tool/source "$ARGS_JSON"
        │
        else (no shebang, no language)  ──►  default to bash
```

**Why a single image.** Pinning each tool to a language-specific image would mean three different images to maintain, three different reconciliation paths, and lookup logic in the controller. With one image, the controller writes the same PodSpec regardless of language and the dispatch is a few lines of shell. The cold-start cost is dominated by container startup once the image is cached on a node, not by the difference between a 50 MB and a 150 MB image.

**Alternative considered: per-language images.** Smaller per-tool footprint but multiplies maintenance and complicates the controller. Rejected.

**Alternative considered: language inferred *only* from shebang (no `language` field).** Cleaner — one source of truth — but breaks the no-shebang case (a bare `print("hi")` Python script). Adding `language` as an explicit override is one extra field for a noticeable UX improvement.

### Decision: JSON-on-`argv[1]` runtime contract

The runner serialises the tool's JSON arguments into a single string and passes it as `argv[1]`. Authors parse however their language wants:

```python
import sys, json
args = json.loads(sys.argv[1])
```

```bash
FILE=$(jq -r .file <<< "$1")
```

```javascript
const args = JSON.parse(process.argv[2]);
```

**Why.** Three options were on the table — JSON-on-`argv[1]`, JSON-on-stdin, schema-to-named-flags. JSON-on-`argv[1]` is the simplest path that works uniformly for every language in the runner: no argparse, no flag-to-property mapping, no nested-object edge cases, no extra read step. Trivial in bash/python/node.

**Alternative considered: JSON on stdin.** Cleaner for very large payloads but more boilerplate for the common case (`cat | jq` vs `jq <<< "$1"`). Rejected for v1; could be added as an opt-in mode later.

**Alternative considered: named CLI flags from `inputSchema`.** Feels natural for shell scripts (`--file=foo.csv --limit=10`) but breaks down for nested objects, arrays, and rich types. The runner would need a schema-aware flag synthesiser; authors would learn a Python-`argparse`-shaped surface that isn't quite argparse. Rejected.

### Decision: Per-tool sandbox; scale-to-zero by default

Each inline `Tool` reconciles to its own `Deployment` (`replicas: 0` initially), `Service`, `ServiceAccount`, `NetworkPolicy` (deny-all egress), `ConfigMap` (the script body, content-hashed name), and is owned by the `Tool` for GC cascade.

A new `inlinetoolactivator` subsystem in the operator (HTTP front-end, ~300 LOC) intercepts the first request to an inline tool's `Service`, scales the `Deployment` `0 → 1`, waits for readiness, and forwards. After `spec.inline.idleTimeout` (default 60 s) of no traffic, the controller scales back to `0`.

**Why per-tool, not pooled.** Strong isolation from day one. A misbehaving script can't tamper with another tool's state, exhaust another tool's memory, or read another tool's secrets. The cost (more Deployments) is bounded by scale-to-zero.

**Why custom, not Knative / KEDA.** Knative is a heavy dependency for the cluster operator; KEDA is closer but still pulls in CRDs and event sources we don't otherwise use. The scaling behaviour we actually need is trivial — 0 ↔ 1, no autoscaling beyond that for v1.

**Alternative considered: pool same-language runners.** One long-lived python pod per namespace, scripts injected via the request path. Faster cold start; loses per-tool isolation (a script can read sibling scripts' state in memory). Rejected for v1; revisitable.

### Decision: Inline tools surface to the executor as MCP tools

When the controller reconciles an inline `Tool`, it synthesises an `MCPServer` (or an equivalent internal record) whose endpoint points at the tool's `Service`. The execution engine's path for "call a tool" is unchanged: the same MCP client invokes inline tools as invokes author-built MCP tools, with the same tracing, auth, and audit hooks.

**Why.** Reuses every line of the existing MCP machinery. The executor doesn't grow a new code path; only the controller has to know that `type: inline` materialises infrastructure.

**Alternative considered: direct executor → inline-runner HTTP.** Skips the synthetic MCPServer step. Cheaper in object count but forces the executor to learn a second tool-call protocol. Rejected — the synthetic MCPServer is cheap and keeps the executor uniform.

### Decision: Security defaults are non-negotiable in v1

Every inline tool pod runs with:

- `runAsNonRoot: true`, `runAsUser: 65532`
- `readOnlyRootFilesystem: true`
- `capabilities.drop: [ALL]`
- `allowPrivilegeEscalation: false`
- `automountServiceAccountToken: false`
- `seccompProfile.type: RuntimeDefault`
- `NetworkPolicy` deny-all egress
- No mounted secrets

There is no `spec.inline.security` knob in v1. If an author needs to relax any of these (egress to an allow-listed host, a mounted secret, a Kubernetes role), they author an `MCPServer` instead. This keeps the surface a reviewer has to audit when approving inline tools to *just the script* — not the script plus a Kubernetes-permissions diff.

**Alternative considered: ship the relax-knobs from the start (`spec.inline.network.egress`, `spec.inline.secrets`).** Faster path to real-world use cases. Rejected for v1 because we'd be designing the relaxation surface without enough evidence about what authors actually need. Re-adding these later is purely additive.

## Risks

- **Cold-start latency.** Scale-from-zero pod start is on the order of seconds, depending on image cache state. First invocation of an inline tool will feel slower than an HTTP tool. Mitigation: keep the runner image tight; document the latency in the user guide; consider `spec.inline.keepWarm: true` for v1.1.
- **Per-tool pod sprawl.** A namespace with 50 inline tools has 50 Deployments. They are mostly at 0 replicas, but each consumes etcd objects and a `Service` IP. Mitigation: scale-to-zero handles compute cost; if object count becomes a problem, pooling is a backwards-compatible v1.5 change.
- **Author surprises with `argv[1]` quoting.** Bash authors will discover the joys of JSON-in-an-argv-element. Mitigation: the docs page leads with `jq -r .field <<< "$1"` and the sample tools use it.
- **Insufficient stderr surfacing.** Tool errors return the last 4 KiB of stderr — debuggable but not great. Mitigation: per-tool pod logs are accessible via standard `kubectl logs`; the user-guide debugging section calls this out.
- **Drift from `agent-skills`.** The earlier change still has open tasks and an open PR. Mitigation: this proposal is explicit about superseding; once approved, the `agent-skills` change is withdrawn (archived as superseded), and PR #1990 is either rebased onto this scope or closed.

## Open Questions

- **`keepWarm` on day one or v1.5?** Adding `spec.inline.keepWarm: true` is a few lines and would address the cold-start risk for hot tools. Punting for now keeps v1 tight; revisit before merging the operator change.
- **`spec.inline.image` escape hatch.** Should v1 quietly support a custom runner image (`spec.inline.image: my-registry/foo:bar`) as an undocumented relief valve? Leaning *no* — if you need a custom image, you have an MCPServer.
- **Resource limits.** v1 defaults to `cpu: 500m`, `memory: 256Mi`. Are these the right starting numbers, and do we expose `spec.inline.resources` from day one? Leaning yes on exposure (matches the rest of Ark) but the defaults are a guess.
- **TypeScript dispatch.** `tsx` adds ~50 MB to the runner image. Real demand, or drop TS support in v1?
- **What happens to PR #1990 and the `agent-skills` change?** Concrete migration plan: rebase #1990 to the new scope, or close it and open a fresh PR off this branch?
