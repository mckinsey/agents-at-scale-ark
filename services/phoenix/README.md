# Phoenix

Phoenix observability for Ark AI agents.

## Quickstart

```bash
# Show all available recipes
make help

# Install Phoenix to cluster
make phoenix-install

# Uninstall Phoenix
make phoenix-uninstall

# Open dashboard (port-forward)
make phoenix-dashboard
```

## Configuration

Phoenix is configured with:
- **Namespace**: `phoenix`
- **Service**: `phoenix-svc:6006`
- **OTEL Endpoint**: `http://phoenix-svc.phoenix.svc.cluster.local:6006/v1/traces`

OTEL secrets are automatically created in `ark-system` and `default` namespaces.
