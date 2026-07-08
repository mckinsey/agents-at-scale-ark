# argo-make-author verify target

Validates that the `argo-make-author` agent grounds a query target on the live
cluster before referencing it, then emits a `WorkflowTemplate` that uses the
verified target via the `ark-query` `templateRef`.

## What it tests
- The bundled `argo-make-author` agent manifest is applied directly from
  `services/ark-dashboard/.../bundled-manifests/argo-make-author.agent.yaml`
  (single source of truth — no test-local copy of the prompt).
- The agent's `resources_list` MCP tool (from the in-cluster
  `kubernetes-mcp-server`) is invoked to list `Agent` resources in the namespace.
- A present, available target (`agent/weather`) is referenced in the generated
  YAML, which uses `templateRef: {name: ark-query, ...}`.

## Dependencies
- `kubernetes-mcp-server` (upstream chart `oci://ghcr.io/containers/charts`,
  registered via `tests/shared/install-kubernetes-mcp-server.sh`) materialises
  the `resources_list` / `resources_get` `Tool` CRDs.
- `mock-llm` scripts the agent's turns: first a `resources_list` tool call, then
  the final template once the tool result is present. The bundled agent ships
  without a `spec.modelRef` (users set their own model), so the mock creates a
  `default` model and the test patches the agent to point at it before querying.

## Running
```bash
chainsaw test
```

Successful completion means the agent listed the catalogue, verified the target,
and produced a `WorkflowTemplate` referencing `agent/weather`.
