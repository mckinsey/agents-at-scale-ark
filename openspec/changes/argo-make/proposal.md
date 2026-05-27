## Why

Ark ships Argo Workflows as a first-class service and the dashboard already lists, visualises, and runs `WorkflowTemplate` resources at `/workflow-templates`. There is currently **no in-product way to author a new template** — users must hand-write Argo YAML and `kubectl apply`. This locks the feature behind YAML literacy and excludes the non-technical users (typically PMs) that the workflows tab is meant to serve.

A previous evaluation of visual workflow editors (Flowify) found them too feature-thin to fill the gap. Rather than continue searching for a click-and-drag editor, this change adds a conversational authoring experience — modelled on Figma Make — where a non-technical user prompts their way to a runnable workflow.

The fit is unusually clean: the dashboard already renders any workflow YAML through `WorkflowDagViewer` (no Argo round-trip required), so the LLM can stream YAML directly into the same canvas the user will see after Save. Ark also already exposes an MCP server (`services/ark-mcp`) that an Ark Agent can use to ground its output in the user's real catalogue of agents, models, and teams.

## What Changes

- Add a new dashboard route `/workflow-templates/new` with a two-pane layout:
  - **Left:** chat panel reusing the existing chat/session infrastructure
  - **Right:** live preview using the existing `WorkflowDagViewer` + `CodeViewer`, fed by YAML extracted from streamed assistant messages
- Add a "New conversation" control inside the route (explicit only — never automatic) so a single session can host multiple authoring conversations
- On Save: POST the YAML as a `WorkflowTemplate` via the existing resources passthrough endpoint and navigate to the template's detail page; on name collision, prompt to overwrite
- Add three new MCP tools to `services/ark-mcp`: `list_models`, `list_teams`, `list_workflow_templates`
- Ship a sample `Agent` CRD (`argo-make-author`) under `services/argo-workflows/samples/` whose system prompt:
  - Mandates calling `list_agents` / `list_models` / `list_teams` before referencing any Ark resource
  - Refuses to invent resources that aren't in the returned list (fail-and-tell-user)
  - Includes few-shot examples drawn from existing samples (`a2a-arithmetic-workflow.yaml`, `query-fanout-template.yaml`) to teach the canonical `kubectl apply` recipe for embedding Ark queries inside Argo steps
- Output is restricted to `kind: WorkflowTemplate` for v1

## Capabilities

### New Capabilities
- `argo-make-authoring`: Conversational authoring of Argo `WorkflowTemplate` resources from natural-language prompts, with live DAG preview and Ark-resource-grounded composition

### Modified Capabilities
- `ark-mcp-tools`: Adds list endpoints for models, teams, and workflow templates
- `dashboard-workflow-templates`: Adds a "New" entry point with chat-driven authoring alongside the existing list and detail views

## Impact

- **ark-mcp (Python):** Three new tool functions in `ark_mcp/tools.py` reusing `with_ark_client`. No new dependencies.
- **Samples (YAML):** One new sample `Agent` CRD in `services/argo-workflows/samples/argo-make-author.yaml`. Users opt in via `kubectl apply`. Not added to the chart, to keep the system prompt iterable without chart bumps.
- **ark-dashboard (TypeScript):** New `/workflow-templates/new` route and supporting components. Reuses `chatService`, `conversationsService`, `WorkflowDagViewer`, `CodeViewer`, `useNamespacedNavigation`. No new API surface; uses existing `/api/v1/resources/.../WorkflowTemplate` passthrough.
- **Tests:** Unit tests for the YAML extraction logic and the new MCP tools; chainsaw e2e test that exercises the full author → save → run loop using mock-llm.
- **Out of scope for v1:** `lint_workflow` MCP tool, `CronWorkflow` / one-shot `Workflow` output, canvas direct-manipulation, starter-prompt gallery, template versioning. Tracked as follow-ups.
