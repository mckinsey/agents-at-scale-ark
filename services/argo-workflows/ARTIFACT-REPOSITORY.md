# Artifact Repository Configuration

This chart supports optional Minio artifact storage for Argo Workflows.

## Without Artifact Repository (Default)

When `minio.enabled: false` (default):
- No artifact repository is configured
- Workflows run without artifact storage
- Lighter resource footprint
- Suitable for simple workflows that don't need artifacts

## With Artifact Repository

When `minio.enabled: true`:
- Minio tenant is deployed for artifact storage
- Argo Workflows is automatically configured to use Minio
- A post-install/post-upgrade hook patches the workflow controller configuration
- All workflows can use artifact storage by default

## Configuration

Set in `devspace.yaml`:
```yaml
vars:
  ENABLE_MINIO:
    question: "Enable Minio artifact storage (true/false)?"
    default: false
```

Or directly in the chart values:
```yaml
minio:
  enabled: true
```

## Implementation Details

The configuration uses a Helm hook job that:
1. Runs after Helm install/upgrade (when Minio is enabled)
2. Patches the workflow controller ConfigMap to reference the artifact repository
3. Restarts the workflow controller to pick up the new configuration
4. Has proper RBAC permissions via a dedicated ServiceAccount

This approach allows the artifact repository to be truly optional without requiring changes to workflows.
