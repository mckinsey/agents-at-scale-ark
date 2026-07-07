## Why

Adding even trivial custom logic to an Ark agent today requires standing up a full `MCPServer`: write an MCP server in Python or Node, containerise it, push to a registry, author an `MCPServer` CRD, author a `Tool` CRD, attach the tool to the `Agent`. That is roughly an hour of scaffolding plus a permanent registry dependency for what is often twenty lines of glue. During the demo/PoC phase this overhead blocks users from getting an end-to-end agent working quickly (issue #1161).

`MCPServer` remains the right tool when logic is large, streaming, or has real external auth. Inline tools are the on-ramp below that threshold: write a short script inline, attach it to an agent, no image, no registry. This change recreates and supersedes the earlier `inline-tools` proposal (PR #2116), refreshed against the current codebase.

## What Changes

- **Extend the existing `Tool` CRD** (`ark.mckinsey.com/v1alpha1`) with a new `type: inline` value alongside `http`, `mcp`, `agent`, `team`, `builtin`. No new kind; no new attachment field on `Agent`. Inline tools attach via the existing `Agent.spec.tools` like any other tool.
- **New `spec.inline` sub-object** on `Tool`, populated only when `type == inline`:
  - `source` (string, required, ≤ 64 KiB) — the script body, served verbatim into the runner pod.
  - `language` (string, required) — one of `bash`, `python`, `node`, `ts`. Selects the interpreter directly; there is no shebang inference and no implicit default.
- **Reuse `spec.inputSchema` as-is** to describe the tool's argument shape to the model. No new schema field.
- **Per-tool runtime infrastructure.** A new controller path reconciles each inline `Tool` into a `ConfigMap` (script body, stable name `<tool>-source`, updated in place), `ServiceAccount`, `NetworkPolicy` (deny-all egress), `Deployment` (`replicas: 0` by default), and `Service`. Source edits roll out via a pod-template hash annotation, so no stale ConfigMaps accumulate. Each inline tool is a fully isolated sandbox.
- **Scale-to-zero activator** in the operator: a lightweight HTTP front-end that scales an inline tool's `Deployment` `0 → 1` on first invocation, forwards once ready, and scales back to `0` after an idle window (default 60s). Custom (~300 LOC), not Knative/KEDA.
- **One multi-language runner image** published by Ark (`ark-inline-runner:v1`, Alpine-based), containing `bash`, `python@3.12`, `node@20`, and `tsx`. It mounts the tool's `ConfigMap` at `/tool/source`, dispatches solely by the required `language` (no shebang inspection), and exposes a single MCP-shaped HTTP endpoint.
- **Runtime contract: JSON on `argv[1]`.** The runner serialises the tool's JSON arguments into one string on `argv[1]`. `stdout` is the tool result (trimmed to 256 KiB); a non-zero exit returns a tool error including the last 4 KiB of `stderr`. A per-invocation execution timeout (default 30s) kills a hung script and returns a tool error.
- **Security defaults from the first commit.** Non-root (uid 65532), read-only root filesystem, all capabilities dropped, no service-account token, `seccompProfile: RuntimeDefault`, deny-all egress, no mounted secrets, and a pod PID limit (default 128) so a fork bomb cannot exhaust node-level PIDs. No relaxation knobs in v1.
- **Executor integration is uniform.** The controller synthesises an MCP endpoint pointing at the per-tool `Service`, so the executor reaches inline tools through the existing MCP resolution and auth path (`mcp-server-resolution`). No new code path in the execution engine.
- **First-class dashboard authoring (v0, phased first).** `ark-api` accepts the new `inline` type and fields on the existing Tool CRUD path. The ark-dashboard surfaces inline authoring through the existing "Add Tool" flow: selecting `Inline` in the Tool editor reveals the `Source` + `Language` fields, so a user can create an inline tool in the UI and persist it as a `Tool` resource in the cluster. This slice ships first so the PoC-building experience can be validated early.

## Capabilities

### New Capabilities

- `inline-tools`: the `type: inline` extension to the `Tool` CRD, the per-tool reconciliation path, the scale-to-zero activator, the single multi-language runner image, the JSON-on-`argv[1]` runtime contract, and the ark-api/dashboard authoring surface.

### Modified Capabilities

- None. The `Tool` CRD already supports discriminated subtypes (`http`, `mcp`, `agent`, `team`, `builtin`); `inline` is purely additive. `Agent.spec.tools` is unchanged. The execution engine is unchanged — inline tools are reached via the existing MCP plumbing described in `mcp-server-resolution`.

## Impact

- `ark/api/v1alpha1/tool_types.go` — extend the `Type` enum to include `inline`, add `Inline *InlineSpec` to `ToolSpec`, declare `InlineSpec { Source string; Language string }`.
- `ark/internal/webhook/v1/tool_webhook.go` — validate `type == inline` requires non-empty `spec.inline.source`; reject `spec.inline` when `type != inline`; constrain `spec.inline.language` to the allowed set.
- `ark/config/crd/bases/…_tools.yaml` and `ark/dist/chart/templates/crd/…_tools.yaml` — regenerated + Helm-synced CRD manifests.
- `ark/internal/controller/tool_controller.go` — new reconciliation branch for `type: inline` owning `ConfigMap`, `ServiceAccount`, `NetworkPolicy`, `Deployment`, `Service`, and the synthetic MCP endpoint.
- `ark/internal/inlinetoolactivator/` — new subsystem (~300 LOC) for scale-to-zero.
- `ark/images/inline-runner/` — Dockerfile for `ark-inline-runner:v1` plus the runner program (MCP HTTP server, per-script dispatch, JSON-on-`argv[1]` shaping).
- `lib/ark-sdk/` — regenerate types for the extended Tool shape.
- `services/ark-api/` — Tool CRUD accepts the `inline` type and validates the new fields (mostly free via OpenAPI regeneration).
- `services/ark-dashboard/` — Tool editor learns the `Inline` option (Source/Language, edit mode) and persists via the existing create path; tools list gains a language badge.
- `tools/ark-cli/` — `ark tool create --inline --source-file …` convenience (nice-to-have).
- `docs/` and `samples/inline-tools/` — user-guide page and two or three illustrative sample tools.

v1 deliberately scopes out: bundling (author multiple `Tool` resources), languages outside the default runner image, per-tool custom runner images, third-party dependencies (scripts are stdlib-only; no `pip`/`npm` install), OCI/Git/HTTP script sources, cross-namespace references, streaming responses, mounted reference files, and any relaxation of the security defaults.
