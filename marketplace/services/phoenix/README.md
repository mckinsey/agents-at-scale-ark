# Phoenix

Phoenix observability for Ark AI agents.

## Quickstart

### Using DevSpace

```bash
# Deploy + port-forward dashboard
devspace dev

# Deploy Phoenix
devspace deploy
kubectl port-forward -n phoenix svc/phoenix-svc 6006:6006

# Uninstall Phoenix
devspace purge
```

### Using Helm

```bash
# Install Phoenix to cluster
helm dependency update chart/
helm install phoenix ./chart -n phoenix --create-namespace

# Uninstall Phoenix
helm uninstall phoenix -n phoenix

# Open dashboard (port-forward)
kubectl port-forward -n phoenix svc/phoenix-svc 6006:6006
```

## Configuration

Phoenix is configured with:
- **Namespace**: `phoenix`
- **Service**: `phoenix-svc:6006`
- **OTEL Endpoint**: `http://phoenix-svc.phoenix.svc.cluster.local:6006/v1/traces`

OTEL secrets are automatically created in `ark-system` and `default` namespaces.
