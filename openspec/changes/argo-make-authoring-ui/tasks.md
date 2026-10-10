# Implementation Tasks

Sequenced so each numbered group is a self-contained commit that passes lint and tests on its own. Group 1 (ark-api endpoints) is a dependency of the dashboard Save and RBAC gating. The dashboard work degrades to a manual editor until the `argo-make-author-agent` and `deploy-kubernetes-mcp-server` siblings land.

## 1. ark-api endpoints serving the dashboard

- [ ] 1.1 Add a PUT handler to `services/ark-api/.../api/v1/resources.py` for both core (`/api/{version}/{kind}/{resource_name}`) and grouped (`/apis/{group}/{version}/{kind}/{resource_name}`) paths, mirroring the existing create/delete handlers (impersonation, `?namespace=` handling, default to context namespace).
- [ ] 1.2 Implement read-then-replace: `get` the live object, copy its `metadata.resourceVersion` onto the submitted body, then `replace` — so a body with no `resourceVersion` succeeds against an existing object.
- [ ] 1.3 Add a generic access-review endpoint (`group`/`resource`/`verb`, optional `?namespace=`) that creates a `SelfSubjectAccessReview` under the impersonated identity and returns `{ "allowed": bool }`; defaults to the context namespace; generic, not WorkflowTemplate-specific.
- [ ] 1.4 Confirm no argo-make-specific or author-agent-specific endpoint is added; Agent creation (Install) and template create/load reuse the existing passthrough (`POST`/`GET`).
- [ ] 1.5 Unit (Python): PUT replaces a named resource in place; body with no `resourceVersion` succeeds; both core and grouped variants covered.
- [ ] 1.6 Unit (Python): access-review allowed → `true`, denied → `false`, namespace defaults to context, runs under impersonated identity (service account when impersonation disabled).

## 2. Dashboard authoring routes and components

- [ ] 2.1 Add `/workflow-templates/new` and `/workflow-templates/[id]/edit` routes plus an "Edit" button on the detail page; share one two-pane component (mode flag = initial draft + Save semantics).
- [ ] 2.2 Implement the `draftYaml` single source of truth with two writers (agent fence on stream completion, manual edits live) and three readers (DAG preview, Save, grounding).
- [ ] 2.3 Add the fenced-block extractor under `lib/utils/` — runs once per turn on stream completion; parse with `js-yaml`; keep previous draft and surface an error on malformed/no-fence output.
- [ ] 2.4 Add the editable YAML tab (controlled `<textarea>`, no new deps); keep `CodeViewer` read-only on the detail page and elsewhere.
- [ ] 2.5 Implement the diverge-check grounding helper (`draftYaml` vs `lastAgentYaml`): prefix on divergence / freshly-loaded template, send bare text when equal; the full replacement block overwrites `draftYaml` and updates `lastAgentYaml`.
- [ ] 2.6 Add a `save` method to `workflowTemplatesService`: POST to create, PUT to overwrite; client-side collision detection via `list` on `/new`; silent overwrite + "Save as new name" on `/edit`; navigate to detail on success via `useNamespacedNavigation`.
- [ ] 2.7 RBAC gating: add a `workflowTemplatesService` method that calls the ark-api access-review endpoint; on mount and namespace change, run `create`/`update` access reviews on `workflowtemplates` (`argoproj.io`) in the selected namespace; hide/disable the "New" control and per-template "Edit" button accordingly; show a "not authorized" state (no Save) on direct navigation to `/new` or `/[id]/edit` without permission; keep the detail page read-only view available; fail closed on error.
- [ ] 2.8 Author-Agent preflight gating: on mount and namespace change, check `agentsService.getByName(name)` and its readiness, and the presence of the grounding MCP tools (on the agent's `spec.tools` and as `Tool` CRDs via `toolsService`); missing/not-ready agent → error banner + disabled composer; missing MCP tools → non-blocking warning; YAML editor / DAG / Save stay functional in every gated state; re-check on mid-session disappearance with `draftYaml` preserved.
- [ ] 2.9 "Install author agent" button: read the dashboard-bundled manifest (owned by the `argo-make-author-agent` change), stamp the configured name, POST via the resources passthrough into the current namespace, treat 409 as success, clear banner, enable composer.
- [ ] 2.10 Per-namespace dispatch to `{selectedNamespace}/{configuredName}` (`NEXT_PUBLIC_ARGO_MAKE_AUTHOR_AGENT`, default `argo-make-author`); explicit "+ New conversation" within the current `Session`.

## 3. Collapsible chat code blocks

- [ ] 3.1 Wrap each fenced block in `renderMarkdown` with a header (language label + chevron toggle) and per-block collapse state; toggling one block does not affect others.
- [ ] 3.2 Thread a default-collapse setting from `ChatMessage` into `renderMarkdown` (default expanded — additive, no caller required to pass it); the argo-make authoring route opts into default-collapsed.
- [ ] 3.3 Keep collapse presentation-only — never touch message content, agent input, or `draftYaml`.

## 4. Tests

- [ ] 4.1 Unit (TS): YAML extraction (single/multiple fences, surrounding prose, malformed, no-fence); commit-on-completion (no `draftYaml` change from partial input, one commit at turn end); diverge-check (equal → no prefix; diverged → prefix; freshly-loaded template → prefix on first turn); install helper name-stamping; preflight gating (ready agent with MCP tools → composer enabled, no warning; `getByName` null → error banner, composer disabled; `available !== "True"` → not-ready error; agent missing the MCP tools → warning, composer enabled; namespace lacks the `Tool` CRDs → warning; editor + Save stay enabled in every gated state); RBAC gating (allowed → entry points shown; denied → hidden/disabled, "not authorized" on direct nav, detail read-only stays; fail closed on error); collapsible-code-block renderer (toggle hides/reveals one block, default-collapse setting, default expanded when unset).
- [ ] 4.2 Unit (Python): generic resource update (PUT) endpoint (read-then-replace, body with no `resourceVersion` succeeds, core and grouped variants); access-review endpoint (allowed/denied, namespace defaults to context, runs under impersonated identity).
- [ ] 4.3 Chainsaw e2e: authoring happy path (mock-llm → create → land on detail); install author agent into a namespace lacking it (banner clears, composer enables); edit + hand-edit grounding (next turn grounded on the manual edit via the prefix).
- [ ] 4.4 Run lint + tests in every touched stack (Python, TypeScript) — clean before push.
