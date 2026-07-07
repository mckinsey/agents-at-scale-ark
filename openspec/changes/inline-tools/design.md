## Context

See the proposal for motivation. This design recreates the earlier `inline-tools` proposal (PR #2116, issue #1161), refreshed against the current codebase. Two facts about the current state shape the design:

1. **The `Tool` CRD already has discriminated subtypes** (`http`, `mcp`, `agent`, `team`, `builtin`) selected by `spec.type`, each with its own typed sub-object. Adding `inline` is a natural sixth variant.
2. **The `Tool` controller (`ark/internal/controller/tool_controller.go`) is status-only today** — it validates configuration and sets `status.state: Ready`, owning zero child objects. Inline tools would be the first `Tool` subtype to reconcile real Kubernetes infrastructure (Deployment, Service, ConfigMap, NetworkPolicy). This is the single largest new pattern the change introduces.

Three hard constraints carry forward from the original proposal:

1. **The wire-level invocation path must reuse Ark's existing MCP plumbing** (`mcp-server-resolution`, `mcp-auth-token-injection`). Auth, audit, tracing, and broker integration are not worth reinventing.
2. **The security boundary must hold from the first commit.** Inline tools run user-authored code; the default posture has to be defensible without authors thinking about it.
3. **The CRD shape must be additive to today's `Tool`.** No new kind, no new attachment field on `Agent`. An inline tool should be indistinguishable from an HTTP or MCP tool from the agent author's point of view.

## Goals / Non-Goals

**Goals**

- A custom tool is authorable in a single YAML file (or via the dashboard) and deployable with no image build, no registry, and no additional CRDs authored by hand.
- Inline tools attach to agents via the existing `Agent.spec.tools` — agent authors learn no new concept.
- An agent can attach many inline tools cheaply; attached-but-unused tools cost zero pods (scale-to-zero) and add nothing to the model's context beyond their tool descriptions.
- Existing MCP/Tool tracing, auditing, and observability apply to inline-tool invocations unchanged.
- The default security posture (no egress, no secrets, read-only root, non-root user, no Kubernetes token) is strong enough that an operator can trust an inline tool authored by a teammate without auditing YAML for boilerplate hardening.
- The full path works end to end: create in the dashboard → persist as a `Tool` in the cluster → attach to an agent → invoke during a query.

**Non-Goals**

- Bundling multiple scripts into one resource. Three related scripts means three `Tool` resources.
- The full Claude-Code skill shape (`SKILL.md` + frontmatter + lazy-load catalog). Out of scope; future work if demand materialises.
- Custom runner images in v1. Authors pick `bash`, `python@3.12`, or `node@20` from the built-in image.
- **Third-party dependencies.** No `pip`/`npm` install mechanism; deny-all egress blocks runtime fetches anyway. Scripts use each interpreter's standard library only (plus `jq`/coreutils for bash). Needing packages means an `MCPServer`.
- A marketplace publishing story for inline tools. v1 is `kubectl apply` / dashboard and a sample directory.
- Cross-namespace tool references, streaming tool responses, OCI/Git/HTTP source URLs, and reference-file mounts. Anything needing these is an `MCPServer`.

## Where scripts run (and don't)

Inline tools are a *harness-side* primitive — neither Anthropic's API nor any other provider has a native concept here. What models supply is **tool calling**; inline tools are implemented on top of that. From the model's side the flow is identical to any MCP tool: the model picks a tool, a tool call comes back, the executor invokes it. The only difference is *where* the executor sends the call — to a per-tool Ark-managed runner pod instead of an author-built MCP server. The script always runs in a per-tool sandbox pod inside the cluster, regardless of the agent's model provider (Anthropic, OpenAI, Azure OpenAI, Bedrock, Gemini).

## Threat model

v1 makes explicit assumptions about who supplies the script and who supplies its inputs, and what each control covers:

- **Script authorship is restricted at admission.** The admission gate (see the decision below) limits creation of a `type: inline` Tool to identities holding a dedicated permission; generic `create tools` RBAC is not sufficient. The design therefore assumes the script author is an authorised subject, and treats broadening that set as an explicit administrative action.
- **Invocation inputs are untrusted.** Tool arguments are model-generated and may be adversarial (e.g. prompt-injected) regardless of who authored the script. The runner passes them as data (JSON on `argv[1]`); validating and sanitising input, and bounding output size and format, are the script author's responsibility.
- **Escape by an authorised author is out of scope.** Pod hardening (non-root, read-only root, dropped capabilities, deny-all egress, PID limit) bounds the blast radius of a script that misbehaves at runtime, but does not prevent a container escape attempted by the author of the script — that requires a kernel-level sandbox (`runtimeClass` such as gVisor or Kata), which v1 does not mandate. The admission gate, not pod hardening, is the control that bounds who can author a script; a cluster requiring defence against authorised-but-malicious authors configures a sandboxing `runtimeClass` out of band.

## Decisions

### Decision: Extend the existing `Tool` CRD; do not introduce a new kind

`inline` slots in as a sixth `spec.type` variant with its own typed sub-object `spec.inline`. Author surface:

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
    language: python   # required
    source: |
      import sys, json, csv, statistics
      args = json.loads(sys.argv[1])
      with open(args["file"], newline="") as f:
          rows = list(csv.DictReader(f))
      numeric = {
          k: [float(r[k]) for r in rows if r[k].replace(".", "", 1).isdigit()]
          for k in (rows[0].keys() if rows else [])
      }
      stats = {
          k: {"count": len(v), "mean": statistics.mean(v)}
          for k, v in numeric.items() if v
      }
      print(json.dumps({"rows": len(rows), "stats": stats}))
```

**Why.** Inline tools are *tools*. A separate kind (`InlineTool`, `Function`, `Script`) would split the agent author's mental model and add a second attachment surface on `Agent`. The discriminated-union shape is exactly what the `Tool` CRD already does for four runtime models; this is the fifth.

**Alternative — new kind `InlineTool`.** Cleaner isolation, easier to remove later. Rejected: forces a second attachment surface on `Agent` or a translator, for no clear benefit.

**Alternative — a `script` type instead of `inline`.** Slightly more accurate but `inline` better captures the value prop versus the other types, which all delegate to *something external*.

### Decision: One tool per CRD; no bundling

A `Tool` of `type: inline` is exactly one script with exactly one input schema. Multiple related scripts mean multiple `Tool` resources.

**Why.** Bundling carries real cost — a manifest to define the bundle, a file-to-tool discovery rule, a separate attachment surface. User testing of the earlier skills mockup did not find grouping load-bearing. Dropping it makes inline tools "just tools that happen to be scripts."

**Cost accepted.** One `Deployment` per inline tool even where two could share a pod. Mitigated by scale-to-zero: idle tools cost nothing. Pooling same-language runners is a backwards-compatible future change if object count becomes a real problem.

### Decision: Single multi-language runner image; per-tool dispatch by required `language`

v1 ships one image, `ark-inline-runner:v1`, Alpine-based (~150 MB), containing `bash` (5.x), `python@3.12`, `node@20`, and `tsx` for TypeScript. It mounts the tool's `ConfigMap` at `/tool/source` and dispatches solely on the required `spec.inline.language`:

```
spec.inline.language:  bash  ──► bash /tool/source <args-json>
                       python ──► python3 /tool/source <args-json>
                       node   ──► node /tool/source <args-json>
                       ts     ──► tsx /tool/source <args-json>
```

`language` is **required**. The runner never inspects the source for a shebang; the declared `language` is the only thing that selects the interpreter.

**Why required, not shebang-inferred.** A shebang plus an explicit `language` are two sources of truth: the shebang silently overrides the field, and "neither present" falls back to bash — the least-visible default. Requiring `language` removes the ambiguity and lets the controller pick a per-language image at reconcile time (precondition for the alternative below). Shebang's only unique power — interpreter flags — is unneeded in v1.

**Why one image.** Per-language images mean three images to maintain, three reconciliation paths, and lookup logic in the controller. One image means the controller writes the same PodSpec regardless of language; dispatch is a few lines of shell. Cold start is dominated by container startup once the image is cached, not by image size delta.

**Alternative — per-language images.** Smaller footprint and less attack surface per pod, multiplied maintenance. Deferred, not rejected: requiring `language` keeps this door open as a backwards-compatible follow-up.

**TypeScript.** The runner includes `tsx` so `language: ts` runs TypeScript directly, matching the original proposal. The CRD `language` enum lists `bash`, `python`, `node`, `ts` in v1. Cost: `tsx` adds ~50 MB to the image.

### Decision: JSON-on-`argv[1]` runtime contract

The runner serialises the tool's JSON arguments into a single string on `argv[1]`. Authors parse however their language wants:

```python
args = json.loads(sys.argv[1])
```
```bash
FILE=$(jq -r .file <<< "$1")
```
```javascript
const args = JSON.parse(process.argv[2]);
```

**Why.** Simplest path that works uniformly across every language in the runner: no argparse, no flag-to-property mapping, no nested-object edge cases, no extra read step.

**Alternative — JSON on stdin.** Cleaner for very large payloads, more boilerplate for the common case. Rejected for v1; addable as an opt-in mode later.

**Alternative — named CLI flags from `inputSchema`.** Natural for shell scripts but breaks on nested objects/arrays and forces authors to learn a pseudo-argparse surface. Rejected.

### Decision: Per-tool sandbox; scale-to-zero by default

Each inline `Tool` reconciles to its own `Deployment` (`replicas: 0` initially), `Service`, `ServiceAccount`, `NetworkPolicy` (deny-all egress), and `ConfigMap` (script body, stable name `<tool>-source`), all owned by the `Tool` for GC cascade. The source hash lives in a pod-template annotation (`ark.mckinsey.com/inline-source-hash`), not in the ConfigMap name — see the ConfigMap decision below. A new `inlinetoolactivator` subsystem in the operator (HTTP front-end, ~300 LOC) intercepts the first request, scales the `Deployment` `0 → 1`, waits for readiness, and forwards. After `idleTimeout` (default 60s) of no traffic, the controller scales back to `0`.

**Why per-tool, not pooled.** Strong isolation from day one — a misbehaving script cannot tamper with another tool's state, exhaust its memory, or read its secrets. The cost (more Deployments) is bounded by scale-to-zero.

**Why custom, not Knative/KEDA.** Knative is a heavy cluster dependency; KEDA still pulls in CRDs and event sources we don't otherwise use. The behaviour we need is trivial — 0 ↔ 1, no autoscaling beyond that in v1.

**Alternative — pool same-language runners.** One long-lived pod per language per namespace, scripts injected per request. Faster cold start; loses per-tool isolation. Rejected for v1; revisitable.

**New-pattern note.** Because the current `Tool` controller owns no child objects, this decision introduces owner-reference cascade, an in-place source ConfigMap with rollout-on-change, and readiness gating into a controller that previously only set status. The reconciler branch is gated strictly on `spec.type == inline` so the other five tool types keep their status-only path unchanged.

### Decision: One in-place source ConfigMap; hash in the pod-template annotation

The script body lives in a single ConfigMap with a stable name (`<tool>-source`) that the controller updates in place on every source edit. The content hash is written to the pod template as an annotation (`ark.mckinsey.com/inline-source-hash: <hash>`), so editing the source changes the pod template and triggers a rollout — the standard Helm `checksum/config` pattern.

**Why not a content-hashed name (`<tool>-<hash>`).** A hashed name mints a new ConfigMap on every source edit and orphans the old one — owner-reference GC only fires when the `Tool` is deleted, so stale ConfigMaps accumulate. The in-place ConfigMap plus the annotation gives identical rollout-on-change with nothing to orphan.

### Decision: Inline tools surface to the executor as MCP tools

When the controller reconciles an inline `Tool`, it synthesises an MCP-shaped endpoint (a synthesised `MCPServer` record or equivalent) pointing at the tool's `Service`. The executor's "call a tool" path is unchanged: the same MCP client, driven by `mcp-server-resolution` (tools grouped by MCPServer, resolved connection info, original tool names), invokes inline tools exactly as it invokes author-built MCP tools, with the same tracing, auth (`mcp-auth-token-injection`), and audit hooks.

**Why.** Reuses every line of existing MCP machinery. The executor grows no new code path; only the controller knows that `type: inline` materialises infrastructure.

**Alternative — direct executor → runner HTTP.** Skips the synthetic MCPServer, cheaper in object count, but forces the executor to learn a second tool-call protocol. Rejected — the synthetic MCPServer is cheap and keeps the executor uniform.

### Decision: Security defaults are non-negotiable in v1

Every inline tool pod runs with `runAsNonRoot: true`, `runAsUser: 65532`, `readOnlyRootFilesystem: true`, `capabilities.drop: [ALL]`, `allowPrivilegeEscalation: false`, `automountServiceAccountToken: false`, `seccompProfile.type: RuntimeDefault`, a deny-all-egress `NetworkPolicy`, and no mounted secrets.

**Containment beyond cpu/memory.** The `cpu: 500m` / `memory: 256Mi` limits don't stop two failure modes:

- **Fork bomb.** PIDs are a node-level resource, so an unbounded `fork()` loop can exhaust PIDs for other pods on the node. A **PID limit** (default `128`) confines a runaway script to itself.
- **Hung script.** The idle/activation timeouts govern 0↔1 scaling, not a single invocation — nothing kills a script that never returns. The runner enforces a **per-invocation execution timeout** (default `30s`), killing the process group and returning a tool error on expiry.

Both defaults are fixed in v1.

There is no `spec.inline.security` knob in v1. An author needing to relax any of these (egress to an allow-listed host, a mounted secret, a Kubernetes role) authors an `MCPServer` instead. This keeps the surface a reviewer audits when approving an inline tool to *just the script* — not the script plus a Kubernetes-permissions diff.

**Alternative — ship relax-knobs from the start.** Faster path to real use cases. Rejected for v1: we would be designing the relaxation surface without evidence of what authors need, and re-adding it later is purely additive.

### Decision: Verify NetworkPolicy enforcement rather than assume it

The deny-all-egress `NetworkPolicy` restricts traffic only if the cluster CNI enforces NetworkPolicy. Some CNIs (or CNI configurations) accept the object and ignore it — the policy exists in the API but does nothing, and the egress guarantee silently evaporates.

Ark therefore does not assume enforcement. When inline tools are enabled (`inlineTools.enabled`), a preflight verifies it — applying a deny-all policy to a canary pod and confirming an outbound connection is actually blocked — and fails enablement loudly, naming the CNI, if egress is not blocked. A negative e2e test asserts that a real inline script's outbound call is denied, so a regression in enforcement is caught in CI rather than in production.

**Why fail loud, not warn.** A silently non-enforced egress policy is worse than none: operators believe scripts cannot reach the network and extend trust accordingly. Failing enablement forces the gap to be closed (an enforcing CNI, or an explicit decision to run without egress isolation) before any inline tool runs.

### Decision: Gate `type: inline` at admission, behind a dedicated permission and an off-by-default flag

Every other `Tool` type registers config pointing at something external; `type: inline` embeds code Ark runs in a pod. Creating one is therefore arbitrary code execution in the namespace — a different privilege from creating an `http` or `mcp` tool. Kubernetes RBAC cannot express that difference: it authorises on resource + verb, so `create tools` cannot distinguish `inline` from `http`. On upgrade, everyone already holding `create tools` (developer Roles, CI service accounts, dashboard users) would silently gain code execution.

Two controls, both in the validating webhook that already validates inline tools:

1. **Dedicated permission via SubjectAccessReview.** Admitting a `Tool` with `type == inline`, the webhook issues a `SubjectAccessReview` for the requesting user (from the AdmissionReview `userInfo`) against a dedicated verb/resource — `use` on `inlinetools.ark.mckinsey.com`, mirroring the PodSecurityPolicy `use` pattern. Denied → admission rejected. Admins grant this via RBAC, independent of `create tools`.
2. **Off-by-default feature flag.** A cluster-level flag (`inlineTools.enabled`, default `false`) gates the whole capability. Disabled → the webhook rejects every `type: inline` Tool regardless of permission.

**Why admission, not execution time.** The check must run while the author's identity is still in the request. By the time the script runs, the work is driven by the controller's own service account — the original user has left the path. Admission is the last point where "who asked" exists.

**Why a flag on top of the permission.** Defense in depth: an upgrade alone changes nothing until an operator opts in. Enabling the flag is the deliberate moment they accept "this cluster runs inline code, and I've granted the permission to the right subjects."

### Decision: Dashboard authoring reuses the existing Tool editor patterns

The ark-dashboard Tool editor (`components/editors/tool-editor.tsx`) is a `Dialog` + react-hook-form + zod form that already does per-type conditional fields via `.refine()` (e.g. `httpUrl` is required only when `type == http`). Inline tools slot into that shape:

- **No dedicated entry point.** Inline is authored through the normal "Add Tool" flow by selecting `Inline` in the Type dropdown — first-class in that it uses the same path as every other tool, not a separate button. (An earlier iteration added a dedicated "New inline tool" action; dropped as redundant once inline is a first-class option in the shared flow.)
- **Type dropdown** gains an `Inline` option alongside the existing curated subset (`http`, `mcp`, `agent`, `team`). The dropdown is already narrower than the CRD enum, so adding one item is routine.
- **`Source` field** is a plain expandable `<Textarea>` (monospace), reusing the same expand/collapse + character/line-counter treatment as the existing `Input Schema` and `Annotations` fields. Shown only when `type == inline`. It is required in that case.
- **`Language` selector** offers `Bash`, `Python`, `Node`, `TS` and is **required** — there is no `Auto` option, because `language` is now a required CRD field with no shebang inference. The selector has no default value; the author must pick one before submitting.
- **Client-side validation mirrors the webhook** via zod `.refine()`: when `type == inline`, `source` must be non-empty and ≤ 64 KiB, and `language` must be one of the four allowed values. This is UX-only fast feedback; the webhook remains the authority.
- **`inputSchema` stays required for all types**, inline included. The model needs the argument shape; a script that genuinely takes no arguments still declares an empty-object schema. Relaxing this is out of scope.
- **Tools list badge.** `components/rows/tool-row.tsx` renders a small `(inline · <language>)` badge so inline tools are visually distinct in the list.

**Why a plain `<Textarea>`, not a code editor.** The dashboard has `react-syntax-highlighter` (display-only) but no editable code-editor dependency (no Monaco/CodeMirror). A textarea matches the existing `Input Schema` field exactly, adds zero dependencies, and ships fastest. Syntax highlighting and line numbers are a v1.1 UX upgrade, not a v1 blocker for the "write twenty lines, attach, run" flow.

**Phasing: dashboard v0 first.** The dashboard authoring slice (CRD + webhook + ark-api + editor) is Phase 1 in `tasks.md`, delivered before the per-tool runtime (Phase 2). This validates the PoC-building experience early, per Nab's request. The trade-off: at the end of Phase 1 an inline tool persists and is authorable but does **not execute yet** (no runner/activator). To avoid the UI misleading users, the Phase 1 controller sets an honest non-`Ready` status (e.g. `Pending — inline runtime not installed`) until Phase 2 lands. A user-facing "prototype / not yet executable" hint in the editor is optional but recommended for the v0 demo.

**Alternative — add Monaco/CodeMirror.** Better authoring UX (highlighting, line numbers, indentation). Rejected for v1: heavy new dependency for a PoC-phase on-ramp; the value prop is "skip the container," not "best-in-class code editor."

**Alternative — textarea + read-only highlighted preview** (via the existing `react-syntax-highlighter`). A middle ground, but a two-pane dialog is more UI surface than v1 needs. Revisitable.

## Risks / Trade-offs

- **Cold-start latency** → Scale-from-zero pod start is on the order of seconds depending on image-cache state; first invocation feels slower than an HTTP tool. Mitigation: keep the runner image tight, document the latency, consider `spec.inline.keepWarm` in v1.1.
- **Per-tool pod sprawl** → A namespace with 50 inline tools has 50 Deployments (mostly at 0 replicas) plus 50 Service IPs and etcd objects. Mitigation: scale-to-zero handles compute cost; pooling is a backwards-compatible follow-up if object count bites.
- **`argv[1]` quoting surprises for bash authors** → JSON-in-an-argv-element is unfamiliar. Mitigation: docs lead with `jq -r .field <<< "$1"`; sample tools use it.
- **Insufficient stderr surfacing** → Tool errors return only the last 4 KiB of stderr. Mitigation: per-tool pod logs are reachable via `kubectl logs`; the debugging doc calls this out.
- **New reconciliation pattern in a status-only controller** → The inline branch adds owner-reference GC, in-place ConfigMap updates with an annotation-driven rollout, and readiness gating to a controller that had none. Mitigation: gate the entire branch on `spec.type == inline`; cover child-object creation and delete-cascade with envtest before wiring the activator.
- **Runner image supply chain** → A single Ark-published image runs all inline tool code. Mitigation: publish via the existing signed image-publish workflow; pin base image digest; the deny-all-egress default limits blast radius of a compromised script.

## Migration Plan

Purely additive — no migration of existing resources.

- **Deploy order:** publish `ark-inline-runner:v1` → ship the CRD extension + webhook (validation + admission gate; inert because `inlineTools.enabled` defaults `false`) → ship the reconciler + activator → ship ark-api/dashboard surface. Upgrading changes nothing until an operator flips the flag and grants the dedicated permission.
- **Backwards compatibility:** existing `Tool` resources (`http`/`mcp`/`agent`/`team`/`builtin`) are untouched; their controller path is unchanged. The new enum value and `spec.inline` field are optional.
- **Rollback:** deleting all inline `Tool` resources GCs their owned infrastructure via owner references. Reverting the operator image removes the reconciler/activator; leftover inline `Tool` resources become inert (status-only) rather than breaking the controller. Reverting the CRD enum is only safe once no inline `Tool` resources remain.

## Open Questions

- **`keepWarm` on day one or v1.1?** `spec.inline.keepWarm: true` is a few lines and addresses cold-start for hot tools. Leaning v1.1 to keep v1 tight.
- **Resource / containment defaults.** v1 defaults `cpu: 500m`, `memory: 256Mi`, PID limit `128`, and per-invocation execution timeout `30s`, none exposed via `spec.inline`. Are these the right numbers (esp. `30s` vs longer-running glue, and `128` PIDs vs interpreters that spawn helper processes), and should any become configurable in v1?
- **Idle timeout configurability.** 60s default is hard-coded in v1. Expose `spec.inline.idleTimeout` now or later?
- **Synthetic MCPServer visibility.** Should the synthesised MCP record be a real `MCPServer` object (visible in the dashboard/list) or an internal-only record? Real object is more transparent but clutters the MCPServer list with machine-generated entries.
