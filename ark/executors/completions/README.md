# Completions Engine

Executes queries against agents, teams, models, and tools using the completions message format. Communicates with the Ark controller via A2A protocol.

## Quickstart

```bash
make help

make build-completions
make build-completions-container

# Run locally (requires K8s cluster access)
go run cmd/completions/main.go --addr=:9090
```
