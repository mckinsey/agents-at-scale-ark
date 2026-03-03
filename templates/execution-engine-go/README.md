# Ark Execution Engine Template (Go)

Scaffold for building a custom Ark execution engine using the A2A protocol.

## Quickstart

```bash
make help
make build
./my-engine --port 9090
```

Run conformance tests against your engine:

```bash
ENGINE_URL=http://localhost:9090 go test -v ../../tests/engine-conformance/...
```

## Structure

- `cmd/main.go` — HTTP server setup with A2A protocol and Agent Card
- `internal/engine/engine.go` — `MessageProcessor` implementation (add your LLM logic here)
