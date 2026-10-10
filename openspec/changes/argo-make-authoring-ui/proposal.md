## Why

The dashboard lists, visualises, and runs `WorkflowTemplate` resources at `/workflow-templates`, but there is no in-product way to author one — users hand-write Argo YAML and `kubectl apply`. That locks the feature behind YAML literacy and excludes the non-technical users the workflows tab is meant to serve.

This change adds a conversational authoring experience — modelled on Figma Make — where a user prompts their way to a runnable workflow, and can also open an existing template to refine it or hand-edit the generated YAML directly. The user is a co-editor, not just a prompter, so the agent must always work against the *current* draft, including unsaved manual edits.

The fit is clean: `WorkflowDagViewer` already parses any workflow YAML locally (no Argo round-trip), so the agent's generated YAML renders in the same canvas the user sees after Save. The chat/session stack and the `WorkflowTemplate` resources passthrough already exist; this is a new consumer of them, plus the two backend endpoints that exist solely to serve the dashboard (in-place update for Save, access-review for RBAC gating).

This change owns the dashboard-facing authoring mechanics and the ark-api endpoints that serve them. It references — but does not specify — the author Agent's manifest, prompt, tools, and grounding/target-verification behaviour, which are owned by the `argo-make-author-agent` change.

## What Changes

### Conversational authoring UI

- Add `/workflow-templates/new` and `/workflow-templates/[id]/edit` routes with a two-pane layout: a chat panel (reusing the existing chat/session infrastructure) on the left, and a live preview on the right with two tabs — `WorkflowDagViewer` (read-only DAG) and an editable YAML editor. Both routes share one two-pane experience, differing only in how the draft is seeded and how Save behaves. The `[id]` segment is the template `metadata.name`, matching the existing detail route; an "Edit" button is added to the detail page.
- Make a single `draftYaml` buffer the source of truth for the route, with two writers — the author Agent (its latest fenced ` ```yaml ` block) and the user (manual edits in the editable tab) — and three readers: preview, Save, and grounding.
- Update the preview only on stream completion: extract the agent's fenced block once the turn finishes streaming, parse with `js-yaml`, and commit to `draftYaml` in one step. No mid-stream DAG churn. Manual edits commit live.
- Ground the agent on the live draft via a client-side diverge-check: track `draftYaml` and `lastAgentYaml`; on submit, if they diverge (hand-edit, or a freshly-loaded template), prepend the current draft to the user's input; when equal, send the user's text alone. No backend change; the draft never leaves the browser until Save.
- Add an editable YAML editor (controlled `<textarea>`, zero new dependencies) for the authoring tab; keep the read-only `CodeViewer` as the renderer on the detail page and elsewhere.
- Save: a `save` method on `workflowTemplatesService` — POST to create, PUT to overwrite in place. New-template collision is detected client-side via the existing `workflowTemplatesService.list` and prompts to overwrite; edit-mode overwrites silently with "Save as new name" as a secondary action. On success, navigate to the detail page.
- Gate the New and Edit entry points on the requesting user's cluster RBAC via the ark-api access-review endpoint (`create`/`update` on `workflowtemplates` in group `argoproj.io`, in the selected namespace); fail closed; never inspect JWT claims client-side.
- Degrade gracefully when the configured author Agent is missing or not ready: preflight on mount and namespace change surfaces the result inline. Errors (Agent missing, or present but not ready) block dispatch; warnings (Agent lacks the grounding MCP tools, or no such `Tool` CRDs in the namespace) inform without blocking. In every gated state the YAML editor, DAG preview, and Save stay functional. When the Agent is absent, a one-click "Install author agent" button creates it in the current namespace from the dashboard-bundled manifest via the existing resources passthrough (409 treated as success).
- Dispatch every authoring turn to `{selectedNamespace}/{configuredName}` (`NEXT_PUBLIC_ARGO_MAKE_AUTHOR_AGENT`, default `argo-make-author`; namespace always follows the `NamespaceProvider`). Provide an explicit "+ New conversation" control that starts a fresh `Conversation` within the current `Session` — never automatic, never on Save.
- Restrict output to `kind: WorkflowTemplate` for v1; `CronWorkflow` and one-shot `Workflow` are deferred.

### Collapsible chat code blocks

- Make fenced code blocks in assistant messages collapsible in the shared chat renderer (`renderMarkdown` / `ChatMessage`): a per-block header (language label + chevron toggle) that hides or reveals the code body, with per-block UI state held in the browser. The enhancement is available wherever the chat component is used (floating chat, sessions, this route).
- Thread an additive default-collapse setting from `ChatMessage` into `renderMarkdown`: default expanded (unchanged elsewhere, no caller required to pass it); the argo-make authoring route opts into default-collapsed so the generated `WorkflowTemplate` YAML does not flood the chat. Collapse is presentation-only and never affects message content, agent input, or `draftYaml`.

### ark-api endpoints serving the dashboard

- Add a generic resource update (PUT) endpoint to the resources passthrough — `PUT /api/v1/resources/api/{version}/{kind}/{resource_name}` (core) and `.../apis/{group}/{version}/{kind}/{resource_name}` (grouped) — with `replace` semantics, mirroring the existing create/delete handlers. Save uses it to overwrite a template in place.
- Reconcile `metadata.resourceVersion` in the PUT handler: read the live object, copy its `resourceVersion` onto the submitted body, then `replace`, so a `draftYaml` body that carries none succeeds against an existing object. Two-tab editing is last-write-wins (no versioning for v1).
- Add a generic access-review endpoint that creates a Kubernetes `SelfSubjectAccessReview` under the requesting user's impersonated identity (group/resource/verb, optional `?namespace=`, defaulting to context) and returns `{ "allowed": <bool> }`, so the dashboard can gate write affordances. Generic over group/resource/verb, not WorkflowTemplate-specific.

## Impact

- **ark-dashboard (TypeScript):** New `/workflow-templates/new` and `/workflow-templates/[id]/edit` routes and supporting components, plus an "Edit" button on the detail page. New editable YAML editor (the existing `CodeViewer` stays read-only), a `draftYaml` source-of-truth buffer, the fenced-block extractor (`lib/utils/`), and a client-side grounding helper (diverge-check + input prefix). Dispatches authoring turns to the configured author Agent in the selected namespace. Preflight on route load surfaces RBAC gating and author-Agent presence/readiness; the install button reuses the resources passthrough. Reuses `chatService`, `conversationsService`, `agentsService` (`getByName`), `toolsService`, `WorkflowDagViewer`, `useNamespacedNavigation`, and `workflowTemplatesService` (`getYaml` for load; new `save` for POST create / PUT overwrite; `list` for client-side collision detection; a new method calling the access-review endpoint). Enhances the shared chat renderer with collapsible fenced code blocks (additive default-collapse prop).
- **ark-api (Python):** A generic resource update (PUT) endpoint on the resources passthrough (read-then-replace to reconcile `resourceVersion`), and a generic access-review endpoint (`SelfSubjectAccessReview` under the impersonated identity). Both mirror the existing handlers' impersonation and `?namespace=` handling. No argo-make-specific or WorkflowTemplate-specific endpoint; Agent creation (Install) and template create/load reuse the existing passthrough (`POST`/`GET`).
- **Tests:** Unit (TS) for the YAML extractor, commit-on-completion, diverge-check, preflight/RBAC gating, install name-stamping, and the collapsible-code-block renderer; unit (Python) for the PUT update endpoint (read-then-replace, body without `resourceVersion`) and the access-review endpoint (allowed/denied, namespace default, impersonated identity); chainsaw e2e for the author → save → run loop, install-into-empty-namespace, and edit + hand-edit grounding.

## Dependencies

This change depends on sibling changes:

- **`argo-make-author-agent`** — the author Agent manifest the install button POSTs and the agent the dashboard dispatches to. This change references "the configured author Agent" and "grounding" but does not specify the agent's prompt, `spec.tools`, or its grounding/target-verification behaviour.
- **`argo-query-template`** — the reusable `ark-query` `WorkflowTemplate` that authored templates reference via `templateRef`.
- **`deploy-kubernetes-mcp-server`** — the grounding tools (`resources_list`/`resources_get`); when absent, the preflight degrades to a warning and authoring proceeds without target verification.
