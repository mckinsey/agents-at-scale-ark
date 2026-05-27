## Context

Three existing pieces of Ark infrastructure shape this design — without them the feature would require significantly more work:

1. **`WorkflowDagViewer` parses YAML locally.** `services/ark-dashboard/ark-dashboard/components/workflow-dag-viewer.tsx` uses `@xyflow/react` + `dagre` to render any `WorkflowTemplate` manifest as a DAG. It does not need the workflow to be submitted to Argo first. The same component will happily render YAML the LLM is mid-stream of producing.
2. **The chat + session/conversation stack already exists.** `chatService`, `conversationsService`, and `broker-sessions` were shipped with the recent sessions/conversations view. The author UI is a new consumer of that stack, not a new stack.
3. **The Ark MCP server is already wired up.** `services/ark-mcp` exposes `list_agents` and `query_agent` today; the Agent CRD's `tools` block can reference an MCP server. Adding `list_models`, `list_teams`, and `list_workflow_templates` is a localised change.

Two existing in-repo samples encode the canonical pattern for invoking an Ark resource from inside an Argo step (`kubectl apply` a `Query`, `kubectl wait`, extract `status.response.content`):
- `services/argo-workflows/samples/a2a-arithmetic-workflow.yaml`
- `services/argo-workflows/samples/query-fanout-template.yaml`

These are the few-shot library — no new sample library is needed.

## Goals / Non-Goals

**Goals:**
- A non-technical PM can describe a workflow in natural language and receive runnable Argo YAML
- The DAG preview updates progressively as the model streams its response
- The model composes from generic Argo steps **and** the user's existing Ark agents, models, and teams
- The model **never invents** Ark resources that do not exist in the user's namespace; it lists what's available and asks
- Saved templates are indistinguishable from hand-written templates and land on the existing detail page
- The authoring conversation lives inside an Ark `Session` so it appears in the conversations view and can be resumed

**Non-Goals (v1):**
- Output types other than `WorkflowTemplate` (no `CronWorkflow`, no one-shot `Workflow`)
- Lint / dry-run loop before Save (revisit if error rate hurts)
- Inline creation of missing Ark agents/models/teams as part of the same flow
- Canvas direct-manipulation (click-node-to-edit)
- Versioning of saved templates (Save overwrites, with confirmation)
- Starter-prompt gallery / template marketplace
- Shipping the author Agent in the Helm chart (sample-first; promote to chart once the prompt is stable)

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

The Agent YAML lives under `services/argo-workflows/samples/` and is installed by `kubectl apply`. It is NOT a Helm chart template.

**Rationale:**
- The system prompt and few-shot examples will need rapid iteration in the first weeks
- A chart bump per prompt revision is the wrong cadence
- Users opting in keeps the surface area honest: the feature is real only once the sample is applied

Promote to chart-shipped once the prompt has stabilised over a few releases.

### 3. YAML transport: a fenced ```yaml block in the assistant message

The author Agent emits its final `WorkflowTemplate` inside a single fenced ```yaml block. The dashboard watches the streaming text, extracts the block, debounces, parses with `js-yaml`, and feeds it into `WorkflowDagViewer`.

**Rationale:**
- Reuses the existing chat streaming channel exactly as-is — no new event types, no new tool-call surface
- The DAG appears progressively as the model writes the YAML — the "Figma Make moment"
- The same fenced block is what the Save button reads, so there is one source of truth

**Alternative considered:** A dedicated `propose_workflow(yaml)` tool call. Rejected for v1 — it would require the chat UI to surface tool-call results in a custom way, and provides no behaviour the fence-extraction approach lacks.

### 4. Grounding via MCP tools (not prompt-injected catalogue)

The author Agent calls `list_agents`, `list_models`, `list_teams` at runtime via the Ark MCP server. It does **not** receive the catalogue baked into its system prompt.

**Rationale:**
- A tenant with hundreds of agents would blow the prompt budget
- The catalogue stays fresh — newly-created agents are visible without restarting anything
- Dynamic calls cost two tool-call hops but are the only honest answer for a multi-tenant system

`list_workflow_templates` is included so the model can answer "build something like the X template" — useful for PMs working from a partial example.

### 5. Fail-and-tell-user is a system-prompt rule, not code

The author Agent's prompt contains a hard rule:

> Before referencing any Ark agent, model, or team, call the matching `list_*` tool. If the user names a resource that is not in the returned list, do not generate YAML that references it. Reply with the available alternatives and ask which to use.

No webhook, no validator, no policy engine. The enforcement mechanism is the LLM following its instructions, which is consistent with how Ark agents work generally.

**Risk:** A poorly-tuned model could violate the rule. **Mitigation:** Few-shot examples in the prompt demonstrate the refusal pattern; a chainsaw test exercises the negative case with mock-llm.

### 6. Conversations within a session: explicit "New conversation"

The route opens in the context of an Ark `Session`. The chat panel shows a "+ New conversation" control. Clicking it starts a fresh `Conversation` inside the same `Session` — never automatic, never on save.

**Rationale:**
- Matches the user's mental model from chat tools (Cursor, Claude, ChatGPT)
- A single workflow-design session can host an iteration history without polluting the sessions list
- The user has already stated this preference; surfacing a button is the simplest implementation

**Open question parked:** whether "+ New conversation" should ever create a new `Session` instead. The simpler answer (always new conversation within the current session) wins for v1 unless the existing semantics force otherwise. Final call requires a closer read of `conversations.ts` during implementation.

### 7. Save semantics: overwrite with confirmation

Save POSTs to `/api/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate`. If the name collides:
- Show a dialog: *"A template named X already exists. Overwrite?"*
- Confirm → DELETE + POST (or PUT if available); then navigate to `/workflow-templates/{name}`
- Cancel → return to the chat, no destructive action

No template versioning history is maintained — Argo does not natively model this, and inventing it would expand scope significantly. Users who want history can save under a new name.

### 8. ark-mcp tool additions

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

### 9. Dashboard data flow

```
   /workflow-templates/new                ┌──────────────────┐
   ─────────────────────                  │   ark-api        │
                                          │  resources       │
   ┌────────────────────────┐             │  passthrough     │
   │  Chat (left pane)      │─── Save ───▶│                  │
   │  - useSession()        │             │ POST WorkflowTpl │
   │  - useConversation()   │             └─────────┬────────┘
   │  - chatService.submit  │                       │
   │    (streaming)         │                       │ on 201
   │                         │                       ▼
   │  state: lastYamlBlock  │             push('/workflow-
   └───────────┬────────────┘              templates/{name}')
               │ on each chunk
               ▼ extract fence
   ┌────────────────────────┐
   │  Preview (right pane)  │
   │  - WorkflowDagViewer   │  ◀── existing component
   │  - CodeViewer (YAML)   │  ◀── existing component
   │  - Tabs: Tree / YAML   │
   └────────────────────────┘
```

The fenced-block extractor lives in a small utility module under `lib/utils/`. It tolerates partial / streaming input by attempting `yaml.load` on whatever has been received between the opening ` ```yaml ` and the next `\n```` ` (or end-of-stream). Parse failures during streaming are silently swallowed; the preview only updates when parsing succeeds.

### 10. Test strategy

- **Unit (TypeScript):** YAML extraction utility — partial streams, multiple fences, malformed YAML, no-fence messages
- **Unit (Python):** New MCP tools — namespace-scoped, empty-namespace, error mapping
- **Chainsaw (e2e):** mock-llm seeded with a canned `WorkflowTemplate` response → assert the template is created and the user lands on the detail page; negative case where the model is told to reference a non-existent agent → assert it refuses and the YAML is not written

## Risks / Trade-offs

- **The LLM can still emit invalid Argo YAML.** Without a lint loop, schema errors surface only at Save time as K8s API errors. **Mitigation:** the few-shot examples cover the patterns users actually need; the canonical recipe for Ark steps is copy-pasteable. If error rate proves painful, add `lint_workflow` as a follow-up — the place to plug it in is decided (a check before Save).

- **Streaming-YAML preview can flicker.** A partial chunk may parse as a different DAG than the next chunk. **Mitigation:** debounce extraction (e.g., 150ms); only update preview on successful parse; show the previous DAG until the new one is valid.

- **Fenced-block convention is fragile if the model emits prose around it.** A model that decides to put YAML in two blocks, or wraps it in extra text, breaks the extractor. **Mitigation:** system prompt mandates a single fenced block at the end of the message; chainsaw tests pin the contract.

- **Sample-first means out-of-the-box users see no "argo-make" feature.** Until they `kubectl apply` the author Agent, the new route is just an empty chat. **Mitigation:** the empty-state of the new route surfaces a "Install argo-make-author" hint with the apply command. Promote to chart-shipped once stable.

- **No template versioning means overwrite is destructive.** A user iterating on the same template loses earlier versions. **Mitigation:** the confirm dialog makes overwrites explicit; the conversation history in the session preserves the prompt-and-YAML trail; users can save under a new name.

- **Author Agent quality depends on prompt engineering.** The whole experience rises and falls on the system prompt. **Mitigation:** sample-first lets us iterate without releases; few-shot examples drawn from real samples; chainsaw test exercises the fail-fast rule.

## Open Questions

1. **"+ New conversation" — within-session or new-session?** Default v1 answer: within-session. Final decision deferred until implementation reads the existing `conversations.ts` semantics from the recent sessions/conversations PR.

2. **What namespace does the author Agent run in by default?** Likely `default`, with the `NamespaceProvider` from the dashboard scoping which resources the MCP tools see. To confirm during implementation.

3. **Should `list_workflow_templates` filter to templates the user could plausibly riff on (e.g., excluding system templates)?** Initial answer: return everything; let the system prompt decide what to surface. Revisit if it produces noise.

4. **Empty-namespace UX.** When `list_agents` returns `[]`, the author Agent should still be useful for generic Argo steps. Confirm the system prompt handles this case explicitly.

5. **Argo lint plug-in point.** Not in scope for v1, but a follow-up should decide: lint as an MCP tool the author calls during composition, or as a dashboard-side check before Save? The latter is simpler and matches the "no prompt re-roll" feel.
