# Ark Event Manager (AEM)

Event collection and streaming system for Ark.

## Local Development

### Prerequisites

- Python 3.11+
- `uv` package manager (or `pip`)

### Installation

```bash
cd services/ark-event-manager/ark-event-manager
uv sync
# or with pip:
# pip install -e .
```

### Running the Service

```bash
# Using Python module
python -m ark_event_manager

# Or directly with uvicorn
uvicorn ark_event_manager.main:app --host 0.0.0.0 --port 8080 --reload
```

The service will start on `http://localhost:8080`

## Development with DevSpace

[DevSpace](https://devspace.sh/) provides a streamlined development experience in Kubernetes.

### Prerequisites

- Kubernetes cluster (local or remote)
- DevSpace CLI installed
- kubectl configured to access your cluster

### Setup

```bash
cd services/ark-event-manager
devspace dev
```

This will:
- Build the Docker image
- Deploy the service to your cluster
- Start a development container with hot reload
- Sync local files to the container

### Accessing the Service

The service will be available at:
- `http://ark-event-manager.127.0.0.1.nip.io` (if HTTPRoute is enabled)
- Or via port-forward: `kubectl port-forward -n default svc/ark-event-manager 8080:80`

## Docker

### Building the Image

```bash
cd services/ark-event-manager
docker build -f ark-event-manager/Dockerfile -t ark-event-manager:latest .
```

### Running with Docker

```bash
docker run -p 8080:8080 \
  -e USE_DATABASE=true \
  -e DATABASE_URL=sqlite+aiosqlite:///./data/aer.db \
  -v $(pwd)/data:/app/data \
  ark-event-manager:latest
```

## Helm Deployment

### Prerequisites

- Kubernetes cluster
- Helm 3.x installed
- kubectl configured

### Installation

```bash
cd services/ark-event-manager
helm install ark-event-manager ./chart \
  --namespace default \
  --create-namespace \
  --set app.image.repository=ghcr.io/mckinsey/agents-at-scale-ark/ark-event-manager \
  --set app.image.tag=latest
```

### Configuration

Edit `chart/values.yaml` or override values:

```bash
helm install ark-event-manager ./chart \
  --set app.env[0].value="true" \
  --set persistence.enabled=true \
  --set persistence.size=2Gi
```

### Upgrading

```bash
helm upgrade ark-event-manager ./chart \
  --set app.image.tag=v0.2.0
```

### Uninstalling

```bash
helm uninstall ark-event-manager
```

### Testing Locally

Run the test script:

```bash
# In one terminal, start the service
python -m ark_event_manager

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

