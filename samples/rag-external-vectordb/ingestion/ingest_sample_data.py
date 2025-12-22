#!/usr/bin/env python3
"""
Sample data ingestion script for ARK RAG demo.
Ingests sample documents about ARK concepts into pgvector database.
"""

import psycopg2
from pgvector.psycopg2 import register_vector
from openai import AzureOpenAI
import json
from datetime import datetime
import os

SAMPLE_DOCUMENTS = [
    {
        "content": "ARK (Agents at Scale) is a Kubernetes-native platform for building and deploying AI agent systems. It provides CRDs for Agents, Teams, Queries, Models, and Tools, enabling declarative agent orchestration.",
        "metadata": {"category": "overview", "source": "ark-docs", "topic": "platform"}
    },
    {
        "content": "An Agent in ARK is a Custom Resource that defines an AI agent's behavior through a prompt, model reference, and optional tools. Agents can be configured with specific execution engines and can access external tools via MCP servers.",
        "metadata": {"category": "concepts", "source": "ark-docs", "topic": "agents"}
    },
    {
        "content": "Teams in ARK enable multi-agent collaboration with different strategies: Sequential (agents execute in order), Round-Robin (agents take turns), and Graph (complex workflows with conditional routing).",
        "metadata": {"category": "concepts", "source": "ark-docs", "topic": "teams"}
    },
    {
        "content": "MCP (Model Context Protocol) servers in ARK expose tools that agents can use. MCPServer resources point to HTTP or SSE endpoints that implement the MCP protocol, allowing agents to discover and use tools dynamically.",
        "metadata": {"category": "concepts", "source": "ark-docs", "topic": "mcp"}
    },
    {
        "content": "Tools in ARK can be of three types: HTTP tools (REST API endpoints), MCP tools (exposed via MCP servers), and Agent tools (other agents used as tools). Each tool has an input schema that defines its parameters.",
        "metadata": {"category": "concepts", "source": "ark-docs", "topic": "tools"}
    },
    {
        "content": "Queries in ARK represent requests to agents or teams. They can target specific agents, teams, models, or tools. Queries support parameters, timeouts, and can be configured with different input types like text, JSON, or file references.",
        "metadata": {"category": "concepts", "source": "ark-docs", "topic": "queries"}
    },
    {
        "content": "ARK supports multiple model providers including Azure OpenAI, OpenAI, Anthropic, and Ollama for local models. Model resources define connection details, API keys via secrets, and can specify different model types for embeddings vs chat.",
        "metadata": {"category": "concepts", "source": "ark-docs", "topic": "models"}
    },
    {
        "content": "The LangChain Execution Engine in ARK provides RAG capabilities out of the box. Enable it by adding 'langchain: rag' label to your agent. It uses FAISS for in-memory vector storage and automatically indexes local code files.",
        "metadata": {"category": "features", "source": "ark-docs", "topic": "rag"}
    },
    {
        "content": "ARK's architecture includes a controller (manages CRDs), API server (REST API), dashboard (web UI), and optional services like broker, evaluators, and execution engines. All components run in Kubernetes pods.",
        "metadata": {"category": "architecture", "source": "ark-docs", "topic": "components"}
    },
    {
        "content": "To deploy ARK locally, use 'devspace dev' for development with live reload, or 'ark install' CLI for production deployment. ARK requires cert-manager and Gateway API CRDs as prerequisites.",
        "metadata": {"category": "deployment", "source": "ark-docs", "topic": "installation"}
    },
    {
        "content": "Secret management in ARK uses Kubernetes secrets. API keys, passwords, and tokens can be referenced via secretKeyRef in various resources like Models, MCPServers, and Tools. Headers can also reference secrets.",
        "metadata": {"category": "security", "source": "ark-docs", "topic": "secrets"}
    },
    {
        "content": "ARK Evaluators assess agent and query quality using frameworks like RAGAS, G-Eval, or custom rules. Evaluators can run on-demand or be triggered by events, providing scores and detailed feedback on responses.",
        "metadata": {"category": "features", "source": "ark-docs", "topic": "evaluation"}
    },
]

def main():
    print("=" * 80)
    print("ARK RAG Sample Data Ingestion")
    print("=" * 80)
    
    DB_HOST = "localhost"
    DB_PORT = 5432
    DB_NAME = "vectors"
    DB_USER = "postgres"
    DB_PASSWORD = "arkragpass123"
    
    print(f"\n📊 Initializing Azure OpenAI client...")
    azure_client = AzureOpenAI(
        api_key=os.getenv("AZURE_OPENAI_API_KEY"),
        azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
        api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-01")
    )
    embedding_model_name = os.getenv("AZURE_EMBEDDING_MODEL", "text-embedding-ada-002")
    print(f"✅ Azure OpenAI client initialized with model: {embedding_model_name}\n")
    
    print(f"🔌 Connecting to database at {DB_HOST}:{DB_PORT}...")
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD
        )
        register_vector(conn)
        print("✅ Connected to pgvector database\n")
    except Exception as e:
        print(f"❌ Failed to connect to database: {e}")
        print("\nMake sure pgvector is running and accessible.")
        print("Try: kubectl port-forward svc/pgvector 5432:5432")
        return 1
    
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) FROM documents")
    existing_count = cursor.fetchone()[0]
    
    if existing_count > 0:
        print(f"⚠️  Found {existing_count} existing documents in database")
        print("🗑️  Automatically clearing existing data...")
        cursor.execute("TRUNCATE TABLE documents RESTART IDENTITY")
        conn.commit()
        print("✅ Cleared existing data\n")
    
    print(f"📝 Ingesting {len(SAMPLE_DOCUMENTS)} documents...")
    print("-" * 80)
    
    for i, doc in enumerate(SAMPLE_DOCUMENTS, 1):
        print(f"\n[{i}/{len(SAMPLE_DOCUMENTS)}] Processing: {doc['metadata']['topic']}")
        print(f"    Content: {doc['content'][:80]}...")
        
        print(f"    🔄 Calling Azure OpenAI embeddings API...")
        import time
        start_time = time.time()
        response = azure_client.embeddings.create(
            input=doc['content'],
            model=embedding_model_name
        )
        elapsed = time.time() - start_time
        print(f"    ⏱️  API call took {elapsed:.2f}s")
        embedding = response.data[0].embedding
        print(f"    📊 Received embedding with {len(embedding)} dimensions")
        
        cursor.execute("""
            INSERT INTO documents (content, metadata, embedding, created_at)
            VALUES (%s, %s, %s, %s)
        """, (
            doc['content'],
            json.dumps(doc['metadata']),
            embedding,
            datetime.now()
        ))
        
        print(f"    ✅ Embedded and stored")
    
    conn.commit()
    
    print("\n" + "-" * 80)
    print("✨ Ingestion complete!\n")
    
    cursor.execute("SELECT COUNT(*) FROM documents")
    total_count = cursor.fetchone()[0]
    print(f"📊 Total documents in database: {total_count}")
    
    print("\n🔍 Testing similarity search...")
    test_query = "How do I create an agent in ARK?"
    print(f"   Query: '{test_query}'")
    
    response = azure_client.embeddings.create(
        input=test_query,
        model=embedding_model_name
    )
    test_embedding = response.data[0].embedding
    
    cursor.execute("""
        SELECT content, metadata, 1 - (embedding <=> %s::vector) as similarity
        FROM documents
        ORDER BY embedding <=> %s::vector
        LIMIT 3
    """, (test_embedding, test_embedding))
    
    print("\n   Top 3 results:")
    for idx, (content, metadata, similarity) in enumerate(cursor.fetchall(), 1):
        meta = json.loads(metadata) if isinstance(metadata, str) else metadata
        print(f"   {idx}. [{similarity:.3f}] {meta['topic']}: {content[:60]}...")
    
    cursor.close()
    conn.close()
    
    print("\n" + "=" * 80)
    print("✅ All done! Your RAG database is ready.")
    print("=" * 80)
    
    return 0

if __name__ == "__main__":
    exit(main())

