# export-import-argo

Validates that `ark export` / `ark import` round-trip Argo workflow resources
alongside Ark-native resources.

## What it tests
- `ark export` includes `WorkflowTemplate`, `ClusterWorkflowTemplate`, and
  `CronWorkflow` by default, mixed with `Model`, `Agent`, and `Team`.
- Exported resources are ordered by dependency: Ark-native before Argo, and
  `ClusterWorkflowTemplate` before `WorkflowTemplate`.
- After deleting the originals, `ark import` recreates every kind on the
  cluster, including the cluster-scoped `ClusterWorkflowTemplate`.
- Argo resources in a non-default namespace are captured (the test runs in a
  per-run chainsaw namespace).

## Not covered
- The "Argo CRDs not installed" warn-and-skip path is covered by the ark-cli
  unit tests (`tools/ark-cli/src/commands/export/index.spec.ts`); it cannot be
  exercised deterministically here because the Argo CRDs are cluster-scoped.

## Isolation
- Runs with `concurrent: false`. It installs the argo-workflows chart (whose
  Argo CRDs are cluster-scoped and Helm-owned) and creates a cluster-scoped
  `ClusterWorkflowTemplate`. Running it alongside `argo-ark-query`, which also
  installs the chart, collides on the shared CRD ownership metadata. Serializing
  keeps each Argo install in its own window.

## Requirements
- Installs the argo-workflows chart in single-namespace mode to register the
  Argo CRDs.
- Builds the `ark` CLI from `tools/ark-cli` and invokes it via
  `node dist/index.js` (no global install required).
- No LLM required; the Model uses a placeholder config and is never queried.

## Running
```bash
chainsaw test
```

Successful completion confirms Argo workflow resources survive a full
export/import migration cycle.
