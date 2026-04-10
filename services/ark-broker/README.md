# ARK Broker

In-memory Kafka-like message broker for ARK cluster communication.

## Quickstart

```bash
# Show available commands.
make help

# Deploy to configured cluster.
devspace deploy

# Run in-cluster dev mode.
devspace dev
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP server port |
| `HOST` | `0.0.0.0` | HTTP server bind address |
| `REQUEST_TIMEOUT_MS` | `0` | HTTP request timeout in milliseconds. Default is no timeout (`0`). |
| `MAX_MESSAGES` | `0` | Max messages to persist (0 = unlimited) |
| `MAX_CHUNKS` | `0` | Max stream chunks to persist (0 = unlimited) |
| `MAX_SPANS` | `0` | Max trace spans to persist (0 = unlimited) |
| `MAX_EVENTS` | `0` | Max events to persist (0 = unlimited) |
