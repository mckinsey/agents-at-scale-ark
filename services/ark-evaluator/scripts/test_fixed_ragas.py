#!/usr/bin/env python3
"""
Test script to verify the fixed RAGAS Azure integration
"""

import asyncio
import threading
import os
import logging
from typing import Dict, Any

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_fixed_ragas_integration():
    """Test the fixed RAGAS integration with Azure OpenAI"""
    
    # Simulate the exact parameters from your deployment  
    params = {
        'langfuse.azure_endpoint': 'https://openai.azure.com/',
        'langfuse.azure_deployment': 'gpt-4.1-mini',
        'langfuse.model_version': '2024-04-01-preview',
        'langfuse.azure_api_key': 'key',  # Using dummy key for testing
    }
    
    # Simulate llm_config creation (like in our actual code)
    llm_config = {
        'provider': 'azure_openai',
        'api_base': params.get('langfuse.azure_endpoint'),
        'api_key': params.get('langfuse.azure_api_key'),
        'api_version': params.get('langfuse.model_version', '2024-02-01'),
        'deployment_name': params.get('langfuse.azure_deployment'),
        'model': params.get('langfuse.model', 'gpt-4')
    }
    
    def test_in_thread():
        """Test Azure embeddings creation in thread like our actual implementation"""
        
        logger.info(f"Testing in thread: {threading.current_thread().name}")
        
        # Set only necessary environment variables (no conflicts)
        env_vars_set = []
        if 'langfuse.azure_api_key' in params:
            os.environ['AZURE_OPENAI_API_KEY'] = params['langfuse.azure_api_key']
            env_vars_set.append('AZURE_OPENAI_API_KEY')
        if 'langfuse.azure_endpoint' in params:
            os.environ['AZURE_OPENAI_ENDPOINT'] = params['langfuse.azure_endpoint']
            env_vars_set.append('AZURE_OPENAI_ENDPOINT')
        if 'langfuse.model_version' in params:
            os.environ['OPENAI_API_VERSION'] = params['langfuse.model_version']
            env_vars_set.append('OPENAI_API_VERSION')
        
        logger.info(f"Set environment variables: {env_vars_set}")
        
        # Reset event loop policy like in our code
        asyncio.set_event_loop_policy(asyncio.DefaultEventLoopPolicy())
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            return loop.run_until_complete(test_embeddings_async(llm_config, params))
        except Exception as e:
            logger.error(f"Thread execution failed: {e}")
            return False
        finally:
            loop.close()
            # Clean up environment variables
            for var in env_vars_set:
                os.environ.pop(var, None)
    
    # Run in separate thread like our actual implementation
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor() as executor:
        future = executor.submit(test_in_thread)
        return future.result()

async def test_embeddings_async(llm_config: Dict[str, Any], params: Dict[str, Any]) -> bool:
    """Test creating Azure embeddings with explicit parameters"""
    
    try:
        from langchain_openai import AzureOpenAIEmbeddings
        from ragas.embeddings import LangchainEmbeddingsWrapper
        
        # Get embedding deployment - fallback to default if not specified
        embedding_deployment = params.get('langfuse.azure_embedding_deployment', 'text-embedding-ada-002')
        embedding_model = params.get('langfuse.azure_embedding_model', 'text-embedding-ada-002')
        
        logger.info(f"Creating Azure embeddings with deployment={embedding_deployment}, model={embedding_model}")
        
        # Use the FIXED approach: explicit parameters, no conflicting env vars
        azure_embeddings = AzureOpenAIEmbeddings(
            model=embedding_model,
            azure_endpoint=llm_config['api_base'],
            deployment=embedding_deployment,
            openai_api_version=llm_config['api_version'],
            api_key=llm_config['api_key']
        )
        
        embeddings = LangchainEmbeddingsWrapper(azure_embeddings)
        logger.info("✅ SUCCESS: Azure embeddings created without validation errors!")
        logger.info(f"Embeddings config: {azure_embeddings}")
        
        # Test basic RAGAS metric initialization
        from ragas.metrics import answer_similarity
        from ragas.metrics.base import MetricWithEmbeddings
        from ragas.run_config import RunConfig
        
        # Handle RAGAS metric instances correctly
        metric = answer_similarity
        if hasattr(metric, '__call__') and not hasattr(metric, 'name'):
            metric = metric()
        
        if isinstance(metric, MetricWithEmbeddings):
            metric.embeddings = embeddings
            logger.info("✅ Configured metric with Azure embeddings")
        
        # Initialize the metric
        run_config = RunConfig()
        metric.init(run_config)
        logger.info("✅ Metric initialized successfully")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ FAILED: {e}")
        logger.error(f"Error type: {type(e).__name__}")
        return False

if __name__ == "__main__":
    logger.info("="*80)
    logger.info("TESTING FIXED RAGAS AZURE INTEGRATION")
    logger.info("="*80)
    
    success = test_fixed_ragas_integration()
    
    if success:
        logger.info("🎉 FIXED INTEGRATION WORKS!")
        logger.info("The Azure embeddings validation error has been resolved.")
        logger.info("Ready to deploy the fix.")
    else:
        logger.info("😞 Integration still has issues.")
        logger.info("Need further investigation.")