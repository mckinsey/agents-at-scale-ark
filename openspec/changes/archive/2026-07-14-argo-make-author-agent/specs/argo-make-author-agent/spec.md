## ADDED Requirements

### Requirement: Author Agent is an Ark Agent CRD with a bundled manifest

The author SHALL be an Ark `kind: Agent`, defined by a canonical `argo-make-author` manifest (spec plus system prompt) that is the single source of truth for the author. The manifest SHALL be bundled in the dashboard, which is its only consumer. The default name SHALL be `argo-make-author`. Users SHALL be able to swap the backing model via `spec.modelRef` without changing the manifest's prompt or tools.

#### Scenario: Bundled manifest is the source of truth

- **WHEN** the author Agent is created in a namespace
- **THEN** it is created from the dashboard-bundled `argo-make-author` manifest
- **AND** the same manifest defines its `spec.prompt` and `spec.tools`
- **AND** no parallel sample or chart copy of the prompt exists to drift from it

#### Scenario: Model is swappable via modelRef

- **WHEN** an operator points the author Agent at a different model
- **THEN** they change `spec.modelRef` only
- **AND** the system prompt and `spec.tools` are unchanged

### Requirement: spec.tools enumerate the MCP tools by name

The author Agent's `spec.tools` SHALL list the individual `Tool`-CRD names `resources_list` and `resources_get`, each as a `{type: mcp, name: …}` entry. It SHALL NOT reference an `MCPServer` wholesale. The enumerated names SHALL match the names the kubernetes-mcp-server registration (PR #2536) materialises as `Tool` CRDs.

#### Scenario: Tools are referenced individually by name

- **WHEN** the bundled manifest declares the author Agent's tools
- **THEN** `spec.tools` contains `{type: mcp, name: resources_list}` and `{type: mcp, name: resources_get}`
- **AND** it contains no wholesale `MCPServer` reference

#### Scenario: Tool names match the registration

- **WHEN** the kubernetes-mcp-server registration materialises its tools as `Tool` CRDs
- **THEN** the manifest's enumerated tool names match those `Tool`-CRD names exactly

### Requirement: System prompt documents per-kind resources_list calls

The author Agent's system prompt SHALL map each catalogue lookup to a `resources_list` call scoped to the current namespace: `Agent`, `Model`, and `Team` via `apiVersion: ark.mckinsey.com/v1alpha1`; `WorkflowTemplate` via `apiVersion: argoproj.io/v1alpha1`. The prompt SHALL instruct the Agent to read only the fields it needs (name, key spec fields, status phase) and ignore the rest. The prompt SHALL scope listing to the current namespace because Ark query targets are namespace-local — a `Query` addresses an `Agent`/`Model`/`Team` by name in its own namespace, and `QueryTarget` has no namespace field.

#### Scenario: Each Ark kind maps to a resources_list call

- **WHEN** the author needs to list a catalogue kind
- **THEN** it calls `resources_list` with `apiVersion: ark.mckinsey.com/v1alpha1` and `kind: Agent`, `Model`, or `Team`
- **AND** for workflow templates it calls `resources_list` with `apiVersion: argoproj.io/v1alpha1` and `kind: WorkflowTemplate`

#### Scenario: Listing is namespace-local

- **WHEN** the author lists any catalogue kind
- **THEN** the `resources_list` call is scoped to the current namespace
- **AND** it does not list other namespaces, because query targets are namespace-local

#### Scenario: Only needed fields are read

- **WHEN** `resources_list` returns full resource objects
- **THEN** the author reads only the name, key spec fields, and status phase
- **AND** ignores the rest of each object

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

### Requirement: Embedding Ark queries via the ark-query templateRef

The author Agent's system prompt SHALL teach embedding Ark queries inside Argo steps by referencing the shipped `ark-query` `WorkflowTemplate` (from the `argo-query-template` change) via Argo's `templateRef`. The prompt SHALL retain the inline `kubectl apply` query-and-wait recipe as a fallback few-shot example.

#### Scenario: Query step uses the ark-query templateRef

- **WHEN** the author emits a step that runs an Ark `Query`
- **THEN** it references the `ark-query` template via `templateRef`
- **AND** does not regenerate the full inline `kubectl apply` recipe by default

#### Scenario: Inline recipe is available as a fallback

- **WHEN** the `ark-query` template cannot be used for a step
- **THEN** the prompt's inline `kubectl apply` recipe is available as a fallback few-shot example

### Requirement: Output restricted to WorkflowTemplate

For v1 the author Agent SHALL produce only `kind: WorkflowTemplate` output. `CronWorkflow` and one-shot `Workflow` output SHALL be out of scope for v1.

#### Scenario: Only WorkflowTemplate is produced

- **WHEN** the user asks for a scheduled run (CronWorkflow) or a run-now one-shot Workflow
- **THEN** the author produces a `WorkflowTemplate` and does not emit `CronWorkflow` or one-shot `Workflow` kinds
