# argo-ark-query

Validates the `ark-query` `WorkflowTemplate` shipped in the argo-workflows chart.

## What it tests
- The `ark-query` `WorkflowTemplate` is present after the argo-workflows chart is installed.
- A workflow step referencing `templateRef: {name: ark-query, template: query}` submits a Query against an **agent** target and returns `response`, `phase`, `conversation-id`, and `query-json` on success.
- The same template against a **team** target returns the final assistant message.
- A forced query `error` marks the Argo node Failed while `phase` / `response` / `query-json` outputs remain readable.

## Requirements
- Installs the argo-workflows chart in single-namespace mode into the test namespace (pulls the Argo controller/executor images).
- Uses mock-llm for deterministic responses; no real LLM keys required.

## Running
```bash
chainsaw test
```

Successful completion validates that the chart-managed `ark-query` template creates Queries and surfaces their outputs and error handling as specified.
