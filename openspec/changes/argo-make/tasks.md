# Implementation Tasks

Sequenced so each numbered group is a self-contained commit that passes lint and tests on its own. Group 1 has an external dependency: the `kubernetes-mcp-server` change (PR #2536) must land first for grounding to function — the dashboard work degrades to a manual editor until then.

## 1. ark-query template (argo-workflows chart)

- [ ] 1.1 Add `services/argo-workflows/chart/templates/ark-query-template.yaml` rendering a `WorkflowTemplate` named `ark-query` with an inner `query` template referenceable via `templateRef: {name: ark-query, template: query}`. Use the `alpine/k8s` image the samples use.
- [ ] 1.2 Implement inputs: required `target` (split `type/name`, validate enum `agent|team|model|tool` up front) and `input` (verbatim `spec.input`); optional `timeout` (default `5m`, bounds `spec.timeout` and `kubectl wait`), `ttl`, `parameters` (default `[]`, JSON array → `spec.parameters`), `session-id`, `memory`, `query-name` (default `q-{{workflow.name}}-{{pod.name}}`, labelled `workflow: {{workflow.name}}`), `service-account`.
- [ ] 1.3 Implement outputs: `response` (`status.response.content`), `query-json` (full Query object), `phase` (`status.phase`), `conversation-id` (`status.conversationId`).
- [ ] 1.4 Implement Argo-integrated error handling: write all four output files before exiting (even on failure); exit `0` on `done`; write error content to `response` and exit non-zero on `error`, wait-timeout, or non-`done` phase.
- [ ] 1.5 Chainsaw e2e: run against an agent target and a team target asserting outputs on success; force a query `error` and assert the node is Failed with outputs still readable.
- [ ] 1.6 Confirm install on both paths: `devspace` with `ENABLE_ARGO=true`, and the production Helm install / OCI-published chart.

## 2. ark-api generic resource update (PUT) endpoint

- [ ] 2.1 Add a PUT handler to `services/ark-api/.../api/v1/resources.py` for both core (`/api/{version}/{kind}/{resource_name}`) and grouped (`/apis/{group}/{version}/{kind}/{resource_name}`) paths, mirroring the existing create/delete handlers (impersonation, `?namespace=` handling).
- [ ] 2.2 Implement read-then-replace: `get` the live object, copy its `metadata.resourceVersion` onto the submitted body, then `replace` — so a body with no `resourceVersion` succeeds against an existing object.
- [ ] 2.3 Unit (Python): replace a named resource in place; body with no `resourceVersion` succeeds; both core and grouped variants covered.
- [ ] 2.4 Confirm no argo-make-specific or author-agent-specific endpoint is added.

## 3. kubernetes-mcp-server production umbrella chart

- [ ] 3.1 Add `services/kubernetes-mcp-server/chart/` mirroring `services/argo-workflows/chart/`: `Chart.yaml` declares upstream `kubernetes-mcp-server` `0.1.0` from `oci://ghcr.io/containers/charts` as a dependency.
- [ ] 3.2 `values.yaml` layers `config.read_only: true`, a namespace-scoped read-only `Role`/`RoleBinding` (`get`/`list`/`watch`), and the `localhost-gateway` `HTTPRoute` with Ingress disabled.
- [ ] 3.3 Register via `manifest.yaml` + `build.mk` so `make services` offers install/uninstall/dev and the `deploy` workflow packages and pushes the chart to the OCI registry.
- [ ] 3.4 Do NOT ship an `MCPServer` resource here — that registration is owned by PR #2536.
- [ ] 3.5 Helm lint/template tests: read-only config, namespace-scoped RBAC, HTTPRoute enabled / Ingress disabled.

## 4. Dashboard authoring routes and components

- [ ] 4.1 Add `/workflow-templates/new` and `/workflow-templates/[id]/edit` routes plus an "Edit" button on the detail page; share one two-pane component (mode flag = initial draft + Save semantics).
- [ ] 4.2 Implement the `draftYaml` single source of truth with two writers (agent fence on stream completion, manual edits live) and three readers (DAG preview, Save, grounding).
- [ ] 4.3 Add the fenced-block extractor under `lib/utils/` — runs once per turn on stream completion; parse with `js-yaml`; keep previous draft and surface an error on malformed/no-fence output.
- [ ] 4.4 Add the editable YAML tab (controlled `<textarea>`, no new deps); keep `CodeViewer` read-only elsewhere.
- [ ] 4.5 Implement the diverge-check grounding helper (`draftYaml` vs `lastAgentYaml`): prefix on divergence / freshly-loaded template, send bare text when equal.
- [ ] 4.6 Add a `save` method to `workflowTemplatesService`: POST to create, PUT to overwrite; client-side collision detection via `list` on `/new`; silent overwrite + "Save as new name" on `/edit`; navigate to detail on success.
- [ ] 4.7 Missing-agent gating: check `agentsService.getByName` on mount and namespace change; banner + disabled composer when absent; YAML editor / DAG / Save stay functional; re-check on mid-session disappearance with `draftYaml` preserved.
- [ ] 4.8 "Install author agent" button: read the dashboard-bundled manifest, stamp the configured name, POST via the resources passthrough into the current namespace, treat 409 as success, clear banner, enable composer.
- [ ] 4.9 Per-namespace dispatch to `{selectedNamespace}/{configuredName}` (`NEXT_PUBLIC_ARGO_MAKE_AUTHOR_AGENT`, default `argo-make-author`); explicit "+ New conversation" within the current `Session`.

## 5. Author Agent manifest (dashboard-bundled)

- [ ] 5.1 Bundle the canonical `argo-make-author` `Agent` manifest (spec + system prompt) as a static dashboard artifact — the single source of truth for the prompt.
- [ ] 5.2 `spec.tools` enumerate the MCP tools by their discovered `Tool`-CRD names (`resources_list`, `resources_get`) as `{type: mcp, name: …}` entries — names must match PR #2536's registration.
- [ ] 5.3 System prompt: schema crib; per-kind `resources_list` calls (scoped to current namespace); fail-and-tell-user rule; verify-once-per-target and name-resolution rules; `ark-query` `templateRef` recipe with the inline recipe retained as a fallback few-shot.

## 6. Tests

- [ ] 6.1 Unit (TS): YAML extraction (single/multiple fences, surrounding prose, malformed, no-fence); commit-on-completion; diverge-check; install helper name-stamping; missing-agent gating.
- [ ] 6.2 Chainsaw e2e: authoring happy path (mock-llm → create → land on detail); install author agent into a namespace lacking it; fail-and-tell-user (non-existent target → refuses, no YAML); edit + hand-edit grounding (next turn grounded on the manual edit).
- [ ] 6.3 Run lint + tests in every touched stack (Go/Helm, Python, TypeScript) — clean before push.
