# Implementation Tasks

## 1. Author Agent manifest

- [ ] 1.1 Bundle the canonical `argo-make-author` `Agent` manifest (spec + system prompt) as a static dashboard artifact — the single source of truth for the prompt. Default name `argo-make-author`; model swapping via `spec.modelRef`.
- [ ] 1.2 `spec.tools` enumerate the MCP tools by their discovered `Tool`-CRD names (`resources_list`, `resources_get`) as `{type: mcp, name: …}` entries — names must match the kubernetes-mcp-server registration (PR #2536).

## 2. System prompt

- [ ] 2.1 Schema crib for `WorkflowTemplate` authoring; output restricted to `kind: WorkflowTemplate` (no `CronWorkflow` / one-shot `Workflow`).
- [ ] 2.2 Per-kind `resources_list` calls scoped to the current namespace: `Agent`/`Model`/`Team` via `apiVersion: ark.mckinsey.com/v1alpha1`, `WorkflowTemplate` via `apiVersion: argoproj.io/v1alpha1`; instruct reading only needed fields (name, key spec fields, status phase) and ignoring the rest.
- [ ] 2.3 Resource-grounded composition and target verification: verify a target the first time it is mentioned only; never re-verify on later turns; never verify targets already present in a loaded template; refuse to reference resources absent from the listing (reply with alternatives, ask which to use); resolve inexact names only when 100% sure, else ask to confirm.
- [ ] 2.4 Teach embedding Ark queries via the `ark-query` `templateRef`, with the inline `kubectl apply` recipe retained as a fallback few-shot.

## 3. Tests

- [ ] 3.1 Chainsaw e2e (mock-llm): fail-and-tell-user — the model is told to reference a non-existent target and asserts it refuses and writes no YAML referencing it.
- [ ] 3.2 Chainsaw e2e (mock-llm): existing target verified once — a present, available target is referenced and `resources_list` is not re-called for it on later turns.
