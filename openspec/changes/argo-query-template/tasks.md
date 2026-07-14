# Implementation Tasks

## 1. ark-query template (argo-workflows chart)

- [ ] 1.1 Add `services/argo-workflows/chart/templates/ark-query-template.yaml` rendering a `WorkflowTemplate` named `ark-query` with an inner `query` template referenceable via `templateRef: {name: ark-query, template: query}`. Use the `alpine/k8s` image the samples use.
- [ ] 1.2 Implement inputs: required `target` (split `type/name`, validate enum `agent|team|model|tool` up front) and `input` (verbatim `spec.input`); optional `timeout` (default `5m`, bounds `spec.timeout` and `kubectl wait`), `ttl`, `parameters` (default `[]`, JSON array → `spec.parameters`), `session-id`, `memory`, `query-name` (default `q-{{workflow.name}}-{{pod.name}}`, labelled `workflow: {{workflow.name}}`), `service-account`.
- [ ] 1.3 Implement outputs: `response` (`status.response.content`), `query-json` (full Query object), `phase` (`status.phase`), `conversation-id` (`status.conversationId`).
- [ ] 1.4 Implement Argo-integrated error handling: write all four output files before exiting (even on failure); exit `0` on `done`; write error content to `response` and exit non-zero on `error`, wait-timeout, or non-`done` phase.
- [ ] 1.5 Chainsaw e2e: run against an agent target and a team target asserting outputs on success; force a query `error` and assert the node is Failed with outputs still readable.
- [ ] 1.6 Confirm install on both paths: `devspace` with `ENABLE_ARGO=true`, and the production Helm install / OCI-published chart.
