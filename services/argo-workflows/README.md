# argo-workflows

Argo Workflows with Ark tenant for workflow orchestration.

## Installation

```bash
cd chart && helm dependency update
helm upgrade --install argo-workflows ./chart -n argo-workflows --create-namespace
```

### With Minio Artifact Storage

To enable Minio for artifact storage, first install the Minio Operator:

```bash
helm upgrade minio-operator operator \
  --install \
  --repo https://operator.min.io \
  --namespace minio-operator \
  --create-namespace \
  --version 7.1.1
```

Then enable Minio in the chart:

```bash
cd chart && helm dependency update
helm upgrade --install argo-workflows ./chart -n argo-workflows --create-namespace \
  --set minio.enabled=true
```

## Local Development

```bash
devspace deploy -n argo-workflows
devspace dev -n argo-workflows  # Port-forward to http://localhost:2746
devspace purge -n argo-workflows
```

DevSpace will prompt whether to enable Minio artifact storage. If enabled, it automatically installs the Minio Operator and tenant.

See [documentation](../../docs/content/developer-guide/workflows/argo-workflows.mdx) for full details.
