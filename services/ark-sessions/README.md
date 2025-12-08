# ARK Sessions Service

ARK Sessions is a Go service that provides session management with real-time OTEL trace visualization.

## Architecture

```
OTEL Collector → ark-sessions (POST /v1/traces)
                      ↓
                PostgreSQL
                      ↓
         Tree API + Real-time SSE
```

## Features

1. **OTEL Ingestion**: Receives OTLP traces from OTEL Collector (`POST /v1/traces`)
2. **Session Management**: Stores and retrieves ARK messages (`GET/POST /messages`)
3. **Tree API**: Returns hierarchical session data (`GET /sessions/{id}`)
4. **Real-time Streaming**: SSE endpoint for live updates (`GET /sessions/{id}/stream`)

## Integration

Configure OTEL Collector to export to `ark-sessions`:

```yaml
exporters:
  otlp/ark-sessions:
    endpoint: http://ark-sessions:8080/v1/traces
    tls:
      insecure: true

service:
  pipelines:
    traces:
      exporters:
        - otlp/jaeger  # Existing backend
        - otlp/ark-sessions  # New export
```

## API Endpoints

- `POST /v1/traces` - Receive OTLP traces (OTEL standard)
- `GET /sessions` - List all sessions
- `GET /sessions/{id}` - Get session with tree structure
- `GET /sessions/{id}/stream` - SSE stream for real-time updates
- `GET /messages?session_id={id}` - Get messages for session
- `POST /messages` - Add messages to session

