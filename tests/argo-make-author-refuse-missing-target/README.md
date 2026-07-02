# argo-make-author refuse missing target

Validates the fail-and-tell-user behaviour: when asked to reference a query
target that does not exist on the cluster, the `argo-make-author` agent refuses
to emit YAML for it and offers the available alternatives instead.

## What it tests
- The bundled `argo-make-author` agent manifest is applied directly from
  `services/ark-dashboard/.../bundled-manifests/argo-make-author.agent.yaml`
  (single source of truth — no test-local copy of the prompt).
- The agent lists `Agent` resources via the `resources_list` MCP tool and finds
  the requested target absent.
- The response contains no `WorkflowTemplate` / `templateRef` referencing the
  missing target and instead points at the available alternatives.

## Dependencies
- `kubernetes-mcp-server` (registered via
  `tests/shared/install-kubernetes-mcp-server.sh`) materialises the
  `resources_list` / `resources_get` `Tool` CRDs.
- `mock-llm` scripts the agent's turns: a `resources_list` tool call, then a
  refusal once the tool result is present. The mock creates the `default` model
  the agent's `spec.modelRef` points at.

## Running
```bash
chainsaw test
```

Successful completion means the agent refused the missing target and emitted no
template YAML referencing it.
