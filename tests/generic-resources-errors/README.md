# Generic Resources Errors

Checks against a real ark-api that the generic resources routes under `/v1/resources` return Kubernetes errors as HTTP errors. See [#3781](https://github.com/mckinsey/agents-at-scale-ark/issues/3781).

## What it tests

- Installs the Argo Workflows CRDs only, with the controller scaled to zero, so Workflow objects exist but never run.
- Deploys the `ark-api` chart with this build's image (`ARK_API_IMAGE`/`ARK_API_IMAGE_TAG`) and the chart's default `AUTH_MODE=open`.
- `GET` on a missing Agent, Workflow or WorkflowTemplate and `DELETE` on a missing ExecutionEngine answer 404 with a JSON `detail`. The body is never a Kubernetes `Status` object.
- `suspend`, `resume`, `stop`, `terminate`, `retry` and `resubmit` on a missing workflow answer 404, and no workflow gets created.
- Creating the same WorkflowTemplate twice answers 409 the second time, and deleting it twice answers 204 then 404.
- On a workflow that exists, `suspend` sets `spec.suspend` and `resubmit` creates a second workflow.

## Running

```bash
ARK_API_IMAGE=ghcr.io/mckinsey/agents-at-scale-ark/ark-api \
ARK_API_IMAGE_TAG=<tag> \
chainsaw test ./generic-resources-errors
```

`ARK_API_IMAGE`/`ARK_API_IMAGE_TAG` are optional. Without them the chart's published image is used, which may predate the fix.

A pass means a client of `/v1/resources` can tell a missing object or a conflict from a success by the HTTP status alone.
