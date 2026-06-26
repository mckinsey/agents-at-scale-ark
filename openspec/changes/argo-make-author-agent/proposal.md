## Why

Conversational authoring of Argo `WorkflowTemplate` resources needs an LLM that can compose generic Argo steps with the user's existing Ark primitives — `Agent`, `Model`, and `Team` resources a `Query` can address. That LLM must never invent a query target that does not exist: the generated workflow submits real `Query` resources, so a target that is absent or unavailable turns into a runtime failure the user only discovers after Save and Run.

Ark eats its own dog food, so the authoring LLM is itself an Ark resource: an `Agent` whose system prompt carries the schema crib, the grounding and fail-fast rules, and the canonical recipes. Modelling it as a CRD means users get model swapping for free via `spec.modelRef`, and iterating on the prompt is a manifest change rather than a service release.

The grounding is honest because it reads the live cluster: the author Agent calls the read-only `kubernetes-mcp-server`'s generic `resources_list` / `resources_get` tools to list the user's catalogue per kind, rather than carrying a baked-in copy that would blow the prompt budget and go stale. The author verifies each query target the first time the user mentions it and refuses to reference resources it cannot find.

## What Changes

- Add the canonical `argo-make-author` Ark `Agent` manifest (spec plus system prompt) as the single source of truth for the author, bundled in the dashboard (its only consumer). Default name `argo-make-author`; users swap models via `spec.modelRef`.
- The manifest's `spec.tools` enumerate the individual `Tool`-CRD names `resources_list` and `resources_get` as `{type: mcp, name: ...}` entries — Ark agents reference MCP tools individually, not an `MCPServer` wholesale. Names must match the kubernetes-mcp-server registration.
- The system prompt documents the exact per-kind `resources_list` call (scoped to the current namespace) for `Agent`, `Model`, `Team` (`apiVersion: ark.mckinsey.com/v1alpha1`) and `WorkflowTemplate` (`apiVersion: argoproj.io/v1alpha1`), instructing the Agent to read only the fields it needs.
- The system prompt encodes resource-grounded composition and target verification: verify a target the first time it is mentioned only, never re-verify on later turns, never verify targets already present in a loaded template, refuse to reference resources absent from the listing, and resolve inexact names only when 100% sure (else ask).
- The system prompt teaches embedding Ark queries via the shipped `ark-query` template referenced by `templateRef`, with the inline `kubectl apply` recipe retained as a fallback few-shot.
- The author produces only `kind: WorkflowTemplate`; `CronWorkflow` and one-shot `Workflow` are out of scope for v1.

The dashboard install button, per-namespace dispatch, preflight gating, the `draftYaml` buffer, DAG preview, diverge-check grounding, save semantics, and collapsible chat rendering are owned by the separate authoring UI change and only consume this manifest.

## Impact

- **ark-dashboard (bundled artifact):** Adds the canonical `argo-make-author` Agent manifest (spec + system prompt) as a static artifact — the single source of truth for the prompt. No code in this change; the UI change consumes the artifact.
- **Cross-change dependencies:**
  - Depends on the `kubernetes-mcp-server` deployment, which provides the `resources_list` / `resources_get` `Tool` CRDs this manifest grounds through (PR #2536 merged; the production deploy is a sibling change). The enumerated tool names must match that registration.
  - Depends on the `argo-query-template` change, which ships the `ark-query` `WorkflowTemplate` this prompt references via `templateRef`.
  - The argo-make authoring UI change consumes this manifest — the install button, per-namespace dispatch, and preflight gating live there.
- **Out of scope for v1:** `CronWorkflow` / one-shot `Workflow` output kinds; upgrading an already-installed author Agent to the latest bundled prompt.
