# argo-workflows

Argo Workflows with Ark tenant for workflow orchestration.

## Installation

```bash
cd chart && helm dependency update
helm upgrade --install argo-workflows ./chart -n argo-workflows --create-namespace
```

## Local Development

```bash
devspace deploy -n argo-workflows
devspace dev -n argo-workflows  # Port-forward to http://localhost:2746
devspace purge -n argo-workflows
```

See [documentation](../../docs/content/developer-guide/workflows/argo-workflows.mdx) for full details.
