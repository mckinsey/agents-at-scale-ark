from flask import Flask, request, jsonify
import psycopg2
from pgvector.psycopg2 import register_vector
from openai import AzureOpenAI
import os
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)

try:
    azure_client = AzureOpenAI(
        api_key=os.getenv("AZURE_OPENAI_API_KEY"),
        azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
        api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-01")
    )
    embedding_model_name = os.getenv("AZURE_EMBEDDING_MODEL", "text-embedding-ada-002")
    logger.info(f"Azure OpenAI client initialized successfully with model {embedding_model_name}")
    embedding_model = True
except Exception as e:
    logger.error(f"Failed to initialize Azure OpenAI client: {e}", exc_info=True)
    azure_client = None
    embedding_model = None

def get_db_connection():
    db_host = os.getenv("PGVECTOR_HOST", "pgvector.default.svc.cluster.local")
    db_name = os.getenv("PGVECTOR_DB", "vectors")
    db_user = os.getenv("PGVECTOR_USER", "postgres")
    db_password = os.getenv("PGVECTOR_PASSWORD")
    
    conn = psycopg2.connect(
        host=db_host,
        database=db_name,
        user=db_user,
        password=db_password
    )
    register_vector(conn)
    return conn

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy", "embedding_model_loaded": embedding_model is not None})

@app.route('/retrieve_chunks', methods=['POST'])
def retrieve_chunks():
    if azure_client is None:
        return jsonify({"error": "Azure OpenAI client not initialized."}), 500
    
    try:
        data = request.json
        query = data.get('query')
        top_k = data.get('top_k', 5)
        
        if not query:
            return jsonify({"error": "query parameter is required"}), 400
        
        response = azure_client.embeddings.create(
            input=query,
            model=embedding_model_name
        )
        query_embedding = response.data[0].embedding
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT content, metadata, 
                   1 - (embedding <=> %s::vector) as similarity
            FROM documents
            ORDER BY embedding <=> %s::vector
            LIMIT %s
        """, (query_embedding, query_embedding, top_k))
        
        results = []
        for row in cursor.fetchall():
            results.append({
                "content": row[0],
                "metadata": row[1],
                "similarity": float(row[2])
            })
        
        cursor.close()
        conn.close()
        return jsonify(results)
        
    except Exception as e:
        logger.error(f"Error retrieving chunks: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route('/search_by_metadata', methods=['POST'])
def search_by_metadata():
    try:
        data = request.json
        key = data.get('key')
        value = data.get('value')
        top_k = data.get('top_k', 5)
        
        if not key or not value:
            return jsonify({"error": "key and value parameters are required"}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT content, metadata
            FROM documents
            WHERE metadata->>%s = %s
            LIMIT %s
        """, (key, value, top_k))
        
        results = []
        for row in cursor.fetchall():
            results.append({
                "content": row[0],
                "metadata": row[1]
            })
        
        cursor.close()
        conn.close()
        return jsonify(results)
    except Exception as e:
        logger.error(f"Error searching by metadata: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route('/get_document_stats', methods=['POST', 'GET'])
def get_document_stats():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) FROM documents;")
        total_docs = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM documents WHERE embedding IS NOT NULL;")
        docs_with_embeddings = cursor.fetchone()[0]

        cursor.execute("SELECT DISTINCT jsonb_object_keys(metadata) FROM documents WHERE metadata IS NOT NULL;")
        metadata_keys = [row[0] for row in cursor.fetchall()]
        
        cursor.close()
        conn.close()
        
        return jsonify({
            "total_documents": total_docs,
            "documents_with_embeddings": docs_with_embeddings,
            "available_metadata_keys": metadata_keys
        })
    except Exception as e:
        logger.error(f"Error getting stats: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    logger.info("Starting RAG Retrieval REST API server on port 8000")
    app.run(host="0.0.0.0", port=8000)

