# Ark Event Recorder (AER)

Event collection and streaming system for Ark.

## Local Development

### Prerequisites

- Python 3.11+
- `uv` package manager (or `pip`)

### Installation

```bash
cd services/ark-event-recorder/ark-event-recorder
uv sync
# or with pip:
# pip install -e .
```

### Generating Pydantic Models from Protobuf

The Pydantic event model can be auto-generated from the protobuf definition:

```bash
# Generate models (requires protobuf-to-pydantic and grpc-tools)
make generate-models
# or directly:
uv run python generate_event_model.py
```

This generates `src/ark_event_recorder/core/event_model_gen.py` from `ark/internal/eventing/proto/event.proto`.

**Note:** The code falls back to the manual `event_model.py` if the generated file doesn't exist.

### Running the Service

```bash
# Using Python module
python -m ark_event_recorder

# Or directly with uvicorn
uvicorn ark_event_recorder.main:app --host 0.0.0.0 --port 8080 --reload
```

The service will start on `http://localhost:8080`

### Testing Locally

Run the test script:

```bash
# In one terminal, start the service
python -m ark_event_recorder

# In another terminal, run tests
python test_local.py
```

### Environment Variables

- `USE_DATABASE` - Set to `true` to enable SQLite database storage (default: `false`, uses in-memory)
- `DATABASE_URL` - Database connection string (default: `sqlite+aiosqlite:///./aer.db`)

### API Endpoints

- `GET /health` - Health check
- `POST /events` - Ingest events (protobuf format)
- `GET /messages?session_id=<id>` - Get messages for a session
- `POST /messages` - Add messages to a session
- `GET /stream/{query_id}` - Stream events for a query (SSE)
- `POST /stream/{query_id}` - Write chunks to a stream

### Example: Testing with curl

```bash
# Health check
curl http://localhost:8080/health

# Add messages
curl -X POST http://localhost:8080/messages \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "test-123",
    "query_id": "query-456",
    "messages": [{"role": "user", "content": "Hello"}]
  }'

# Get messages
curl "http://localhost:8080/messages?session_id=test-123"
```

