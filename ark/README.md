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

- Manages Agent, Team, Query, Tool, Model, MCPServer, and A2AServer resources
- Supports the A2A execution engine (`executionEngine.name: a2a`) for agents backed by external A2A servers
- Experimental A2A mode (`ark.mckinsey.com/a2a-experimental-enabled`) runs agent/team execution with `protocol.Message` end-to-end
- Experimental A2A mode requires A2A-compatible execution engines and rejects local model execution for those workloads
- Legacy OpenAI memory records remain readable when experimental mode is enabled
- See the [RFC: Experimental A2A transport](https://mckinsey.github.io/agents-at-scale-ark/reference/a2a-experimental-rfc) for behavior and removal constraints
- Requires Go 1.21+ for development
- Use `make generate` and `make manifests` after updating CRDs
