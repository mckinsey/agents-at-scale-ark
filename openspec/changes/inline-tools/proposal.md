## Why

Adding even trivial custom logic to an Ark agent today requires standing up a full `MCPServer` — write an MCP server in Python or Node, containerise it, push to a registry, author an `MCPServer` CRD, author a `Tool` CRD, attach the tool to the `Agent`. That's ~1 hour of scaffolding and a permanent registry dependency for what is often 20 lines of glue. `MCPServer` remains the right tool when logic is large, streaming, or has real external auth; **inline tools are the on-ramp below that threshold.**

This change supersedes the broader `agent-skills` proposal. User testing of the skills mockup showed that the single most-valued capability was the "write a Python or bash function inline, attach it to an agent, no image, no registry" path. The wider Claude-Code shape (`SKILL.md` prose, lazy `load_skill` catalog, drop-in import of Claude-Code skill folders) carried complexity that testers did not engage with. `inline-tools` keeps the high-value primitive and drops the rest.

## What Changes

- **Extend the existing `Tool` CRD** (`ark.mckinsey.com/v1alpha1`) with a new `type: inline` value alongside `http`, `mcp`, `agent`, `team`, `builtin`. No new kind; no new attachment field on `Agent`. Inline tools attach via the existing `Agent.spec.tools` like any other tool.
- **New `spec.inline` sub-object** on `Tool`, populated only when `type == inline`:
  - `source` (string, required) — the script body, served verbatim into the runner pod.
  - `language` (string, optional) — one of `bash`, `python`, `node`, `ts`. When omitted, the controller infers from the script's shebang (if the first line is `#!`) or its absence (defaults to `bash`).
- **Reuse `spec.inputSchema` as-is.** The existing JSON-schema field tells the model the tool's argument shape. No new schema field is introduced.
- **Per-tool runtime infrastructure.** A new controller path reconciles each `Tool` with `type: inline` into a `ConfigMap` (script body), a `ServiceAccount`, a `NetworkPolicy` (deny-all egress by default), a `Deployment` (`replicas: 0` by default), and a `Service`. Each inline tool is a fully isolated sandbox.
- **New scale-to-zero activator** in the operator: a lightweight HTTP front-end for each inline tool's `Service` that scales the `Deployment` `0 → 1` on first invocation, forwards once ready, and scales back to `0` after an idle window (default 60 s). Custom, ~300 LOC, not Knative.
- **One multi-language runner image** published by Ark: `ark-inline-runner:v1`, Alpine-based (~150 MB), containing `bash`, `python@3.12`, and `node@20`. The image mounts the tool's `ConfigMap` at `/tool/source`, dispatches by shebang or by `language`, and exposes a single MCP-shaped HTTP endpoint that the executor calls.
- **Runtime contract: JSON on `argv[1]`.** The runner serialises the tool's JSON arguments into a single string and passes it as `argv[1]`. Authors parse with `json.loads(sys.argv[1])` (Python), `jq -r .field <<< "$1"` (bash), `JSON.parse(process.argv[2])` (node). `stdout` is the tool result (trimmed to 256 KiB); a non-zero exit code returns a tool error including the last 4 KiB of `stderr`.
- **Security defaults from the first commit.** Non-root user (uid 65532), read-only root filesystem, all capabilities dropped, no service-account token, `seccompProfile: RuntimeDefault`, deny-all egress. All defaults are opt-in to relax via the existing Tool annotations / future `spec.inline.security` fields (out of v1 scope).
- **Executor integration is uniform.** From the executor's point of view, an inline tool is just a tool that resolves to an MCP endpoint. The controller wires the existing MCP plumbing (auth, tracing, audit, broker) to the per-tool `Service`. No new code path in the execution engine.
- **Dashboard UX (mockup ships in a separate PR).** The existing Tool editor grows one new option in its Type dropdown (`Inline`) and two conditional fields when it's selected: `Language` and `Source`. Inline tools show up in the existing tools list with a small `(inline · python)` badge.

## Capabilities

### New Capabilities

- `inline-tools`: the `type: inline` extension to the `Tool` CRD, the per-tool reconciliation path, the scale-to-zero activator, the single multi-language runner image, and the JSON-on-`argv[1]` runtime contract.

### Modified Capabilities

- None. The `Tool` CRD already supports discriminated subtypes (`http`, `mcp`, `agent`, `team`, `builtin`); `inline` is purely additive. `Agent.spec.tools` is unchanged. The execution engine is unchanged — inline tools are reached via the existing MCP plumbing.

## Impact

- `ark/api/v1alpha1/tool_types.go` — extend the `Type` enum (`http;mcp;agent;team;builtin;inline`), add `Inline *InlineSpec` to `ToolSpec`, declare `InlineSpec { Source string; Language string }`.
- `ark/api/v1alpha1/tool_webhook.go` (or equivalent) — validate `type == inline` requires non-empty `spec.inline.source`, and `spec.inline.language ∈ {"", "bash", "python", "node", "ts"}`. Reject if `type != inline` and `spec.inline` is set.
- `ark/config/crd/bases/…_tools.yaml` — generated CRD manifest update.
- `ark/internal/controller/tool_controller.go` — new reconciliation branch for `type: inline`: owns `ConfigMap`, `ServiceAccount`, `NetworkPolicy`, `Deployment` (`replicas: 0`), `Service`, and the executor-facing MCP-shaped wiring.
- `ark/internal/inlinetoolactivator/…` — new subsystem (~300 LOC) for scale-to-zero.
- `ark/images/inline-runner/` — Dockerfile for `ark-inline-runner:v1` plus the runner program (MCP HTTP server + per-script dispatch + JSON-on-`argv[1]` argv shaping).
- `ark/dist/chart/templates/crd/…_tools.yaml` — Helm sync of the regenerated CRD.
- `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/…` — regenerate types for the extended Tool shape.
- `services/ark-api/…` — Tool CRUD endpoints accept the new `inline` type and validate the new fields. (Most of this comes for free via OpenAPI regeneration.)
- `services/ark-dashboard/…` — Tool editor learns the `Inline` option; tools list gains the language badge. Follow-up PR; not part of the operator change itself.
- `tools/ark-cli/…` — `ark tool create --inline --source-file ./foo.py …` convenience flag (nice-to-have, not required for v1).
- `docs/` — new user-guide page "Inline tools — write a function, skip the MCP server".
- `samples/inline-tools/` — two or three illustrative tools (CSV summary, runbook triage, copybook extractor).

v1 deliberately scopes out: bundling (multiple scripts per resource — author multiple `Tool` resources), languages outside the default runner image (Go, Rust, Ruby — drop back to `MCPServer`), per-tool custom runner images, OCI / Git script sources, cross-namespace references, streaming tool responses, and reference-file mounts (a script that needs static data files belongs in `MCPServer`).
