# RAG with External Vector Database

Demonstrates Retrieval-Augmented Generation (RAG) using an external vector database (pgvector) for persistent knowledge base storage and semantic search.

## Overview

This sample shows how to implement RAG in ARK using:
- **pgvector**: PostgreSQL with vector extension for embedding storage
- **Flask REST API**: Custom HTTP tools for vector similarity search
- **Azure OpenAI**: Embeddings API for semantic search
- **ARK HTTP Tools**: Integration with ARK agents

## Architecture

```
┌─────────────────────────────────────────────┐
│         ARK Agent (rag-agent)               │
│  Uses retrieve-chunks tool for context      │
└──────────────┬──────────────────────────────┘
               │
               ▼
    ┌──────────────────────┐
    │  HTTP Tool CRDs      │
    │  - retrieve-chunks   │
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │  Flask REST API      │
    │  (retrieval-service) │
    └──────────┬───────────┘
               │
               ├──────────────┐
               ▼              ▼
    ┌─────────────┐  ┌───────────────┐
    │  pgvector   │  │  Azure OpenAI │
    │  Database   │  │  Embeddings   │
    └─────────────┘  └───────────────┘
```

## Prerequisites

- **ARK Platform**: Installed and running with:
  - ARK Controller (manages CRDs)
  - ARK API Server (REST API)
  - Default model configured
  - *If not installed*: Run `devspace dev` from project root or use `ark install` CLI
- **Kubernetes cluster**: minikube, kind, or cloud provider
- **Azure OpenAI**: Account with API key for embeddings
- **kubectl**: Configured to access your cluster
- **Docker**: For building the retrieval service image

## Quick Start

### Automated Setup (Recommended)

The easiest way to get started is using the provided Makefile.

**From the `samples/rag-external-vectordb/` directory:**

```bash
# Navigate to this directory
cd samples/rag-external-vectordb

# 1. Edit Azure OpenAI credentials in the secret file
#    Open retrieval-service/deployment/azure-openai-secret.yaml
#    Replace placeholder values with your actual credentials:
#      - api-key: Your Azure OpenAI API key
#      - endpoint: Your Azure OpenAI endpoint URL
#      - api-version: API version (default: 2024-04-01-preview)
#      - embedding-model: Model name (default: text-embedding-ada-002)

# 2. Run complete setup
make rag-demo

# 3. Open ARK dashboard to query the agent
make rag-open-dashboard
```

This will:
- ✅ Verify ARK is running
- ✅ Deploy pgvector database
- ✅ Build and deploy retrieval service
- ✅ Ingest 12 sample documents
- ✅ Deploy tools and RAG agent

**Available commands**:
- `make rag-demo` - Complete automated setup
- `make rag-test` - Test the RAG agent with a sample query
- `make rag-status` - Check status of all components
- `make rag-clean` - Remove all deployed resources
- `make help` - Show all available commands

---

### Manual Setup (Step-by-Step)

If you prefer to run steps manually or troubleshoot:

### 0. Verify ARK is Running

Before starting, ensure ARK is installed and running:

```bash
# Check ARK controller is running
kubectl get pods -n ark-system

# Check ARK API server is accessible (if using devspace dev)
curl -s http://localhost:8080/health || echo "ARK API not accessible"

# Verify default model is configured
kubectl get models
```

If ARK is not running, start it first:
```bash
# Option 1: Development (from project root)
devspace dev

# Option 2: Production
ark install
```

### 1. Configure Azure OpenAI Credentials

Edit `retrieval-service/deployment/azure-openai-secret.yaml` with your credentials:

```yaml
stringData:
  api-key: "YOUR_AZURE_OPENAI_API_KEY"
  endpoint: "https://YOUR_RESOURCE.openai.azure.com/"
  api-version: "2024-04-01-preview"
  embedding-model: "text-embedding-ada-002"
```

### 2. Deploy Infrastructure

```bash
# Deploy pgvector database
kubectl apply -k pgvector/

# Wait for database to be ready
kubectl wait --for=condition=ready pod -l app=pgvector --timeout=120s

# Deploy retrieval service
cd retrieval-service
docker build -t rag-retrieval-http:azure-openai .
minikube image load rag-retrieval-http:azure-openai  # if using minikube
kubectl apply -k deployment/
cd ..

# Deploy ARK Tool CRDs
kubectl apply -f tools/
```

### 3. Ingest Sample Data

```bash
# Port forward to pgvector
kubectl port-forward svc/pgvector 5432:5432 &

# Install dependencies and run ingestion
cd ingestion
pip install -r requirements.txt

# Set Azure OpenAI credentials
export AZURE_OPENAI_API_KEY="$(kubectl get secret azure-openai-creds -o jsonpath='{.data.api-key}' | base64 -d)"
export AZURE_OPENAI_ENDPOINT="$(kubectl get secret azure-openai-creds -o jsonpath='{.data.endpoint}' | base64 -d)"
export AZURE_OPENAI_API_VERSION="$(kubectl get secret azure-openai-creds -o jsonpath='{.data.api-version}' | base64 -d)"
export AZURE_EMBEDDING_MODEL="$(kubectl get secret azure-openai-creds -o jsonpath='{.data.embedding-model}' | base64 -d)"

# Run ingestion (12 sample documents about ARK)
python ingest_sample_data.py
cd ..
```

### 4. Deploy and Test RAG Agent

```bash
# Deploy agent and query
kubectl apply -f agents/rag-agent.yaml
kubectl apply -f queries/rag-query.yaml

# Wait for query completion
sleep 15

# View results
kubectl get query rag-query
kubectl get query rag-query -o jsonpath='{.status.response.content}'
```

## Components

### pgvector/
PostgreSQL 16 with pgvector extension for storing document embeddings (1536 dimensions).

### retrieval-service/
Flask REST API that:
- Generates query embeddings via Azure OpenAI
- Performs vector similarity search in pgvector
- Exposes endpoints: `/retrieve_chunks`, `/search_by_metadata`, `/get_document_stats`

### tools/
ARK HTTP Tool CRDs that wrap the Flask API endpoints for agent use.

### agents/
RAG-enabled agent configured to use `retrieve-chunks` tool for context retrieval.

### queries/
Example queries demonstrating RAG capabilities.

### ingestion/
Python script to load sample documents (ARK documentation) with Azure OpenAI embeddings.

## Testing Retrieval Directly

```bash
# Port forward the retrieval service
kubectl port-forward svc/rag-retrieval-http 8000:8000 &

# Test retrieval endpoint
curl -X POST http://localhost:8000/retrieve_chunks \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How do teams work in ARK?",
    "top_k": 3
  }'

# Check database stats
curl -X POST http://localhost:8000/get_document_stats
```

## Detailed Documentation

For comprehensive implementation details, architecture deep-dive, and troubleshooting:
- **Implementation Guide**: `../../docs/content/developer-guide/rag-implementation.mdx`
- **Summary**: `../../RAG_IMPLEMENTATION_SUMMARY.md`

## Key Features

- **Persistent Storage**: Vector database survives pod restarts
- **Production Embeddings**: Azure OpenAI text-embedding-ada-002 (1536 dimensions)
- **Semantic Search**: High-quality similarity scores (0.85+ for relevant matches)
- **Scalable**: Kubernetes-native deployment with resource limits
- **Secure**: Credentials managed via Kubernetes Secrets

## Customization

- **Change Embedding Model**: Edit `azure-openai-secret.yaml` embedding-model field
- **Add Custom Documents**: Modify `ingestion/ingest_sample_data.py` SAMPLE_DOCUMENTS list
- **Adjust Resources**: Edit deployment resource limits in `pgvector/deployment.yaml` and `retrieval-service/deployment/deployment.yaml`
- **Customize Agent Prompt**: Edit `agents/rag-agent.yaml` prompt field

## Troubleshooting

**Pod Not Starting**:
```bash
kubectl logs -l app=rag-retrieval-http --tail=20
kubectl logs -l app=pgvector --tail=20
```

**No Embeddings in Database**:
```bash
kubectl exec -it $(kubectl get pod -l app=pgvector -o name) -- psql -U postgres -d vectors -c "SELECT COUNT(*) FROM documents WHERE embedding IS NOT NULL;"
```

**Tools Not Found by Agent**:
```bash
kubectl get tools
kubectl describe tool retrieve-chunks
```

For more troubleshooting, see the detailed guide in `docs/content/developer-guide/rag-implementation.mdx`.

