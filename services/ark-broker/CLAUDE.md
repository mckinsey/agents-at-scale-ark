## Ark Broker

In-memory event bus (Node.js/Express) providing streaming, messaging, tracing, and session management for the Ark cluster. Currently coupled to the completions executor's message format (OpenAI-format messages and chunks).

### Broker Types (`ark-broker/src/`)
- **MemoryBroker** (`memory-broker.ts`) — stores chat messages, grouped by conversation/query ID
- **CompletionChunkBroker** (`completion-chunk-broker.ts`) — stores streaming chunks, tracks completion with `[DONE]` markers
- **TraceBroker** (`trace-broker.ts`) — stores OTEL spans, supports session filtering via `ark.session.id`
- **EventBroker** (`event-broker.ts`) — stores controller operation events (QueryExecutionStart, LLMCallComplete, etc.)
- **SessionsBroker** (`sessions-broker.ts`) — event-sourced materialized view, enriched by events and messages from other brokers

### Key Features
- All endpoints support `?watch=true` for Server-Sent Events streaming with cursor-based pagination
- OTLP protobuf ingestion at `POST /v1/traces`
- Optional JSON file persistence (disabled by default)

### Build
```bash
make build         # Build Docker image
make test          # Run tests
```
