## ADDED Requirements

### Requirement: ark-query template shipped in the argo-workflows chart

The Ark argo-workflows Helm chart SHALL ship a reusable `WorkflowTemplate` named `ark-query` as a chart-managed resource under `services/argo-workflows/chart/templates/`. It SHALL be installed automatically whenever Ark-with-Argo is installed — both via `devspace` (the chart is deployed as a dependency when `ENABLE_ARGO=true`) and via the production Helm install / OCI-published chart. The template SHALL expose an inner template (`query`) that other workflows reference via Argo's step/task-level `templateRef: {name: ark-query, template: query}`. The step SHALL run the same `alpine/k8s` image the in-repo samples use (`kubectl` + `jq`).

#### Scenario: Template present on Argo install
- **WHEN** Ark is installed with Argo enabled (via `devspace` with `ENABLE_ARGO=true` or via the production Helm install)
- **THEN** a `WorkflowTemplate` named `ark-query` exists in the install namespace

#### Scenario: Referenced via templateRef
- **WHEN** a workflow step declares `templateRef: {name: ark-query, template: query}`
- **THEN** the step submits an Ark `Query` and returns the query's structured outputs without re-emitting the inline query-and-wait recipe

### Requirement: ark-query inputs

The `ark-query` template SHALL accept these Argo parameters (all strings). Required: `target` (`type/name` notation matching the ark CLI, e.g. `agent/weather`, `model/default`, `team/research`; split on `/` into `spec.target.type` and `spec.target.name`) and `input` (set verbatim as `spec.input`). Optional, drawn from `QuerySpec`: `timeout` (default `5m`, set as `spec.timeout` and used to bound `kubectl wait --timeout`); `ttl`; `parameters` (default `[]`, a JSON array of `{name,value}` objects injected as `spec.parameters`); `session-id` and `memory` (`spec.sessionId` and `spec.memory.name`); `query-name` (else generated as `q-{{workflow.name}}-{{pod.name}}` and labelled `workflow: {{workflow.name}}`); `service-account` (`spec.serviceAccount`).

#### Scenario: Required target and input
- **WHEN** a caller invokes `ark-query` with `target: agent/weather` and `input: "What is the weather in Paris?"`
- **THEN** the step creates a `Query` with `spec.target.type: agent`, `spec.target.name: weather`, and `spec.input` set to the prompt verbatim

#### Scenario: Defaults applied
- **WHEN** a caller omits `timeout`, `parameters`, and `query-name`
- **THEN** `timeout` defaults to `5m` (bounding both `spec.timeout` and `kubectl wait`), `parameters` defaults to `[]`, and the Query name is generated as `q-{{workflow.name}}-{{pod.name}}`

#### Scenario: Malformed target rejected up front
- **WHEN** `target` has no `/` separator or an unknown type (not one of `agent|team|model|tool`)
- **THEN** the step validates the `type/name` split and the enum up front and exits non-zero with a clear message, before attempting to create the Query

### Requirement: ark-query outputs

The `ark-query` template SHALL expose these outputs: `response` (`status.response.content`, the final assistant message); `query-json` (the full Query object, for downstream steps needing token usage, target, or `conversationId`); `phase` (`status.phase`, `done` / `error`); and `conversation-id` (`status.conversationId`). For a team target the Query CR exposes only the final assistant message in `status.response.content`; the per-member transcript lives in memory/broker keyed by `conversationId` and is NOT a v1 output — `conversation-id` is the explicit seam for a follow-up broker-backed transcript step.

#### Scenario: Outputs on success
- **WHEN** the referenced Query completes with `status.phase: done`
- **THEN** `response` carries `status.response.content`, `query-json` carries the full Query object, `phase` is `done`, and `conversation-id` carries `status.conversationId`

#### Scenario: Team target final message only
- **WHEN** the target is a team and the query completes
- **THEN** `response` carries the final assistant message from `status.response.content`
- **AND** no per-member transcript is emitted as a v1 output

### Requirement: Argo-integrated error handling

The `ark-query` step SHALL always write all four output files before exiting — even on failure — so `continueOn: {failed: true}` consumers and Argo exit-handlers can read `phase` / `response` / `query-json` regardless of outcome. The step SHALL exit `0` when `status.phase == done`, and SHALL write the error content (`status.response.content`) to `response` and exit non-zero when `status.phase == error` or when `kubectl wait` times out / the phase is otherwise not `done`. A non-zero exit SHALL mark the Argo node Failed so `retryStrategy`, `continueOn`, and exit-handlers integrate naturally.

#### Scenario: Success exit
- **WHEN** the query reaches `status.phase: done`
- **THEN** the step writes all outputs and exits `0`

#### Scenario: Query error exit with readable outputs
- **WHEN** the query reaches `status.phase: error`
- **THEN** the step writes `status.response.content` to `response`, writes the other outputs, and exits non-zero
- **AND** the Argo node is marked Failed while `phase` / `response` / `query-json` remain readable by downstream consumers

#### Scenario: Wait timeout exit
- **WHEN** `kubectl wait` times out or the phase is otherwise not `done`
- **THEN** the step writes its outputs and exits non-zero, marking the node Failed
