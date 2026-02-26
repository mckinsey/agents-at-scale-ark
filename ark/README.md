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
- Model-backed agents in experimental mode run a native-local A2A loop (`executeLocallyA2ANative`) with OpenAI conversion only at the model provider boundary
- Agents with execution engines route by capability: native A2A types (`a2a-langchain`) hit `/execute-a2a`, known OpenAI types (`langchain`) use a compat wrapper
- All A2A streaming is strict: stream write failures propagate as errors across all execution paths
- Legacy OpenAI memory records remain readable when experimental mode is enabled
- See the [RFC: Experimental A2A transport](https://mckinsey.github.io/agents-at-scale-ark/reference/a2a-experimental-rfc) for behavior and removal constraints
- Requires Go 1.21+ for development
- Use `make generate` and `make manifests` after updating CRDs
