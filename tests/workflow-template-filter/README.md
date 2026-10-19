# workflow-template-filter

Regression test for #3797: the Workflow runs **Template** filter (`workflowTemplateName`) must match against each run's `spec.workflowTemplateRef.name`, not against the `workflows.argoproj.io/workflow-template` label - Argo only sets that label when a run is submitted through its own submit API or by a CronWorkflow, never when a Workflow is created with `workflowTemplateRef` directly, which is how the dashboard creates every run.

## What it tests

- Deploys a real `ark-api` (built from this PR's image) against real `WorkflowTemplate` and `Workflow` resources, with no controller or server running Argo's own reconciliation.
- Creates runs with only `spec.workflowTemplateRef.name` set and no labels, exactly as the dashboard does, and confirms none of them ever carry the `workflow-template` label.
- Filtering `?workflowTemplateName=test` returns exactly the runs created against that template - not the runs with no `workflowTemplateRef`, and not runs against a different template.
- A template name that is a prefix of another (`test` vs `test-2`) matches exactly, not loosely: filtering by `test-2` never returns a `test` run and vice versa.
- A nonexistent template name returns zero results rather than erroring.
- No filter returns every run, including the one with no `workflowTemplateRef` at all - that run is excluded only when a template filter is applied, never unconditionally.

## Running

```bash
chainsaw test tests/workflow-template-filter
```

Successful completion validates that the Template filter works against real Kubernetes `Workflow` objects shaped exactly like the ones the dashboard creates, on the live `ark-api` HTTP endpoint - not just against unit-test mocks.
