## ADDED Requirements

### Requirement: New and Edit authoring entry points

The dashboard SHALL add a `/workflow-templates/new` route and a `/workflow-templates/[id]/edit` route (the `[id]` segment is the template `metadata.name`, matching the existing detail route), plus an "Edit" button on the template detail page. Both routes SHALL use the same two-pane authoring experience — chat panel, DAG / editable-YAML preview, `draftYaml` source-of-truth, agent grounding, and "New conversation" control — differing only in how the draft is seeded and how Save behaves. The edit route SHALL seed `draftYaml` via `workflowTemplatesService.getYaml(name)` with `lastAgentYaml` unset, so the first turn grounds the agent on the loaded template. Both entry points SHALL be gated on the requesting user's cluster RBAC per the "RBAC-gated authoring entry points" requirement.

#### Scenario: New route opens empty authoring
- **WHEN** the user navigates to `/workflow-templates/new`
- **THEN** the two-pane authoring experience opens with an empty `draftYaml`

#### Scenario: Edit route seeds from existing template
- **WHEN** the user clicks "Edit" on a template detail page (or navigates to `/workflow-templates/[id]/edit`)
- **THEN** `draftYaml` is seeded from `workflowTemplatesService.getYaml(name)` with `lastAgentYaml` unset

### Requirement: RBAC-gated authoring entry points

The New and Edit authoring entry points SHALL be visible and usable only to users whose cluster RBAC permits the corresponding write on `WorkflowTemplate` in the selected namespace. The dashboard SHALL determine this by calling the ark-api access-review endpoint (which runs a Kubernetes `SelfSubjectAccessReview` under the requesting user's impersonated identity, see the ark-api "Generic access-review endpoint" requirement), never by inspecting JWT claims client-side. The check SHALL run on mount and whenever the selected namespace changes, querying `create` for the "New" entry point and `update` for the "Edit" entry point on `workflowtemplates` in group `argoproj.io`, scoped to the selected namespace.

When `create` is not allowed, the dashboard SHALL hide (or disable) the "New" control on the workflow-templates list page; when `update` is not allowed for a template, it SHALL hide (or disable) that template's "Edit" button. A user who navigates directly to `/workflow-templates/new` or `/workflow-templates/[id]/edit` without the required permission SHALL be shown a non-authoring "not authorized" state rather than the two-pane authoring experience, and SHALL NOT be offered Save. Read-only viewing of a template on its detail page SHALL remain available regardless of write permission. Gating SHALL fail closed: if the access-review call errors or is indeterminate, the entry point SHALL be treated as not allowed.

This RBAC gate is orthogonal to the author-Agent presence gate: it governs whether the user may author at all, while the author-Agent gate governs whether the chat enhancement layer is active. The "manual editor always works" guarantee applies only to users the RBAC gate permits to author.

#### Scenario: User without create permission sees no New entry point
- **WHEN** the access-review endpoint returns `allowed: false` for `create` on `workflowtemplates` in the selected namespace
- **THEN** the dashboard hides or disables the "New" control on the workflow-templates list page
- **AND** direct navigation to `/workflow-templates/new` shows a "not authorized" state with no Save

#### Scenario: User without update permission sees no Edit button
- **WHEN** the access-review endpoint returns `allowed: false` for `update` on `workflowtemplates` in the selected namespace
- **THEN** the template detail page does not offer an "Edit" button
- **AND** direct navigation to `/workflow-templates/[id]/edit` shows a "not authorized" state with no Save
- **AND** the template still renders read-only on its detail page

#### Scenario: Authorized user sees both entry points
- **WHEN** the access-review endpoint returns `allowed: true` for `create` and `update` on `workflowtemplates` in the selected namespace
- **THEN** the "New" control and the "Edit" button are both available and open the two-pane authoring experience

#### Scenario: Namespace switch re-evaluates access
- **WHEN** the user switches the selected namespace
- **THEN** the dashboard re-runs the `create` and `update` access reviews against the newly-selected namespace and updates the visibility of the New and Edit entry points accordingly

#### Scenario: Access review fails closed
- **WHEN** the access-review call errors or returns an indeterminate result
- **THEN** the dashboard treats the entry point as not allowed and hides or disables it

### Requirement: Editable YAML editor distinct from read-only CodeViewer

The authoring YAML tab SHALL be an editable editor (for v1, a controlled `<textarea>`, optionally with lightweight syntax styling, with zero new code-editor dependencies). The existing read-only `CodeViewer` (`react-syntax-highlighter`) SHALL remain the renderer on the detail page and anywhere a static view is wanted.

#### Scenario: YAML tab is editable
- **WHEN** the user types in the authoring YAML tab
- **THEN** the edits are accepted and written to `draftYaml`

#### Scenario: CodeViewer stays read-only elsewhere
- **WHEN** a template is shown on the detail page
- **THEN** it renders through the read-only `CodeViewer`, not the editable editor

### Requirement: Save semantics — create new, overwrite on edit

On Save, the dashboard SHALL send `draftYaml` to the resources passthrough via a method on `workflowTemplatesService` — POST `.../WorkflowTemplate` to create, or PUT `.../WorkflowTemplate/{name}` to overwrite in place — then navigate to the template detail page. On the `/new` route the dashboard SHALL detect a name collision client-side via the existing `workflowTemplatesService.list`, and if the name is taken prompt to overwrite (Confirm → PUT overwrite; Cancel → return to chat, no destructive action). On the `/edit` route Save SHALL overwrite the same name silently, with "Save as new name" offered as a secondary action. No template versioning history SHALL be maintained.

#### Scenario: New save without collision
- **WHEN** the user saves on `/new` with a name not present in `workflowTemplatesService.list`
- **THEN** the dashboard POSTs to create the template and navigates to its detail page

#### Scenario: New save with collision prompts overwrite
- **WHEN** the user saves on `/new` with a name already present
- **THEN** the dashboard shows an overwrite confirmation dialog
- **AND** Confirm overwrites via the PUT update endpoint while Cancel returns to the chat with no change

#### Scenario: Edit save overwrites silently
- **WHEN** the user saves on `/edit`
- **THEN** the dashboard overwrites the same name via PUT without a prompt
- **AND** offers "Save as new name" as a secondary action

### Requirement: Missing author Agent degrades gracefully with one-click install

The chat SHALL be an enhancement layer over a manual editor that always works. On mount and whenever the selected namespace changes, the route SHALL check for the configured author Agent (`NEXT_PUBLIC_ARGO_MAKE_AUTHOR_AGENT`, default `argo-make-author`) in the current namespace via `agentsService.getByName`. The route SHALL run a preflight that distinguishes errors from warnings: the author Agent missing, or present but not in the available/ready condition, SHALL be an error that blocks dispatch (the chat composer is disabled); the author Agent lacking the grounding MCP tools in its `spec.tools`, or no such grounding `Tool` CRDs existing in the namespace, SHALL be a warning that informs without blocking. When the Agent is absent, the route SHALL show a banner with an "Install author agent" button. In every gated state — error or warning — the YAML editor, DAG preview, and Save SHALL remain fully functional. The install button SHALL read the dashboard-bundled `argo-make-author` manifest (owned by the `argo-make-author-agent` change), stamp the configured name, and create the Agent in the current namespace via the existing resources passthrough (POST), treating HTTP 409 as success. If the Agent disappears mid-session, the route SHALL surface the error inline and re-run the preflight check, leaving `draftYaml` untouched.

#### Scenario: Agent absent — error blocks dispatch and offers install
- **WHEN** `agentsService.getByName` returns `null` for the configured author Agent in the current namespace
- **THEN** the route shows the install banner, disables the chat composer, and keeps the YAML editor, DAG preview, and Save working

#### Scenario: Agent present but not ready — error blocks dispatch
- **WHEN** the configured author Agent exists but its availability status is not the ready condition
- **THEN** the route shows the failing status, disables the chat composer, and keeps the YAML editor, DAG preview, and Save working

#### Scenario: Agent lacks grounding MCP tools — warning does not block
- **WHEN** the author Agent exists and is ready but its `spec.tools` does not enumerate the grounding MCP tools
- **THEN** the route shows a non-blocking warning that grounding/target-verification is off
- **AND** the chat composer stays enabled

#### Scenario: Grounding MCP tools absent in namespace — warning does not block
- **WHEN** no grounding `Tool` CRDs exist in the selected namespace
- **THEN** the route shows a non-blocking warning that grounding/target-verification is off
- **AND** the chat composer stays enabled

#### Scenario: Install creates the Agent
- **WHEN** the user clicks "Install author agent"
- **THEN** the dashboard POSTs the bundled manifest (with the configured name stamped) through the resources passthrough into the current namespace, treats a 409 as success, clears the banner, and enables the composer

#### Scenario: Editing an existing template never depends on the Agent
- **WHEN** the author Agent is absent and the user opens `/workflow-templates/[id]/edit`
- **THEN** the loaded template renders and stays hand-editable and saveable through the resources passthrough

### Requirement: Per-namespace dispatch and explicit New conversation

The dashboard SHALL dispatch every authoring turn to `{selectedNamespace}/{configuredName}`, where the namespace always follows the `NamespaceProvider` and only the agent name comes from configuration (`NEXT_PUBLIC_ARGO_MAKE_AUTHOR_AGENT`, default `argo-make-author`). The chat panel SHALL provide an explicit "+ New conversation" control that starts a fresh `Conversation` within the current `Session` — never automatically and never on Save.

#### Scenario: Namespace switch retargets the Agent
- **WHEN** the user switches the selected namespace
- **THEN** authoring turns dispatch to the configured author Agent in the newly-selected namespace, and the grounding tool results are scoped to that namespace

#### Scenario: New conversation is explicit
- **WHEN** the user clicks "+ New conversation"
- **THEN** a fresh `Conversation` starts within the same `Session`
- **AND** no new conversation is created automatically or on Save
