# Langfuse Service

OSS LLM observability platform for tracking agent interactions.
Self-hosted deployment with PostgreSQL, ClickHouse, and Redis.

## Quickstart

### Using DevSpace

```bash
# Deploy + port-forward dashboard with credentials
devspace dev

# Deploy Langfuse
devspace deploy
kubectl port-forward -n telemetry svc/langfuse-web 3000:3000

# Uninstall Langfuse
devspace purge
```

### Using Helm

```bash
# Install Langfuse to cluster
helm repo add langfuse https://langfuse.github.io/langfuse-k8s
helm dependency update chart/
helm install langfuse ./chart -n telemetry --create-namespace \
  --set demo.project.publicKey=lf_pk_1234567890 \
  --set demo.project.secretKey=lf_sk_1234567890

# Uninstall Langfuse
helm uninstall langfuse -n telemetry

# Open dashboard (port-forward)
kubectl port-forward -n telemetry svc/langfuse-web 3000:3000
```

## Credentials

- **Username**: `ark@ark.com`
- **Password**: `password123`

## Notes
- Pre-configured with ARK organization and project
- Includes OpenTelemetry integration for ARK controller
- Default namespace: `telemetry`
