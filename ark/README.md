# Ark

Kubernetes operator for AI agents and teams.

## Quickstart

```bash
make help               # Show available commands
make chart              # Updates the charts templates needed if you perform update on chart
make deploy             # Install CRDs and RBAC
make eject-controller   # Scale down in cluster controller, enables 'make dev'
make dev                # Run controller locally
make test.              # Run tests
```

## Notes

- Manages Agent, Team, Query, Tool, Model, and MCPServer resources
- Requires Go 1.21+ for development
- Use `make generate` and `make manifests` after updating CRDs
