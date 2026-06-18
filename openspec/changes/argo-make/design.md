## Context

Five existing pieces of Ark infrastructure shape this design — without them the feature would require significantly more work:

1. **`WorkflowDagViewer` parses YAML locally.** `services/ark-dashboard/ark-dashboard/components/workflow-dag-viewer.tsx` imports `js-yaml` and uses `@xyflow/react` + `dagre` to render any `WorkflowTemplate` manifest as a DAG. It does not need the workflow to be submitted to Argo first. The same component will happily render whatever YAML it is handed — the block the agent just finished emitting, or YAML the user is hand-editing — with no Argo round-trip.
2. **The chat + session/conversation stack already exists.** `chatService` (`lib/services/chat.ts`), `conversationsService` (`lib/services/conversations.ts`), and the broker sessions were shipped with the recent sessions/conversations view. The author UI is a new consumer of that stack, not a new stack.
3. **The `kubernetes-mcp-server` provides generic resource access.** A separate change deploys the [`kubernetes-mcp-server`](https://github.com/containers/kubernetes-mcp-server) and registers it as an Ark `MCPServer`, so the Agent CRD's `tools` block can reference it. Its generic `resources_list` (and `resources_get`) tools list any resource by `apiVersion`/`kind` — so `Agent`, `Model`, `Team`, and `WorkflowTemplate` are all reachable with no Ark-specific tool code. It is deployed read-only, which is all this feature needs: the author Agent only reads the catalogue; every write goes through ark-api.
4. **`WorkflowTemplate` read/write already goes through the resources passthrough.** `workflowTemplatesService` (`lib/services/workflow-templates.ts`) exposes `list`, `get`, `getYaml(name)`, and `run`. `getYaml` loads a template for the edit flow; `run()` already POSTs a `Workflow` to `/api/v1/resources/apis/argoproj.io/v1alpha1/Workflow`, proving the passthrough accepts POST. Save creates a new template with that same POST and overwrites an existing one through a new generic resource-**update** (PUT) endpoint added to the passthrough (Decision 9).
5. **The `Query` CR is the integration point between Argo and Ark.** `ark/api/v1alpha1/query_types.go` defines the contract: a query completes on `status.conditions[Completed]`, exposes `status.phase` (`done`/`error`/…) and a **single** `status.response` (since v0.1.50 the plural `responses[]` was collapsed). For a team target the completions executor returns the final assistant message, which the controller stores verbatim as `response.content` (`query_controller.go` sets `Response{Content: responseText}` from the executor's A2A reply). The per-member turns are persisted elsewhere keyed by `conversationId` — in memory (`executors/completions/memory.go`, `AddMessages`) and in the broker (`services/ark-broker/.../brokers/memory-broker.ts`, `getByConversation`) — **not** in the Query CR.

Three existing in-repo samples encode the canonical pattern for invoking an Ark resource from inside an Argo step (`kubectl apply` a `Query`, `kubectl wait --for=condition=Completed`, extract `status.response.content`, exit non-zero on `error`):
- `services/argo-workflows/samples/a2a-arithmetic-workflow.yaml`
- `services/argo-workflows/samples/query-fanout-template.yaml`
- `services/argo-workflows/samples/weather-workflow-template.yaml`

These are both the few-shot library for the author Agent **and** the boilerplate the new `ark-query` template factors out.

## Goals / Non-Goals

**Goals:**
- A non-technical PM can describe a workflow in natural language and receive runnable Argo YAML
- A user can open an **existing** template and refine it conversationally
- A user can **hand-edit** the YAML directly, and the agent stays grounded on the current draft — including manual edits that have not yet been saved
- The DAG preview updates **when the agent finishes responding** (not mid-stream), and reflects manual edits live
- The model composes from generic Argo steps **and** the user's existing Ark agents, models, and teams
- The model **never invents** Ark resources that do not exist in the user's namespace; it lists what's available and asks
- Saved templates are indistinguishable from hand-written templates and land on the existing detail page
- The authoring conversation lives inside an Ark `Session` so it appears in the conversations view and can be resumed
- Argo workflows have an **Ark-native, reusable template** to run a `Query` with structured outputs and Argo-integrated error handling

**Non-Goals (v1):**
- Output types other than `WorkflowTemplate` (no `CronWorkflow` for scheduled runs, no one-shot `Workflow` for run-now) from the authoring flow
- Lint / dry-run loop before Save (revisit if error rate hurts)
- Inline creation of missing Ark agents/models/teams as part of the same flow
- Canvas direct-manipulation (click-node-to-edit on the DAG); manual editing is raw-YAML only
- A server-side draft store and the agent-callable draft-inspection tool it would enable (prefix-injection covers grounding for now)
- Versioning of saved templates (Save overwrites, with confirmation on new / silently on edit)
- A broker-backed per-member transcript output for the `ark-query` template (the `conversation-id` output is the seam)
- Starter-prompt gallery / template marketplace

## Decisions

### 1. Author lives as an Ark Agent CRD, not a new service

The LLM that drives authoring is `kind: Agent`, whose manifest is bundled **in the dashboard** and installed on demand from there (Decision 2 / 15) — not a kubectl sample. Its `spec.prompt` carries the schema crib, the canonical recipes, and the fail-fast rule. Its `spec.tools` reference the `kubernetes-mcp-server`'s `MCPServer` registration.

The author Agent lives in the **currently-selected namespace**, created there on demand from the dashboard (Decision 15), not hand-applied. The dashboard dispatches each authoring turn to the author Agent **in that selected namespace** — so browsing namespace X chats with X's author Agent. Only the agent *name* is configured (Decision 13); the namespace is always the one the user is currently in, exactly like every other resource the dashboard shows.

**Rationale:**
- Ark eats its own dog food — argo-make is itself an Ark resource
- Users get model swapping for free via `spec.modelRef`
- Iterating on the system prompt is a `kubectl apply`, not a release
- Reuses the existing dispatch / streaming / session machinery end-to-end

**Alternative considered:** Hard-code the author in a new dedicated service or inside `ark-api`. Rejected — it would create a parallel chat infrastructure and break the "everything is an Ark resource" story.

### 2. Author manifest bundled in the dashboard; `ark-query` ships in the chart

The two new YAML artifacts have different homes, because they have different install paths:

- **`ark-query` `WorkflowTemplate`** is a managed resource in the **argo-workflows Helm chart** (`services/argo-workflows/chart/templates/`), so it installs automatically on every Ark-with-Argo install — both via `devspace` (which deploys the chart as a dependency when `ENABLE_ARGO=true`) and via the production Helm install / OCI-published chart. It is referenced from hand-written workflows and from the author Agent's few-shots, so it must be reliably present wherever Argo is — a chart-managed resource guarantees that, where a `kubectl apply`-only sample would not.
- **The `argo-make-author` Agent** is **not** a chart resource or a kubectl sample. Its manifest — spec plus the canonical system prompt — is a static artifact **bundled in the dashboard** (its only consumer) and the single source of truth for the prompt, installed from the dashboard via the existing resources passthrough (Decision 15). There is no parallel sample file to drift from it.

**Rationale:**
- The `ark-query` template is a runtime dependency of every workflow the author Agent generates; shipping it with the chart means it is always installed alongside Argo, with no separate `kubectl apply` step a user can forget.
- The user installs the author Agent from the dashboard, not the CLI; bundling the manifest in the dashboard lets the install button materialise it without a `kubectl apply` and without a bespoke ark-api endpoint.
- Single source of truth: the prompt exists in exactly one place — the dashboard bundle. No sample or chart copy to keep in sync.

### 3. The draft buffer is the single source of truth

A single `draftYaml` state in the route is the source of truth. It has **two writers** — the author Agent (the fenced ` ```yaml ` block in its latest message) and the user (manual edits in the YAML tab) — and three readers: the preview, Save, and agent-grounding (Decision 4).

The agent emits its `WorkflowTemplate` inside a single fenced ` ```yaml ` block. The chat streams the response as usual, but the preview does **not** track it mid-stream: only once the turn has finished streaming does the dashboard extract the block, parse it with `js-yaml`, and (on a successful parse) commit it to `draftYaml` in a single step. The editable YAML tab writes the user's keystrokes straight to `draftYaml`.

**Update the preview only when the agent is done (explicit requirement).** A demo showed that updating the DAG on every streamed chunk is distracting and churns through transient, half-valid graphs. The agent writer therefore commits to `draftYaml` exactly once per turn, on stream completion. The user still sees progress in the streaming chat message; the DAG and YAML tab settle to one coherent state at the end. (Manual edits are unaffected — they commit live as the user types.)

This replaces the earlier model where the agent's last message was the source of truth — that could not accommodate manual edits.

**Editable editor:** the existing `CodeViewer` is a read-only `react-syntax-highlighter` (Prism) and cannot be made editable. The dashboard has no code-editor dependency (no Monaco/CodeMirror/Ace). For v1 the editable YAML tab is a controlled `<textarea>` (optionally with lightweight syntax styling) — zero new dependencies. `CodeViewer` remains the read-only renderer on the detail page and anywhere a static view is wanted. A richer in-browser editor is a follow-up.

**Rationale:**
- Reuses the existing chat streaming channel exactly as-is — no new event types, no new tool-call surface
- The DAG settles to a single coherent state when the agent finishes — no mid-stream churn through half-valid graphs — and reflects manual edits live
- One buffer means preview, Save, and grounding can never disagree

**Alternative considered:** A dedicated `propose_workflow(yaml)` tool call for transport. Rejected for v1 — it would require the chat UI to surface tool-call results in a custom way, and provides no behaviour the fence-extraction approach lacks.

### 4. Grounding the agent on the live draft (diverge-check, not a tool)

The agent only knows what is in the conversation. To keep it working against the current draft — including manual edits and freshly-loaded existing templates — the client grounds it per turn, but only when needed:

- Track `draftYaml` (the buffer) and `lastAgentYaml` (the fence from the agent's most recent message).
- On submit, if `draftYaml !== lastAgentYaml` (the user hand-edited, or an existing template was just loaded with `lastAgentYaml` unset), prepend the current draft to the user's input as a context block: *"The current workflow YAML is: ```yaml …```. Apply the following change: <user text>"*.
- If they are equal, send the user's text alone — the agent's own last message already carries the YAML, so re-injecting would only bloat history.
- The agent always replies with a **full** replacement block, which overwrites `draftYaml` and updates `lastAgentYaml`.

This is a client-side input prefix and a string comparison — no backend change, and the draft never leaves the browser until Save.

**Alternative considered:** an agent-callable tool that reads the draft on demand. Rejected for v1: the draft lives in the browser, but Ark tools (MCP or otherwise) execute server-side in-cluster with no callback channel into a specific browser tab. Making a pull-tool work would require a server-side draft store, the dashboard pushing the draft on every edit, a conversation-scoped tool to read it back, and the model reliably choosing to call it — materially more scope, plus a staleness window. Prefix-injection gives the same guarantee deterministically. The tool becomes attractive only once a server-side draft store exists (e.g. for autosave/recovery); parked as a follow-up.

**Alternative considered:** always inject the draft every turn. Rejected — simpler but duplicates the full YAML into conversation history/memory on every message; the diverge-check is correct and leaner.

### 5. Editing existing templates

A dedicated `/workflow-templates/[id]/edit` route (the `[id]` segment is the template `metadata.name`, matching the existing `/workflow-templates/[id]` detail route) plus an "Edit" button on the detail page. On mount it seeds `draftYaml` from `workflowTemplatesService.getYaml(name)` and leaves `lastAgentYaml` unset, so the user's first turn grounds the agent on the loaded template (Decision 4).

**Rationale:**
- `getYaml` already exists — loading is free
- Reuses the exact same route components as `/new`; edit-vs-new is a mode flag (initial draft + Save semantics), not a separate UI

### 6. Grounding the catalogue via MCP tools (not prompt-injected)

The author Agent calls the `kubernetes-mcp-server`'s generic `resources_list` at runtime — once per kind (`Agent`, `Model`, `Team`) — to read the user's catalogue. It does **not** receive the catalogue baked into its system prompt.

**Rationale:**
- A tenant with hundreds of agents would blow the prompt budget
- The catalogue stays fresh — newly-created agents are visible without restarting anything
- Dynamic calls cost a tool-call hop per kind but are the only honest answer for a multi-tenant system

Listing `WorkflowTemplate` (via the same `resources_list`) lets the model answer "build something like the X template" — useful for PMs working from a partial example.

### 7. Fail-and-tell-user is a system-prompt rule, not code

The author Agent's prompt contains a hard rule:

> Before referencing any Ark agent, model, or team, call `resources_list` for that kind. If the user names a resource that is not in the returned list, do not generate YAML that references it. Reply with the available alternatives and ask which to use.

This applies most directly to **query targets**: when the user asks for a template that queries a given target (e.g. "run this through the `weather` agent"), the author must list that kind, confirm the named target is present and available (not in a failed/unavailable status), and only then emit a query step (via the `ark-query` `templateRef`) that addresses it. Verifying the target up front is the whole point of grounding the author through the `kubernetes-mcp-server` — the generated workflow submits real `Query` resources, so a target that does not exist turns into a runtime failure the user only sees after Save and Run.

The verification rule is scoped to keep it cheap and non-repetitive:

- **Once per target.** A target is verified the **first time it is mentioned in the conversation**. After it is confirmed, the author does not call `resources_list` for it again on later turns — the result holds for the rest of the conversation.
- **Loaded templates are not re-verified.** When the author opens an existing `WorkflowTemplate` to edit (Decision 5), it does **not** verify the targets already referenced in that YAML. It only verifies a target the first time the **user** mentions it in the conversation, so editing an existing workflow does not fan out a `resources_list` call per pre-existing target.
- **Name resolution.** The listing also resolves the exact target name when the user gives an inexact one ("the weather agent" → `agent/weather`). If the author is **100% sure** of the match it uses the resolved name; if it is **not certain**, it does **not** guess — it asks the user to confirm which of the listed candidates they meant. This makes the listing serve double duty: existence check and name disambiguation.

No webhook, no validator, no policy engine. The enforcement mechanism is the LLM following its instructions, which is consistent with how Ark agents work generally.

**Risk:** A poorly-tuned model could violate the rule. **Mitigation:** Few-shot examples in the prompt demonstrate the refusal pattern; a chainsaw test exercises the negative case with mock-llm.

### 8. Conversations within a session: explicit "New conversation"

The route opens in the context of an Ark `Session`. The chat panel shows a "+ New conversation" control. Clicking it starts a fresh `Conversation` inside the same `Session` — never automatic, never on save.

**Rationale:**
- Matches the user's mental model from chat tools (Cursor, Claude, ChatGPT)
- A single workflow-design session can host an iteration history without polluting the sessions list
- The user has already stated this preference; surfacing a button is the simplest implementation

**Open question parked:** whether "+ New conversation" should ever create a new `Session` instead. The simpler answer (always new conversation within the current session) wins for v1 unless the existing semantics force otherwise. Final call requires a closer read of `conversations.ts` during implementation.

### 9. Save semantics: new prompts, edit overwrites

Save sends `draftYaml` to the resources passthrough via a new method on `workflowTemplatesService` — **POST** `.../WorkflowTemplate` to create, or **PUT** `.../WorkflowTemplate/{name}` to overwrite in place — then navigates to `/workflow-templates/[id]`. The PUT handler is a new generic resource-update endpoint on the passthrough (`replace` semantics, both the core and grouped path variants, mirroring the existing create/delete handlers).

- **New-template Save** (`/new` route): the dashboard detects a name collision **client-side** via the existing `workflowTemplatesService.list` (it already lists templates — no new API), and if the name is taken shows a dialog — *"A template named X already exists. Overwrite?"* — Confirm → overwrite via the **update endpoint** (PUT, in-place replace); Cancel → return to the chat, no destructive action.
- **Edit-mode Save** (`/edit` route): overwrite the same name silently — that is the whole intent of the edit flow — with "Save as new name" offered as a secondary action for users who want to fork.

No template versioning history is maintained — Argo does not natively model this, and inventing it would expand scope significantly. The conversation history in the session preserves the prompt-and-YAML trail; users who want history save under a new name.

### 10. Grounding tools: the generic `kubernetes-mcp-server`, no bespoke Ark MCP code

The author Agent grounds itself through the `kubernetes-mcp-server`'s generic `resources_list` tool, parameterised by `apiVersion`/`kind` — **no new Ark-specific MCP tool functions are written**. The system prompt maps each catalogue lookup to a `resources_list` call:

| Catalogue lookup | `resources_list` arguments |
|---|---|
| Agents | `apiVersion: ark.mckinsey.com/v1alpha1`, `kind: Agent` |
| Models | `apiVersion: ark.mckinsey.com/v1alpha1`, `kind: Model` |
| Teams | `apiVersion: ark.mckinsey.com/v1alpha1`, `kind: Team` |
| Workflow templates | `apiVersion: argoproj.io/v1alpha1`, `kind: WorkflowTemplate` |

`resources_list` is scoped to the current namespace — Ark query targets are namespace-local (a `Query` addresses an `Agent`/`Model`/`Team` by name in its own namespace, and `QueryTarget` has no namespace field), so there is no reason to list other namespaces. It returns the full resource objects; the system prompt instructs the Agent to read only the fields it needs (name, key spec fields, status phase) and to ignore the rest. The server is deployed read-only (Context 3), so these list calls are the only operations the Agent performs against it.

**Rationale:** one generic tool covers every present and future Ark kind, the prompt does the projection, and there is no Ark MCP tool surface to maintain or keep in sync with the CRDs.

**Alternative considered:** bespoke `list_models` / `list_teams` / `list_workflow_templates` tools in a custom Ark MCP server (the original design). Rejected — that duplicates what `resources_list` already does generically, and ties catalogue grounding to a service this change would otherwise not need to own.

### 11. The `ark-query` template

A chart-managed template in `services/argo-workflows/chart/templates/` (e.g. `ark-query-template.yaml`) renders a `WorkflowTemplate` named `ark-query` with an inner template (`query`) that other workflows reference via Argo's step/task-level `templateRef: {name: ark-query, template: query}`. It is installed with the argo-workflows chart on every Ark-with-Argo install (both `devspace` and production Helm). It factors out the inline recipe the three samples repeat today. The step runs the same `alpine/k8s` image those samples use (`kubectl` + `jq`).

**Inputs** (Argo parameters are strings):
- `target` (required) — `type/name` notation matching the ark CLI (e.g. `agent/weather`, `model/default`, `team/research`). The script splits on `/` into `spec.target.type` and `spec.target.name`.
- `input` (required) — the prompt; set verbatim as `spec.input` (mirrors the CRD field name).
- `timeout` (default `5m`) — set as `spec.timeout` **and** used to bound `kubectl wait --timeout`.
- `ttl` (optional) — `spec.ttl`; defaults to the webhook-resolved value when empty.
- `parameters` (optional, default `[]`) — a JSON array of `{name,value}` objects, injected as `spec.parameters` so `{{.param}}` templating works in `input`.
- `session-id`, `memory` (optional) — `spec.sessionId` and `spec.memory.name` for conversational threading.
- `query-name` (optional) — explicit Query name; otherwise generated as `q-{{workflow.name}}-{{pod.name}}` and labelled `workflow: {{workflow.name}}`.
- `service-account` (optional) — `spec.serviceAccount` for RBAC scoping of the query execution.

**Outputs:**
- `response` — `status.response.content`, the final/last assistant message (the headline result).
- `query-json` — the full Query object, for downstream steps that need token usage, target, or `conversationId`.
- `phase` — `status.phase` (`done` / `error`).
- `conversation-id` — `status.conversationId`; the handle a follow-up broker/memory transcript step would use.

**Multiple team-member messages.** Per Context 5, the Query CR exposes only the final message; the per-member transcript lives in memory/broker keyed by `conversationId`, reachable only via a service call (not kubectl). v1 therefore outputs the final content plus the full Query JSON and surfaces `conversation-id` as the explicit seam. A broker-backed transcript output is a follow-up, not a v1 deliverable.

**Error handling (Argo-integrated).** The script always writes all four output files **before** exiting — even on failure — so `continueOn: {failed: true}` consumers and Argo exit-handlers can still read `phase` / `response` / `query-json`. It then:
- exits `0` when `status.phase == done`;
- writes the error content (`status.response.content`) to `response` and exits non-zero on `status.phase == error` or when `kubectl wait` times out / the phase is otherwise not `done`.

A non-zero exit marks the Argo node Failed, so `retryStrategy`, `continueOn`, and exit-handlers behave naturally; callers that want to branch on failure read the still-present outputs.

### 12. Dashboard data flow

```
   /workflow-templates/new                          ┌──────────────────┐
   /workflow-templates/[id]/edit ── getYaml ──────▶ │   ark-api        │
                                    (seed draft)     │  resources       │
   ┌─────────────────────────┐                      │  passthrough     │
   │  Chat (left pane)       │────────── Save ─────▶ │ POST/PUT Workflow│
   │  - useSession()         │                       └─────────┬────────┘
   │  - useConversation()    │                                 │ on 2xx
   │  - chatService.submit   │  on submit:                     ▼
   │    (streaming)          │  if draft != lastAgentYaml,   push('/workflow-
   │                          │  prefix draft into input      templates/[id]')
   │  lastAgentYaml ◀── fence │
   └───────────┬─────────────┘
               │ agent fence (on stream end)   ▲ manual edits
               ▼                                │ (keystrokes)
   ┌───────────────────────────────────────────┴───────┐
   │            draftYaml  (single source of truth)      │
   └───────────┬─────────────────────────────┬──────────┘
               │ read                          │ read
               ▼                                ▼
   ┌────────────────────────┐        ┌────────────────────────┐
   │  DAG tab (read-only)   │        │  YAML tab (editable)   │
   │  - WorkflowDagViewer   │        │  - controlled textarea │
   └────────────────────────┘        └────────────────────────┘
```

The fenced-block extractor lives in a small utility module under `lib/utils/`. It runs **once per turn, on stream completion** — pulling the text between the opening ` ```yaml ` and its closing ` ``` ` in the final message and parsing it with `yaml.load` (js-yaml). Partial chunks are never fed to it, so the preview never sees a half-written graph. If the final parse fails (malformed YAML, or no fenced block) the previous `draftYaml` is kept and the chat surfaces that the agent's output could not be applied. Manual edits update `draftYaml` directly; the DAG shows the last valid parse.

### 13. Resolving the author Agent (configuration, not a dashboard setting)

The dashboard must know **which** Agent to dispatch authoring turns to. The **namespace** is not configured — it is always the currently-selected namespace (Decision 1), resolved the same way every other resource view resolves it via the `NamespaceProvider`. Only the agent **name** comes from configuration, read at runtime, with **no dashboard UI for it in v1**:

- One env var, following the existing `NEXT_PUBLIC_*` pattern (the route is a client component, like the `NEXT_PUBLIC_ARGO_URL` already read by the workflow-templates detail page):
  - `NEXT_PUBLIC_ARGO_MAKE_AUTHOR_AGENT` — the author Agent name. Defaults to `argo-make-author` (the name on the dashboard-bundled manifest) when unset.
- The chat panel dispatches every authoring turn to `{selectedNamespace}/{configuredName}`. The same `NamespaceProvider` scopes which resources the MCP `list_*` tools surface for composition, so the author Agent and the resources it can reference are always in the namespace the user is looking at.

**Rationale:**
- Per-namespace dispatch matches the user's mental model: switching namespaces switches to that install's author Agent, with no extra step.
- Pinning the *name* in config — not the UI — keeps that choice an operator/deploy concern, which is what the user wants for now. An operator can point the dashboard at a customised or differently-named author Agent purely by setting the env var; no settings screen, no per-user state.
- The default name means the out-of-the-box flow (install the bundled author Agent from the dashboard) works with zero configuration.

**Follow-up (parked):** a dashboard-side setting to select the author Agent, once there is a reason to vary it without redeploying. Out of scope for v1 by explicit request.

### 14. When the author Agent is not installed

The chat is an **enhancement layer over a manual editor that always works** — not a hard dependency. On mount (and whenever the selected namespace changes), the route checks for the configured author Agent in the current namespace via `agentsService.getByName(name)` (returns `null` if absent).

- **Missing:** show a non-blocking banner — *"Author agent `argo-make-author` isn't installed in namespace `<ns>`"* — with an **"Install author agent"** button that creates the Agent from the dashboard-bundled manifest in the current namespace via the resources passthrough (Decision 15); the chat composer is disabled until it succeeds. The **YAML editor, DAG preview, and Save remain fully functional** meanwhile:
  - On `/new`: a YAML-literate user can still hand-write or paste a template and Save it — the route degrades to a plain manual editor.
  - On `/[id]/edit`: the loaded template renders in the preview and stays hand-editable and saveable. **Editing an existing template never depends on the agent being present** — load and Save both go through the resources passthrough, not the agent.
- **Disappears mid-session** (agent deleted, or a dispatch call fails): surface the error inline in the chat and re-run the existence check to flip into the banner state. The `draftYaml` buffer is untouched, so no in-progress work is lost.

**Rationale:** install-on-demand means the agent legitimately may not be created yet (or not in *this* namespace). Coupling the whole route to its presence would make the workflow-template editor unusable for the exact YAML-literate users who can work without the agent. Degrading to a manual editor keeps the page useful in every state.

### 15. Installing the author Agent from the dashboard (reuse the resources passthrough)

Install is a button, not a `kubectl apply` — and it adds **no new write endpoint**. Creating the Agent reuses the existing generic resources passthrough, the same one Save uses for `WorkflowTemplate`:

```
manifest bundled in the dashboard                             →  canonical Agent manifest (single source of truth)
POST /api/v1/resources/apis/ark.mckinsey.com/v1alpha1/Agent?namespace=<ns>   →  create it (existing passthrough, reused)
```

The single source of truth for the default prompt is one manifest artifact bundled in the **dashboard** (spec + system prompt). Since the dashboard is its only consumer, there is no server surface to add — no ark-api endpoint at all. The **"Install author agent"** button (Decision 14) then: reads the bundled manifest, stamps the configured name (Decision 13), and POSTs it through the resources passthrough into the currently-selected namespace. On success the route re-runs the existence check, the banner clears, and the chat composer enables — no page reload, no CLI.

- **Idempotent:** the passthrough's create returns HTTP 409 if the Agent already exists (a second tab raced the install); the dashboard treats 409 as success. The banner only appears when the agent is absent (Decision 14), so the button's job is create-if-missing.
- **Update via the new PUT endpoint.** The passthrough now exposes GET / POST / DELETE **and** a generic update (PUT) endpoint (Decision 9). "Upgrade an existing agent to the latest default prompt" remains a parked follow-up, but when built it is a straightforward PUT (in-place replace) rather than a DELETE + re-create.
- The dashboard needs no bespoke CRD-authoring logic — it composes its bundled manifest with the create passthrough it already uses for Save.

**Rationale:**
- Keeps the prompt single-source: the one manifest artifact lives in the dashboard bundle; nothing is duplicated into ark-api or a chart.
- Reuses the existing create passthrough for the write rather than adding a parallel write endpoint — fewer endpoints, and the same auth path as every other dashboard write.

**Alternative considered:** a bespoke ark-api surface for the manifest — either a read-only `GET .../argo-make/author-agent/manifest`, or a `POST .../argo-make/author-agent` that reads a bundled file and creates the CRD server-side. Rejected — the manifest is consumed only by the dashboard, so any ark-api endpoint adds a server surface no other caller uses; bundling the manifest in the dashboard and POSTing through the existing resources passthrough keeps every write on the one generic endpoint with no new endpoint at all. **Trade-off:** iterating on the prompt now ships with a dashboard release rather than an ark-api one — acceptable for v1, revisited if the prompt must vary independently of the dashboard.

### 16. Test strategy

- **Unit (TypeScript):** the YAML extraction utility run on a complete message (single fence, multiple fences, fence with surrounding prose, malformed YAML, no-fence messages); the commit-on-completion behaviour (no `draftYaml` change from partial input, one commit when the turn ends); the draft-grounding diverge-check (equal → no prefix; diverged → prefix; freshly-loaded template → prefix on first turn); the install helper (stamps the configured name onto the bundled manifest before POSTing); and the missing-agent gating (agent present → composer enabled; `getByName` returns `null` → banner shown, composer disabled, editor + Save still enabled).
- **Unit (Python):** the generic resource update (PUT) endpoint — replaces a named resource in place.
- **Helm (lint/template):** the `kubernetes-mcp-server` umbrella chart renders with `config.read_only: true`, the namespace-scoped read-only RBAC, and the `HTTPRoute` enabled / Ingress disabled — matching the dev configuration.
- **Chainsaw (e2e):**
  - **Authoring happy path:** mock-llm seeded with a canned `WorkflowTemplate` response → assert the template is created and the user lands on the detail page.
  - **Install author agent:** open the route in a namespace with no author Agent → click Install → assert the Agent is created in that namespace (from the dashboard-bundled manifest via the resources passthrough), the banner clears, and the composer enables.
  - **Fail-and-tell-user:** the model is told to reference a non-existent agent → assert it refuses and no YAML is written.
  - **Edit + hand-edit grounding:** load an existing template, hand-edit the YAML, send a turn → assert the agent's next message is grounded on the edited draft (the prefix carried the manual edit).
  - **`ark-query` template:** run it against an agent target and a team target → assert `response` / `query-json` / `phase` / `conversation-id` outputs on success; force a query `error` → assert the node is Failed **and** the outputs are still readable.

### 17. Production deployment of `kubernetes-mcp-server` (umbrella chart, not just devspace)

The separate change that adds `kubernetes-mcp-server` wires it into `devspace dev` only. This feature depends on it at runtime, so it must also be installable in a production Ark deployment. Rather than re-deriving the dev config, add a `services/kubernetes-mcp-server/chart/` umbrella chart that mirrors `services/argo-workflows/chart/`:

- `Chart.yaml` declares the upstream chart as a dependency:
  ```yaml
  dependencies:
    - name: kubernetes-mcp-server
      version: 0.1.0
      repository: oci://ghcr.io/containers/charts
  ```
- `values.yaml` layers the same Ark configuration the dev deployment uses: `config.read_only: true`, a namespace-scoped read-only `Role`/`RoleBinding` (`get`/`list`/`watch`), and the `localhost-gateway` `HTTPRoute` with Ingress disabled.
- `manifest.yaml` + `build.mk` register the service so `make services` offers install/uninstall/dev, and the `deploy` workflow packages the chart and pushes it to the OCI chart registry next to the other service charts.

**Scope boundary:** the Ark `MCPServer` resource that registers this server with the cluster is **owned by the kubernetes-mcp-server change** (Context 3 / Open Question on registration was resolved to that change), not duplicated here. This chart deploys the server image; whatever registration that change ships applies equally in production.

**Rationale:**
- The umbrella-chart pattern is already proven in-repo (`argo-workflows`), so this adds no new deployment mechanism.
- Wrapping the upstream OCI chart keeps Ark's read-only/RBAC/routing opinions in one values file instead of scattered flags, and tracks upstream by bumping a single dependency version.

**Alternative considered:** inlining the deployment into an existing umbrella/bundle. Rejected — a dedicated service chart matches how every other optional service (argo-workflows, observability) is packaged and keeps it independently installable via `make services`.

## Risks / Trade-offs

- **The LLM can still emit invalid Argo YAML.** Without a lint loop, schema errors surface only at Save time as K8s API errors. **Mitigation:** the few-shot examples cover the patterns users actually need, and the `ark-query` template removes the most error-prone hand-written piece (a `templateRef` is far harder to get wrong than the full inline recipe). If error rate proves painful, add a workflow-lint step as a follow-up — the plug-in point is a check before Save.

- **No live/progressive DAG while the agent streams.** By explicit requirement (Decision 3) the preview updates only when the agent finishes, so the user watches the chat stream and the DAG appears in one step at the end rather than building live. **Trade-off accepted:** this is the desired behaviour — it removes mid-stream flicker and transient invalid DAGs entirely (no debounce, no partial-parse handling needed). Manual edits still reflect live, so the canvas is never frozen.

- **Fenced-block convention is fragile if the model emits prose around it.** A model that emits YAML in two blocks, or wraps it in extra text, breaks the extractor. **Mitigation:** the system prompt mandates a single fenced block at the end of the message; chainsaw tests pin the contract.

- **Manual edits and the agent can race.** If the user edits while the agent is streaming, the commit-on-completion could clobber the manual edit. **Mitigation:** the editable tab is read-only while a response is streaming; once the turn completes and the agent's block has committed, edits resume and the diverge-check re-grounds the next turn.

- **Grounding by prefix bloats history on every manual edit.** Each diverged turn carries a full YAML copy into the conversation/memory. **Mitigation:** inject only on divergence (not every turn); the volume is one template per manual-edit turn, which is acceptable. A server-side draft store would remove this entirely — tracked as the same follow-up that would enable the draft-inspection tool.

- **Out-of-the-box users have no author Agent until they install it** — and per-namespace dispatch means it can be absent in some namespaces but present in others. **Mitigation:** Decisions 14 & 15 — the route detects the missing agent and offers a one-click "Install author agent" button (the dashboard creates it in the current namespace from its bundled manifest via the resources passthrough); meanwhile the route degrades to a working manual YAML editor (Save still functions) rather than breaking.

- **Overwrite is destructive (no versioning).** A user iterating on the same template loses earlier versions. **Mitigation:** new-template Save confirms on collision; edit-mode Save is explicitly an overwrite with "Save as new name" available; the session conversation preserves the prompt-and-YAML trail.

- **The `ark-query` template's `target` parsing is string-based.** A malformed `target` (no `/`, unknown type) only fails at query-create time. **Mitigation:** the script validates the `type/name` split and the enum (`agent|team|model|tool`) up front and exits non-zero with a clear message, so the failure is an Argo node error rather than a confusing K8s rejection.

- **Author Agent quality depends on prompt engineering.** The whole experience rises and falls on the system prompt. **Mitigation:** the prompt lives in one place — the dashboard-bundled manifest — so it can be revised centrally (at the cost of a dashboard build, per Decision 2); few-shot examples drawn from real samples; chainsaw tests exercise the fail-fast rule and the grounding contract.

## Open Questions

1. **"+ New conversation" — within-session or new-session?** Default v1 answer: within-session. Final decision deferred until implementation reads the existing `conversations.ts` semantics from the recent sessions/conversations PR.

2. **What namespace does the author Agent run in?** *Resolved (Decision 1 / 13 / 15):* it is installed on demand from the dashboard into the **currently-selected namespace**, and the dashboard dispatches to the author Agent in that same namespace. Only the agent name is configured (`NEXT_PUBLIC_ARGO_MAKE_AUTHOR_AGENT`, default `argo-make-author`); the namespace always follows the `NamespaceProvider`, which also scopes the MCP `list_*` tools.

3. **Should the `WorkflowTemplate` listing filter to templates the user could plausibly riff on (e.g., excluding system templates)?** `resources_list` returns everything for the kind; the system prompt decides what to surface. Revisit if it produces noise.

4. **Empty-namespace UX.** When `resources_list` for `Agent` returns `[]`, the author Agent should still be useful for generic Argo steps. Confirm the system prompt handles this case explicitly.

5. **Argo lint plug-in point.** Not in scope for v1, but a follow-up should decide: lint as an MCP tool the author calls during composition, or as a dashboard-side check before Save? The latter is simpler and matches the "no prompt re-roll" feel.

6. **`ark-query` `parameters` ergonomics.** Passing `spec.parameters` as a JSON-array string is the lowest-friction Argo-native option, but it is awkward to hand-write. Confirm whether a JSON string is acceptable for v1 or whether the template should expose only `input` and defer parameterised prompts to a follow-up.

7. **Editable editor fidelity.** A controlled `<textarea>` ships with zero new dependencies but offers no YAML syntax affordances. Decide during implementation whether v1 warrants a lightweight highlighting layer, with a full editor (Monaco/CodeMirror) as a later follow-up.
