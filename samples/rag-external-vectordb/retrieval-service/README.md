# RAG Retrieval Service

Flask REST API server exposing retrieval functions as ARK HTTP Tools, using Azure OpenAI for query embeddings.

This is part of the `samples/rag-external-vectordb/` demonstration.

## Overview

The service provides three retrieval endpoints that connect to a pgvector database:

1. **retrieve-chunks**: Semantic similarity search using vector embeddings
2. **search-by-metadata**: Filter documents by metadata key-value pairs
3. **get-document-stats**: Get statistics about the vector database

## Architecture

- **Flask REST API**: Python server exposing HTTP endpoints
- **Azure OpenAI**: `text-embedding-ada-002` model for query embeddings (1536 dimensions)
- **pgvector**: PostgreSQL database with vector extension for document embeddings
- **ARK HTTP Tools**: Tool CRDs in `../tools/` that call these endpoints

## Deployment

### Prerequisites

- Kubernetes cluster with ARK installed
- pgvector database deployed (see `../pgvector/`)
- Azure OpenAI credentials configured (see `deployment/azure-openai-secret.yaml`)

### Build and Deploy

```bash
# Build Docker image
docker build -t rag-retrieval-http:azure-openai .

# Load into cluster (adjust for your cluster type)
minikube image load rag-retrieval-http:azure-openai
# OR for kind:
# kind load docker-image rag-retrieval-http:azure-openai

# Deploy all resources (includes secrets, deployment, service)
kubectl apply -k deployment/
```

### Verify Deployment

```bash
# Check pod status
kubectl get pods -l app=rag-retrieval-http

# Check logs for successful Azure OpenAI initialization
kubectl logs -l app=rag-retrieval-http --tail=20

# You should see: "Azure OpenAI client initialized successfully with model text-embedding-ada-002"

# Check service
kubectl get svc rag-retrieval-http

# Verify tools are registered
kubectl get tools
```

## API Endpoints

### POST /retrieve_chunks

Retrieve relevant document chunks based on semantic similarity.

**Request**:
```json
{
  "query": "How do I create an agent in ARK?",
  "top_k": 3
}
```

**Response**:
```json
[
  {
    "content": "An Agent in ARK is a Custom Resource...",
    "metadata": {"category": "concepts", "topic": "agents"},
    "similarity": 0.878
  }
]
```

### POST /search_by_metadata

Filter documents by metadata key-value pairs.

**Request**:
```json
{
  "key": "category",
  "value": "concepts",
  "top_k": 5
}
```

### POST /get_document_stats

Get database statistics.

**Response**:
```json
{
  "total_documents": 12,
  "documents_with_embeddings": 12,
  "available_metadata_keys": ["category", "source", "topic"]
}
```

## Testing

```bash
# Port forward to access the API
kubectl port-forward svc/rag-retrieval-http 8000:8000 &

# Test retrieval
curl -X POST http://localhost:8000/retrieve_chunks \
  -H "Content-Type: application/json" \
  -d '{"query": "How do teams work?", "top_k": 3}'

# Test stats
curl -X POST http://localhost:8000/get_document_stats
```

## Configuration

### Environment Variables

Set via `deployment/deployment.yaml`:

**pgvector Connection**:
- `PGVECTOR_HOST`: Database hostname (default: `pgvector.default.svc.cluster.local`)
- `PGVECTOR_DB`: Database name (from secret)
- `PGVECTOR_USER`: Database user (from secret)
- `PGVECTOR_PASSWORD`: Database password (from secret)

**Azure OpenAI**:
- `AZURE_OPENAI_API_KEY`: API key (from secret)
- `AZURE_OPENAI_ENDPOINT`: Endpoint URL (from secret)
- `AZURE_OPENAI_API_VERSION`: API version (from secret)
- `AZURE_EMBEDDING_MODEL`: Model name (from secret)

### Secrets

**pgvector-creds**: Database credentials (created by `../pgvector/secret.yaml`)

**azure-openai-creds**: Azure OpenAI credentials (edit `deployment/azure-openai-secret.yaml` with your credentials)

## Development

### Local Development

```bash
# Install dependencies
pip install -r requirements.txt
# OR using uv:
uv sync

# Set environment variables
export PGVECTOR_HOST=localhost
export PGVECTOR_DB=vectors
export PGVECTOR_USER=postgres
export PGVECTOR_PASSWORD=your-password
export AZURE_OPENAI_API_KEY=your-key
export AZURE_OPENAI_ENDPOINT=your-endpoint
export AZURE_OPENAI_API_VERSION=2024-04-01-preview
export AZURE_EMBEDDING_MODEL=text-embedding-ada-002

# Run server
python -m src.rest_server
```

### Docker Build

```bash
# Build
docker build -t rag-retrieval-http:azure-openai .

# Run locally
docker run -p 8000:8000 \
  -e PGVECTOR_HOST=host.docker.internal \
  -e PGVECTOR_DB=vectors \
  -e PGVECTOR_USER=postgres \
  -e PGVECTOR_PASSWORD=password \
  -e AZURE_OPENAI_API_KEY=your-key \
  -e AZURE_OPENAI_ENDPOINT=your-endpoint \
  -e AZURE_OPENAI_API_VERSION=2024-04-01-preview \
  -e AZURE_EMBEDDING_MODEL=text-embedding-ada-002 \
  rag-retrieval-http:azure-openai
```

## Troubleshooting

### Azure OpenAI Connection Issues

```bash
# Check logs for initialization
kubectl logs -l app=rag-retrieval-http | grep -i azure

# Verify secret is correct
kubectl get secret azure-openai-creds -o yaml

# Test credentials manually
kubectl exec -it deployment/rag-retrieval-http -- python -c "
from openai import AzureOpenAI
import os
client = AzureOpenAI(
    api_key=os.getenv('AZURE_OPENAI_API_KEY'),
    azure_endpoint=os.getenv('AZURE_OPENAI_ENDPOINT'),
    api_version=os.getenv('AZURE_OPENAI_API_VERSION')
)
print(client.embeddings.create(input='test', model=os.getenv('AZURE_EMBEDDING_MODEL')))
"
```

### Database Connection Issues

```bash
# Verify pgvector is running
kubectl get pods -l app=pgvector

# Test database connection
kubectl exec -it deployment/rag-retrieval-http -- python -c "
import psycopg2
conn = psycopg2.connect(
    host='pgvector.default.svc.cluster.local',
    database='vectors',
    user='postgres',
    password='arkragpass123'
)
print('Connected successfully')
"
```

### Empty Search Results

```bash
# Check if documents are ingested
kubectl exec -it $(kubectl get pod -l app=pgvector -o name) -- \
  psql -U postgres -d vectors -c "SELECT COUNT(*) FROM documents WHERE embedding IS NOT NULL;"

# If 0, run ingestion script from ../ingestion/
```

## Related Files

- **ARK Tool CRDs**: `../tools/retrieve-chunks.yaml`, etc.
- **Agent Example**: `../agents/rag-agent.yaml`
- **Ingestion Script**: `../ingestion/ingest_sample_data.py`
- **Database**: `../pgvector/`
