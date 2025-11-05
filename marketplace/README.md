# Agents at Scale Marketplace

A collection of services, agents, and tools for the Agents at Scale (ARK) platform.

## Services

| Service | Description | Chart |
|---------|-------------|-------|
| [`phoenix`](./services/phoenix) | AI/ML observability and evaluation platform with OpenTelemetry integration | [Chart](./services/phoenix/chart) |
| [`langfuse`](./services/langfuse) | Open-source LLM observability and analytics platform with session tracking | [Chart](./services/langfuse/chart) |

## Quick Start

### Deploy a Service

```bash
# Deploy using Helm from local chart
cd marketplace/services/phoenix
helm dependency update chart/
helm install phoenix ./chart -n phoenix --create-namespace

# Or deploy with DevSpace for development
cd marketplace/services/phoenix
devspace deploy
```

### Development Mode

```bash
# Use DevSpace for local development with hot-reload and port-forwarding
cd marketplace/services/phoenix
devspace dev

# This will:
# - Deploy Phoenix to your cluster
# - Set up port-forwarding to access the dashboard
# - Watch for changes and auto-reload
```

### Uninstall a Service

```bash
# Using Helm
helm uninstall phoenix -n phoenix

# Using DevSpace
cd marketplace/services/phoenix
devspace purge
```

## Documentation

Detailed documentation for marketplace services can be found in the [`docs/`](./docs) directory.

## Contributing

1. Make changes to services in `./services/`
2. Ensure your service includes:
   - Helm chart in `chart/` directory
   - `README.md` with service documentation
   - `devspace.yaml` for local development
3. Test locally using DevSpace or Helm
4. Submit a pull request

## Future Plans

This marketplace is being prepared for migration to a dedicated repository where it will include:
- Additional observability services
- Pre-built agents and agent templates
- Reusable tools and utilities
