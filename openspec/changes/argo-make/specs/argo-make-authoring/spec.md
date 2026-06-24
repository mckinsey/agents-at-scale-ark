## ADDED Requirements

### Requirement: Draft buffer is the single source of truth

The authoring route SHALL maintain a single `draftYaml` buffer as the source of truth for the workflow being authored. The buffer SHALL have exactly two writers — the author Agent (the fenced ` ```yaml ` block in its latest message) and the user (manual edits in the editable YAML tab) — and three readers: the DAG preview, Save, and agent grounding. The preview, Save, and grounding SHALL all read from `draftYaml`, so they can never disagree.

#### Scenario: Agent block commits to the draft
- **WHEN** the author Agent finishes streaming a turn containing a single fenced ` ```yaml ` block
- **THEN** the route extracts the block, parses it with `js-yaml`, and on a successful parse commits the parsed YAML to `draftYaml` in a single step
- **AND** the DAG preview and the editable YAML tab both reflect the new `draftYaml`

#### Scenario: Manual edit commits to the draft
- **WHEN** the user edits the YAML in the editable tab
- **THEN** the keystrokes write directly to `draftYaml`
- **AND** the DAG preview reflects the last valid parse

### Requirement: Preview updates only on stream completion

The DAG preview SHALL NOT track the agent's response mid-stream. The agent writer SHALL commit to `draftYaml` exactly once per turn, on stream completion. Partial chunks SHALL never be fed to the fenced-block extractor. Manual edits SHALL continue to reflect live as the user types.

#### Scenario: No mid-stream DAG churn
- **WHEN** the author Agent is still streaming a response
- **THEN** the DAG preview does not change
- **AND** the user sees streaming progress only in the chat message

#### Scenario: Malformed final block is not applied
- **WHEN** the agent's completed turn contains malformed YAML or no fenced block
- **THEN** `draftYaml` retains its previous value
- **AND** the chat surfaces that the agent's output could not be applied

### Requirement: Agent grounding by diverge-check

The route SHALL track `draftYaml` (the buffer) and `lastAgentYaml` (the fence from the agent's most recent message). On each user turn, if `draftYaml !== lastAgentYaml`, the client SHALL prepend the current draft to the user's input as a context block instructing the agent to apply the change to that YAML. If they are equal, the client SHALL send the user's text alone. The agent SHALL always reply with a full replacement block, which overwrites `draftYaml` and updates `lastAgentYaml`. The draft SHALL never leave the browser until Save.

#### Scenario: Diverged draft is injected
- **WHEN** the user hand-edited the YAML so `draftYaml !== lastAgentYaml`
- **AND** the user submits a turn
- **THEN** the client prepends the current `draftYaml` to the user's input as a context block

#### Scenario: Matching draft is not re-injected
- **WHEN** `draftYaml === lastAgentYaml`
- **AND** the user submits a turn
- **THEN** the client sends the user's text alone, with no YAML prefix

#### Scenario: Freshly loaded template grounds on first turn
- **WHEN** an existing template was loaded into `draftYaml` with `lastAgentYaml` unset
- **AND** the user submits the first turn
- **THEN** the client prepends the loaded `draftYaml` to the input

### Requirement: Resource-grounded composition

The author Agent SHALL ground query steps on the user's existing Ark resources via the `kubernetes-mcp-server`'s generic `resources_list` tool, scoped to the current namespace. Before referencing any Ark agent, model, or team as a query target, the Agent SHALL list that kind and confirm the named target is present and not in a failed/unavailable status. The Agent SHALL NOT generate YAML that references a resource absent from the returned list; instead it SHALL reply with the available alternatives and ask which to use. Verification SHALL occur the first time a target is mentioned in the conversation only; once verified, the Agent SHALL NOT re-verify the same target on later turns. Loading an existing template SHALL NOT trigger verification of targets already referenced in it.

#### Scenario: Existing target is verified once
- **WHEN** the user asks for a template that queries `agent/weather`
- **AND** `resources_list` for kind `Agent` returns a `weather` agent in an available status
- **THEN** the Agent emits a query step referencing `agent/weather`
- **AND** does not call `resources_list` for that target again on later turns

#### Scenario: Missing target is refused
- **WHEN** the user asks for a template that queries a target absent from the `resources_list` result
- **THEN** the Agent does not generate YAML referencing it
- **AND** replies with the available alternatives and asks which to use

#### Scenario: Inexact name resolved or confirmed
- **WHEN** the user names a target inexactly (e.g. "the weather agent")
- **AND** the Agent is 100% sure of the match from the listing
- **THEN** it uses the resolved exact name (e.g. `agent/weather`)
- **AND WHEN** the Agent is not certain, it asks the user to confirm which listed candidate they meant rather than guessing

#### Scenario: Loaded template targets are not re-verified
- **WHEN** the author opens an existing `WorkflowTemplate` to edit
- **THEN** it does not call `resources_list` for the targets already referenced in that YAML

### Requirement: Generated YAML collapsed by default in the authoring chat

The authoring route SHALL render the chat with code blocks collapsed by default, so the author Agent's full-replacement ` ```yaml ` block does not flood the conversation. The user SHALL be able to expand any block manually. The default-collapsed setting SHALL be scoped to this route — it SHALL NOT change the default elsewhere the chat component is used. The collapse state SHALL be presentation only and SHALL NOT affect `draftYaml`, the diverge-check grounding, or the DAG preview.

#### Scenario: Agent YAML arrives collapsed

- **WHEN** the author Agent finishes a turn containing a fenced ` ```yaml ` block
- **THEN** the block renders collapsed in the chat by default
- **AND** the user can expand it manually

#### Scenario: Collapse does not affect the draft or grounding

- **WHEN** the user collapses or expands the agent's YAML block in the chat
- **THEN** `draftYaml`, the diverge-check, and the DAG preview are unchanged

### Requirement: Output restricted to WorkflowTemplate

For v1 the authoring flow SHALL produce only `kind: WorkflowTemplate` output. `CronWorkflow` and one-shot `Workflow` output SHALL be out of scope for v1.

#### Scenario: Only WorkflowTemplate is produced
- **WHEN** the user asks for a scheduled run (CronWorkflow) or a run-now one-shot Workflow
- **THEN** the author produces a `WorkflowTemplate` and does not emit `CronWorkflow` or one-shot `Workflow` kinds
