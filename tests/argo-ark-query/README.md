# argo-ark-query

Validates the `ark-query` `WorkflowTemplate` shipped in the argo-workflows chart.

## What it tests
- The `ark-query` `WorkflowTemplate` is present after the argo-workflows chart is installed.
- A workflow step referencing `templateRef: {name: ark-query, template: query}` submits a Query against an **agent** target and returns `response`, `phase`, `conversation-id`, and `query-json` on success.
- The same template against a **team** target returns the final assistant message.
- A forced query `error` marks the Argo node Failed while `phase` / `response` / `query-json` outputs remain readable.
- Input-validation failures mark the node Failed and write the error to the `response` output:
  - target without `type/name` form, unknown target type, empty target name.
  - `parameters` that is not valid JSON, and JSON that is not an array.
- A target referencing a resource that does not exist makes `kubectl apply` fail admission, surfaced as `failed to create Query`.
- Optional spec fields (`query-name`, `ttl`, `session-id`, non-empty `parameters`) are serialized into the created Query (verified via the `query-json` output).

## Not covered
Two error branches in `ark-query.py` are omitted because they cannot be reproduced deterministically in an e2e cluster:
- `kubectl get query` returning a non-zero exit mid-poll (transient API failure after a successful apply and wait).
- The 30-iteration poll loop exhausting without the query reaching a terminal phase (would require the query to stay non-terminal after `kubectl wait --for=condition=Completed` already returned).

## Requirements
- Installs the argo-workflows chart in single-namespace mode into the test namespace (pulls the Argo controller/executor images).
- Uses mock-llm for deterministic responses; no real LLM keys required.

## Running
```bash
chainsaw test
```

Successful completion validates that the chart-managed `ark-query` template creates Queries and surfaces their outputs and error handling as specified.
