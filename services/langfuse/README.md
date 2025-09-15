# Langfuse Service

OSS LLM observability platform for tracking agent interactions.
Self-hosted deployment with PostgreSQL, ClickHouse, and Redis.

## Quickstart

**Note:** All make commands must be run from the repository root directory.

```bash
# From repository root - install Langfuse with headless initialization
make langfuse-install

# Show credentials only
make langfuse-credentials

# Start dashboard with automatic port-forward (recommended)
make langfuse-dashboard
```

## Notes
- Run commands from repository root directory
- Pre-configured with ARK organization and project
- Includes OpenTelemetry integration for ARK controller
