## Why

Ark ships Argo Workflows as a first-class service, but there is no Ark-native way to submit a `Query` from an Argo workflow. Every sample today (`query-fanout-template.yaml`, `a2a-arithmetic-workflow.yaml`, `weather-workflow-template.yaml`) re-emits the same inline recipe — `kubectl apply` a `Query`, `kubectl wait --for=condition=Completed`, `jq` the result, exit non-zero on error. This boilerplate is the single most error-prone piece a workflow author has to reproduce by hand.

Shipping it as one reusable, well-tested template closes the gap for hand-written workflows and gives a canonical building block to reference instead of regenerating the recipe each time. Because the generated workflows submit real `Query` resources, the template must be reliably present wherever Argo is — a chart-managed resource guarantees that, where a `kubectl apply`-only sample would not.

This `ark-query` template is the canonical building block the argo-make author Agent references via `templateRef` (the author-agent and authoring-UI changes depend on it); hand-written workflows reuse it the same way.

## What Changes

- Ship a reusable `WorkflowTemplate` named `ark-query` as a managed resource in the argo-workflows Helm chart (`services/argo-workflows/chart/templates/`), installed automatically on every Ark-with-Argo install — both via `devspace` (chart deployed as a dependency when `ENABLE_ARGO=true`) and via the production Helm install / OCI-published chart.
- Expose an inner `query` template that workflows reference via `templateRef: {name: ark-query, template: query}`. The step runs the `alpine/k8s` image (`kubectl` + `jq`) the in-repo samples use.
- **Inputs** (Argo params, all strings):
  - *Required:*
    - `target` — `type/name` notation matching the ark CLI (e.g. `agent/weather`, `model/default`, `team/research`); split on `/` into `spec.target.type` / `spec.target.name`, validating the enum `agent|team|model|tool` up front.
    - `input` — the prompt; set verbatim as `spec.input`.
  - *Optional* (drawn from `QuerySpec`):
    - `timeout` — default `5m`; bounds both `spec.timeout` and `kubectl wait`.
    - `ttl`.
    - `parameters` — default `[]`, a JSON array of `{name,value}` objects injected as `spec.parameters`.
    - `session-id` and `memory` — `spec.sessionId` and `spec.memory.name`.
    - `query-name` — else generated as `q-{{workflow.name}}-{{pod.name}}` and labelled `workflow: {{workflow.name}}`.
    - `service-account` — `spec.serviceAccount`.
- **Outputs:**
  - `response` — `status.response.content`, the final assistant message.
  - `query-json` — the full Query object, for downstream steps needing token usage, target, or `conversationId`.
  - `phase` — `status.phase` (`done` / `error`).
  - `conversation-id` — `status.conversationId`.
- **Team targets:** the Query CR exposes only the final assistant message in `status.response.content`; the per-member transcript lives in memory/broker keyed by `conversationId` and is NOT a v1 output. `conversation-id` is the explicit seam for a follow-up broker-backed transcript step.
- **Error handling:** the step always writes all four output files before exiting — even on failure — so `continueOn: {failed: true}` consumers and Argo exit-handlers can read `phase` / `response` / `query-json` regardless of outcome. It exits `0` on `done`, and writes the error content (`status.response.content`) to `response` and exits non-zero on `error`, a `kubectl wait` timeout, or any non-`done` phase. A non-zero exit marks the Argo node Failed so `retryStrategy`, `continueOn`, and exit-handlers integrate naturally.

## Impact

- **argo-workflows chart (Helm/YAML):** One new chart-managed template under `services/argo-workflows/chart/templates/` (e.g. `ark-query-template.yaml`): the `ark-query` reusable `WorkflowTemplate`, installed with the chart so it is present on every Ark-with-Argo install — both `devspace` (chart deployed as a dependency when `ENABLE_ARGO=true`) and the production Helm install / OCI-published chart.
- **Samples:** the three existing samples (`query-fanout-template.yaml`, `a2a-arithmetic-workflow.yaml`, `weather-workflow-template.yaml`) can collapse their inline query-and-wait recipe to a `templateRef` to `ark-query`.
- **Tests:** chainsaw e2e against an agent target and a team target asserting outputs on success, and a forced query `error` asserting a Failed node with readable outputs.
