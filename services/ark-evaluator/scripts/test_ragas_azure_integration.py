#!/usr/bin/env python3
"""
Test script to replicate and fix the RAGAS Azure integration issue
"""

import os
import logging
from typing import Dict, Any

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def simulate_current_code():
    """Simulate exactly what the current code is doing"""
    
    # Simulate the params from the evaluator
    params = {
        'langfuse.azure_endpoint': os.getenv('E2E_TEST_AZURE_OPENAI_BASE_URL', 'url'),
        'langfuse.azure_deployment': 'gpt-4.1-mini',
        'langfuse.model_version': '2024-04-01-preview',
        'langfuse.azure_api_key': os.getenv('E2E_TEST_AZURE_OPENAI_KEY', 'key'),
        # Note: No embedding-specific params
    }
    
    # Simulate llm_config creation
    llm_config = {
        'provider': 'azure_openai',
        'api_base': params.get('langfuse.azure_endpoint'),
        'api_key': params.get('langfuse.azure_api_key'),
        'api_version': params.get('langfuse.model_version', '2024-02-01'),
        'deployment_name': params.get('langfuse.azure_deployment'),
        'model': params.get('langfuse.model', 'gpt-4')
    }
    
    logger.info(f"LLM Config: {llm_config}")
    
    # Get embedding deployment - fallback to default if not specified
    embedding_deployment = params.get('langfuse.azure_embedding_deployment', 'text-embedding-ada-002')
    embedding_model = params.get('langfuse.azure_embedding_model', 'text-embedding-ada-002')
    
    logger.info(f"Embedding deployment: {embedding_deployment}")
    logger.info(f"Embedding model: {embedding_model}")
    
    try:
        from langchain_openai import AzureOpenAIEmbeddings
        from ragas.embeddings import LangchainEmbeddingsWrapper
        
        # This is what we're currently doing
        azure_embeddings = AzureOpenAIEmbeddings(
            model=embedding_model,
            azure_endpoint=llm_config['api_base'],
            deployment=embedding_deployment,
            openai_api_version=llm_config['api_version'],
            api_key=llm_config['api_key']
        )
        
        embeddings = LangchainEmbeddingsWrapper(azure_embeddings)
        logger.info(f"✅ Created Azure embeddings successfully!")
        
        # Test embedding
        test_result = azure_embeddings.embed_query("test")
        logger.info(f"✅ Embedding test successful, vector length: {len(test_result)}")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to create Azure embeddings: {e}")
        return False

def test_alternative_approaches():
    """Test alternative approaches to creating Azure embeddings"""
    
    params = {
        'langfuse.azure_endpoint': 'https://lxo.openai.azure.com/',
        'langfuse.azure_deployment': 'gpt-4.1-mini',
        'langfuse.model_version': '2024-12-01-preview',
        'langfuse.azure_api_key': os.getenv('AZURE_OPENAI_API_KEY', 'test-key'),
    }
    
    llm_config = {
        'api_base': params.get('langfuse.azure_endpoint'),
        'api_key': params.get('langfuse.azure_api_key'),
        'api_version': params.get('langfuse.model_version', '2024-02-01'),
        'deployment_name': params.get('langfuse.azure_deployment'),
        'model': 'gpt-4'
    }
    
    approaches = []
    
    # Approach 1: Set environment variables first
    logger.info("\n" + "="*60)
    logger.info("Approach 1: Using environment variables")
    logger.info("="*60)
    
    os.environ['AZURE_OPENAI_API_KEY'] = llm_config['api_key']
    os.environ['AZURE_OPENAI_ENDPOINT'] = llm_config['api_base']
    os.environ['OPENAI_API_VERSION'] = llm_config['api_version']
    
    try:
        from langchain_openai import AzureOpenAIEmbeddings
        azure_embeddings = AzureOpenAIEmbeddings(
            model='text-embedding-ada-002',
            deployment='text-embedding-ada-002'
        )
        logger.info("✅ Approach 1 successful")
        approaches.append(("Environment variables", True))
    except Exception as e:
        logger.error(f"❌ Approach 1 failed: {e}")
        approaches.append(("Environment variables", False))
    
    # Approach 2: Explicit parameters without api_key
    logger.info("\n" + "="*60)
    logger.info("Approach 2: Explicit params without api_key")
    logger.info("="*60)
    
    try:
        from langchain_openai import AzureOpenAIEmbeddings
        azure_embeddings = AzureOpenAIEmbeddings(
            model='text-embedding-ada-002',
            azure_endpoint=llm_config['api_base'],
            deployment='text-embedding-ada-002',
            openai_api_version=llm_config['api_version']
            # api_key omitted - should use env var
        )
        logger.info("✅ Approach 2 successful")
        approaches.append(("Explicit params without api_key", True))
    except Exception as e:
        logger.error(f"❌ Approach 2 failed: {e}")
        approaches.append(("Explicit params without api_key", False))
    
    # Approach 3: Using openai_api_key alias
    logger.info("\n" + "="*60)
    logger.info("Approach 3: Using openai_api_key alias")
    logger.info("="*60)
    
    try:
        from langchain_openai import AzureOpenAIEmbeddings
        azure_embeddings = AzureOpenAIEmbeddings(
            model='text-embedding-ada-002',
            azure_endpoint=llm_config['api_base'],
            deployment='text-embedding-ada-002',
            openai_api_version=llm_config['api_version'],
            openai_api_key=llm_config['api_key']  # Using alias
        )
        logger.info("✅ Approach 3 successful")
        approaches.append(("openai_api_key alias", True))
    except Exception as e:
        logger.error(f"❌ Approach 3 failed: {e}")
        approaches.append(("openai_api_key alias", False))
    
    # Summary
    logger.info("\n" + "="*60)
    logger.info("SUMMARY OF APPROACHES")
    logger.info("="*60)
    for name, success in approaches:
        status = "✅" if success else "❌"
        logger.info(f"{status} {name}")
    
    return approaches

def inspect_azure_embeddings_init():
    """Inspect the actual AzureOpenAIEmbeddings init signature"""
    logger.info("\n" + "="*60)
    logger.info("INSPECTING AzureOpenAIEmbeddings")
    logger.info("="*60)
    
    try:
        from langchain_openai import AzureOpenAIEmbeddings
        import inspect
        
        # Get the signature
        sig = inspect.signature(AzureOpenAIEmbeddings.__init__)
        logger.info(f"Signature: {sig}")
        
        # Get the parameters
        for param_name, param in sig.parameters.items():
            if param_name != 'self':
                default = param.default if param.default != inspect.Parameter.empty else "no default"
                logger.info(f"  {param_name}: {param.annotation if param.annotation != inspect.Parameter.empty else 'Any'} = {default}")
        
        # Check for field definitions
        if hasattr(AzureOpenAIEmbeddings, '__fields__'):
            logger.info("\nPydantic fields:")
            for field_name, field_info in AzureOpenAIEmbeddings.__fields__.items():
                logger.info(f"  {field_name}: {field_info}")
        
    except Exception as e:
        logger.error(f"Failed to inspect: {e}")

if __name__ == "__main__":
    # First, inspect the class
    inspect_azure_embeddings_init()
    
    # Test current code
    logger.info("\n" + "="*60)
    logger.info("TESTING CURRENT CODE")
    logger.info("="*60)
    simulate_current_code()
    
    # Test alternatives
    test_alternative_approaches()