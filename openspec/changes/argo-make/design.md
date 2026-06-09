## Context

Five existing pieces of Ark infrastructure shape this design — without them the feature would require significantly more work:

1. **`WorkflowDagViewer` parses YAML locally.** `services/ark-dashboard/ark-dashboard/components/workflow-dag-viewer.tsx` imports `js-yaml` and uses `@xyflow/react` + `dagre` to render any `WorkflowTemplate` manifest as a DAG. It does not need the workflow to be submitted to Argo first. The same component will happily render YAML the LLM is mid-stream of producing, or YAML the user is hand-editing.
2. **The chat + session/conversation stack already exists.** `chatService` (`lib/services/chat.ts`), `conversationsService` (`lib/services/conversations.ts`), and the broker sessions were shipped with the recent sessions/conversations view. The author UI is a new consumer of that stack, not a new stack.
3. **The Ark MCP server is already wired up.** `services/ark-mcp/ark-mcp/src/ark_mcp/tools.py` exposes `list_agents` and `query_agent` today and uses `ark_sdk.client.with_ark_client`; the Agent CRD's `tools` block can reference an MCP server. Adding `list_models`, `list_teams`, and `list_workflow_templates` is a localised change.
4. **`WorkflowTemplate` read/write already goes through the resources passthrough.** `workflowTemplatesService` (`lib/services/workflow-templates.ts`) exposes `list`, `get`, `getYaml(name)`, and `run`. `getYaml` loads a template for the edit flow; `run()` already POSTs a `Workflow` to `/api/v1/resources/apis/argoproj.io/v1alpha1/Workflow`, proving the passthrough accepts POST. Save adds a `WorkflowTemplate` POST through the same endpoint — no new backend.
5. **The `Query` CR is the integration point between Argo and Ark.** `ark/api/v1alpha1/query_types.go` defines the contract: a query completes on `status.conditions[Completed]`, exposes `status.phase` (`done`/`error`/…) and a **single** `status.response` (since v0.1.50 the plural `responses[]` was collapsed). For a team target the controller sets `response.content` to the last assistant message (`ExtractLastAssistantMessageContent` in `executors/completions/message_helpers.go`). The per-member turns are persisted elsewhere keyed by `conversationId` — in memory (`executors/completions/memory.go`, `AddMessages`) and in the broker (`services/ark-broker/.../brokers/memory-broker.ts`, `getByConversation`) — **not** in the Query CR.

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
- The DAG preview updates progressively as the model streams its response and reflects manual edits live
- The model composes from generic Argo steps **and** the user's existing Ark agents, models, and teams
- The model **never invents** Ark resources that do not exist in the user's namespace; it lists what's available and asks
- Saved templates are indistinguishable from hand-written templates and land on the existing detail page
- The authoring conversation lives inside an Ark `Session` so it appears in the conversations view and can be resumed
- Argo workflows have an **Ark-native, reusable template** to run a `Query` with structured outputs and Argo-integrated error handling

**Non-Goals (v1):**
- Output types other than `WorkflowTemplate` (no `CronWorkflow`, no one-shot `Workflow`) from the authoring flow
- Lint / dry-run loop before Save (revisit if error rate hurts)
- Inline creation of missing Ark agents/models/teams as part of the same flow
- Canvas direct-manipulation (click-node-to-edit on the DAG); manual editing is raw-YAML only
- A server-side draft store and the agent-callable draft-inspection tool it would enable (prefix-injection covers grounding for now)
- Versioning of saved templates (Save overwrites, with confirmation on new / silently on edit)
- A broker-backed per-member transcript output for the `ark-query` template (the `conversation-id` output is the seam)
- Starter-prompt gallery / template marketplace
- Shipping the author Agent or the `ark-query` template in the Helm chart (sample-first; promote once stable)

## Decisions

### 1. Author lives as an Ark Agent CRD, not a new service

The LLM that drives authoring is `kind: Agent` in `services/argo-workflows/samples/argo-make-author.yaml`. Its `spec.prompt` carries the schema crib, the canonical recipes, and the fail-fast rule. Its `spec.tools` reference the Ark MCP server.

**Rationale:**
- Ark eats its own dog food — argo-make is itself an Ark resource
- Users get model swapping for free via `spec.modelRef`
- Iterating on the system prompt is a `kubectl apply`, not a release
- Reuses the existing dispatch / streaming / session machinery end-to-end

**Alternative considered:** Hard-code the author in a new dedicated service or inside `ark-api`. Rejected — it would create a parallel chat infrastructure and break the "everything is an Ark resource" story.

### 2. Sample-first, not chart-bundled

Both new YAML artifacts — the `argo-make-author` Agent and the `ark-query` `WorkflowTemplate` — live under `services/argo-workflows/samples/` and are installed by `kubectl apply`. Neither is a Helm chart template.

**Rationale:**
- The system prompt, few-shot examples, and the query template will need rapid iteration in the first weeks
- A chart bump per revision is the wrong cadence
- Users opting in keeps the surface area honest: the feature is real only once the sample is applied

Promote to chart-shipped once each has stabilised over a few releases.

### 3. The draft buffer is the single source of truth

A single `draftYaml` state in the route is the source of truth. It has **two writers** — the author Agent (the fenced ` ```yaml ` block in its latest message) and the user (manual edits in the YAML tab) — and three readers: the preview, Save, and agent-grounding (Decision 4).

The agent emits its `WorkflowTemplate` inside a single fenced ` ```yaml ` block. The dashboard watches the streaming text, extracts the block, debounces, parses with `js-yaml`, and on a successful parse commits it to `draftYaml`. The editable YAML tab writes the user's keystrokes straight to `draftYaml`.

This replaces the earlier model where the agent's last message was the source of truth — that could not accommodate manual edits.

**Editable editor:** the existing `CodeViewer` is a read-only `react-syntax-highlighter` (Prism) and cannot be made editable. The dashboard has no code-editor dependency (no Monaco/CodeMirror/Ace). For v1 the editable YAML tab is a controlled `<textarea>` (optionally with lightweight syntax styling) — zero new dependencies. `CodeViewer` remains the read-only renderer on the detail page and anywhere a static view is wanted. A richer in-browser editor is a follow-up.

**Rationale:**
- Reuses the existing chat streaming channel exactly as-is — no new event types, no new tool-call surface
- The DAG appears progressively as the model writes the YAML — the "Figma Make moment" — and reflects manual edits live
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

The author Agent calls `list_agents`, `list_models`, `list_teams` at runtime via the Ark MCP server. It does **not** receive the catalogue baked into its system prompt.

**Rationale:**
- A tenant with hundreds of agents would blow the prompt budget
- The catalogue stays fresh — newly-created agents are visible without restarting anything
- Dynamic calls cost two tool-call hops but are the only honest answer for a multi-tenant system

`list_workflow_templates` is included so the model can answer "build something like the X template" — useful for PMs working from a partial example.

### 7. Fail-and-tell-user is a system-prompt rule, not code

The author Agent's prompt contains a hard rule:

> Before referencing any Ark agent, model, or team, call the matching `list_*` tool. If the user names a resource that is not in the returned list, do not generate YAML that references it. Reply with the available alternatives and ask which to use.

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

Save POSTs `draftYaml` to `/api/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate` via a new method on `workflowTemplatesService`, then navigates to `/workflow-templates/[id]`.

- **New-template Save** (`/new` route): on a name collision (HTTP 409), show a dialog — *"A template named X already exists. Overwrite?"* — Confirm → overwrite (DELETE + POST, or PUT if available); Cancel → return to the chat, no destructive action.
- **Edit-mode Save** (`/edit` route): overwrite the same name silently — that is the whole intent of the edit flow — with "Save as new name" offered as a secondary action for users who want to fork.

No template versioning history is maintained — Argo does not natively model this, and inventing it would expand scope significantly. The conversation history in the session preserves the prompt-and-YAML trail; users who want history save under a new name.

### 10. ark-mcp tool additions

Three new tools in `services/ark-mcp/ark-mcp/src/ark_mcp/tools.py`, each following the existing `list_agents` shape:

```python
@mcp.tool
async def list_models(namespace: str = DEFAULT_NAMESPACE) -> list[dict]:
    """List all models in the specified namespace."""

@mcp.tool
async def list_teams(namespace: str = DEFAULT_NAMESPACE) -> list[dict]:
    """List all teams in the specified namespace."""

@mcp.tool
async def list_workflow_templates(namespace: str = DEFAULT_NAMESPACE) -> list[dict]:
    """List all Argo WorkflowTemplates in the specified namespace."""
```

Each returns a minimal projection: name, namespace, key spec fields (e.g., `members` for teams, annotations for workflow templates), and status phase. Tools use `ark_sdk.client.with_ark_client` for Ark resources; `list_workflow_templates` calls the K8s API directly (Argo types are not in the Ark SDK).

### 11. The `ark-query` template

`services/argo-workflows/samples/ark-query-template.yaml` is a `WorkflowTemplate` named `ark-query` with an inner template (`query`) that other workflows reference via Argo's step/task-level `templateRef: {name: ark-query, template: query}`. It factors out the inline recipe the three samples repeat today. The step runs the same `alpine/k8s` image those samples use (`kubectl` + `jq`).

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
   │  Chat (left pane)       │────────── Save ─────▶ │ POST WorkflowTpl │
   │  - useSession()         │                       └─────────┬────────┘
   │  - useConversation()    │                                 │ on 201
   │  - chatService.submit   │  on submit:                     ▼
   │    (streaming)          │  if draft != lastAgentYaml,   push('/workflow-
   │                          │  prefix draft into input      templates/[id]')
   │  lastAgentYaml ◀── fence │
   └───────────┬─────────────┘
               │ agent fence (on parse)        ▲ manual edits
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

The fenced-block extractor lives in a small utility module under `lib/utils/`. It tolerates partial / streaming input by attempting `yaml.load` (js-yaml) on whatever has been received between the opening ` ```yaml ` and the next `\n` ``` ` (or end-of-stream). Parse failures during streaming are silently swallowed; `draftYaml` (and thus the preview) only updates from the agent when parsing succeeds. Manual edits update `draftYaml` directly regardless of parse state; the DAG simply shows the last valid parse.

### 13. Test strategy

- **Unit (TypeScript):** the YAML extraction utility (partial streams, multiple fences, malformed YAML, no-fence messages) and the draft-grounding diverge-check (equal → no prefix; diverged → prefix; freshly-loaded template → prefix on first turn).
- **Unit (Python):** the new MCP tools — namespace-scoped, empty-namespace, error mapping.
- **Chainsaw (e2e):**
  - **Authoring happy path:** mock-llm seeded with a canned `WorkflowTemplate` response → assert the template is created and the user lands on the detail page.
  - **Fail-and-tell-user:** the model is told to reference a non-existent agent → assert it refuses and no YAML is written.
  - **Edit + hand-edit grounding:** load an existing template, hand-edit the YAML, send a turn → assert the agent's next message is grounded on the edited draft (the prefix carried the manual edit).
  - **`ark-query` template:** run it against an agent target and a team target → assert `response` / `query-json` / `phase` / `conversation-id` outputs on success; force a query `error` → assert the node is Failed **and** the outputs are still readable.

## Risks / Trade-offs

- **The LLM can still emit invalid Argo YAML.** Without a lint loop, schema errors surface only at Save time as K8s API errors. **Mitigation:** the few-shot examples cover the patterns users actually need, and the `ark-query` template removes the most error-prone hand-written piece (a `templateRef` is far harder to get wrong than the full inline recipe). If error rate proves painful, add `lint_workflow` as a follow-up — the plug-in point is a check before Save.

- **Streaming-YAML preview can flicker.** A partial chunk may parse as a different DAG than the next chunk. **Mitigation:** debounce extraction (e.g., 150ms); only commit to `draftYaml` on successful parse; show the previous DAG until the new one is valid.

- **Fenced-block convention is fragile if the model emits prose around it.** A model that emits YAML in two blocks, or wraps it in extra text, breaks the extractor. **Mitigation:** the system prompt mandates a single fenced block at the end of the message; chainsaw tests pin the contract.

- **Manual edits and the agent can race.** If the user edits while the agent is streaming, the fence parse could clobber the manual edit. **Mitigation:** the editable tab is read-only while a response is streaming; once the turn completes, edits resume and the diverge-check re-grounds the next turn.

- **Grounding by prefix bloats history on every manual edit.** Each diverged turn carries a full YAML copy into the conversation/memory. **Mitigation:** inject only on divergence (not every turn); the volume is one template per manual-edit turn, which is acceptable. A server-side draft store would remove this entirely — tracked as the same follow-up that would enable the draft-inspection tool.

- **Sample-first means out-of-the-box users see no "argo-make" feature.** Until they `kubectl apply` the author Agent, the new route is just an empty chat. **Mitigation:** the empty-state of the route surfaces an "Install argo-make-author" hint with the apply command. Promote to chart-shipped once stable.

- **Overwrite is destructive (no versioning).** A user iterating on the same template loses earlier versions. **Mitigation:** new-template Save confirms on collision; edit-mode Save is explicitly an overwrite with "Save as new name" available; the session conversation preserves the prompt-and-YAML trail.

- **The `ark-query` template's `target` parsing is string-based.** A malformed `target` (no `/`, unknown type) only fails at query-create time. **Mitigation:** the script validates the `type/name` split and the enum (`agent|team|model|tool`) up front and exits non-zero with a clear message, so the failure is an Argo node error rather than a confusing K8s rejection.

- **Author Agent quality depends on prompt engineering.** The whole experience rises and falls on the system prompt. **Mitigation:** sample-first lets us iterate without releases; few-shot examples drawn from real samples; chainsaw tests exercise the fail-fast rule and the grounding contract.

## Open Questions

1. **"+ New conversation" — within-session or new-session?** Default v1 answer: within-session. Final decision deferred until implementation reads the existing `conversations.ts` semantics from the recent sessions/conversations PR.

2. **What namespace does the author Agent run in by default?** Likely `default`, with the `NamespaceProvider` from the dashboard scoping which resources the MCP tools see. To confirm during implementation.

3. **Should `list_workflow_templates` filter to templates the user could plausibly riff on (e.g., excluding system templates)?** Initial answer: return everything; let the system prompt decide what to surface. Revisit if it produces noise.

4. **Empty-namespace UX.** When `list_agents` returns `[]`, the author Agent should still be useful for generic Argo steps. Confirm the system prompt handles this case explicitly.

5. **Argo lint plug-in point.** Not in scope for v1, but a follow-up should decide: lint as an MCP tool the author calls during composition, or as a dashboard-side check before Save? The latter is simpler and matches the "no prompt re-roll" feel.

6. **`ark-query` `parameters` ergonomics.** Passing `spec.parameters` as a JSON-array string is the lowest-friction Argo-native option, but it is awkward to hand-write. Confirm whether a JSON string is acceptable for v1 or whether the template should expose only `input` and defer parameterised prompts to a follow-up.

7. **Editable editor fidelity.** A controlled `<textarea>` ships with zero new dependencies but offers no YAML syntax affordances. Decide during implementation whether v1 warrants a lightweight highlighting layer, with a full editor (Monaco/CodeMirror) as a later follow-up.
