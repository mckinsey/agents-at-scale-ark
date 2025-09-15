#!/usr/bin/env python3
"""
Test script to simulate the exact thread-based RAGAS execution environment
and try different Azure OpenAI embedding configurations
"""

import asyncio
import threading
import os
import logging
from typing import Dict, Any

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_in_thread(config_name: str, embedding_config: Dict[str, Any], params: Dict[str, Any]):
    """Test Azure embeddings creation in a separate thread (simulating uvloop isolation)"""
    
    def _run_in_thread():
        logger.info(f"Testing {config_name} in thread: {threading.current_thread().name}")
        
        # Set environment variables in thread (as our current code does)
        env_vars_set = []
        
        # Simulate the environment variable setup from our current code
        if 'langfuse.azure_api_key' in params:
            os.environ['AZURE_OPENAI_API_KEY'] = params['langfuse.azure_api_key']
            os.environ['OPENAI_API_KEY'] = params['langfuse.azure_api_key']
            env_vars_set.extend(['AZURE_OPENAI_API_KEY', 'OPENAI_API_KEY'])
        
        if 'langfuse.azure_endpoint' in params:
            os.environ['AZURE_OPENAI_ENDPOINT'] = params['langfuse.azure_endpoint']
            os.environ['OPENAI_API_BASE'] = params['langfuse.azure_endpoint']
            env_vars_set.extend(['AZURE_OPENAI_ENDPOINT', 'OPENAI_API_BASE'])
        
        if 'langfuse.model_version' in params:
            os.environ['OPENAI_API_VERSION'] = params['langfuse.model_version']
            env_vars_set.append('OPENAI_API_VERSION')
        
        logger.info(f"Set environment variables: {env_vars_set}")
        
        # Reset event loop policy to avoid uvloop inheritance (as in our code)
        asyncio.set_event_loop_policy(asyncio.DefaultEventLoopPolicy())
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            result = loop.run_until_complete(_test_embedding_async(config_name, embedding_config))
            return result
        except Exception as e:
            logger.error(f"Thread execution failed: {e}")
            return False
        finally:
            loop.close()
            # Clean up environment variables
            for var in env_vars_set:
                os.environ.pop(var, None)
    
    # Run in separate thread
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor() as executor:
        future = executor.submit(_run_in_thread)
        return future.result()

async def _test_embedding_async(config_name: str, embedding_config: Dict[str, Any]) -> bool:
    """Test Azure embeddings creation asynchronously"""
    
    try:
        from langchain_openai import AzureOpenAIEmbeddings
        from ragas.embeddings import LangchainEmbeddingsWrapper
        
        logger.info(f"Creating Azure embeddings with config: {embedding_config}")
        
        # Create embeddings with the given config
        azure_embeddings = AzureOpenAIEmbeddings(**embedding_config)
        embeddings = LangchainEmbeddingsWrapper(azure_embeddings)
        
        logger.info(f"✅ SUCCESS: {config_name}")
        logger.info(f"Azure embeddings created: {azure_embeddings}")
        
        # Now test initializing RAGAS metrics
        from ragas.metrics import answer_relevancy, answer_correctness, answer_similarity
        from ragas.metrics.base import MetricWithLLM, MetricWithEmbeddings
        from ragas.run_config import RunConfig
        
        # Test with answer_similarity (the one that was failing)
        metric = answer_similarity()
        
        if isinstance(metric, MetricWithEmbeddings):
            metric.embeddings = embeddings
            logger.info("✅ Configured metric with Azure embeddings")
        
        # Initialize the metric
        run_config = RunConfig()
        metric.init(run_config)
        logger.info("✅ Metric initialized successfully")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ FAILED: {config_name} - {e}")
        logger.error(f"Error type: {type(e).__name__}")
        return False

def main():
    # Simulate the exact parameters from your deployment
    params = {
        'langfuse.azure_endpoint': 'https://openai.azure.com/',
        'langfuse.azure_deployment': 'gpt-4.1-mini',
        'langfuse.model_version': '2024-04-01-preview',
        'langfuse.azure_api_key': 'key',  # Using dummy key for testing
    }
    
    # Test different embedding configurations
    test_configs = [
        # Config 1: Current approach (environment variables only)
        (
            "Environment variables only",
            {
                'model': 'text-embedding-ada-002',
                'deployment': 'text-embedding-ada-002'
            }
        ),
        
        # Config 2: Explicit parameters (like original code)
        (
            "Explicit parameters",
            {
                'model': 'text-embedding-ada-002',
                'azure_endpoint': params['langfuse.azure_endpoint'],
                'deployment': 'text-embedding-ada-002',
                'openai_api_version': params['langfuse.model_version'],
                'api_key': params['langfuse.azure_api_key']
            }
        ),
        
        # Config 3: Using azure_deployment instead of deployment
        (
            "Using azure_deployment",
            {
                'model': 'text-embedding-ada-002',
                'azure_endpoint': params['langfuse.azure_endpoint'],
                'azure_deployment': 'text-embedding-ada-002',  # Note: using azure_deployment
                'openai_api_version': params['langfuse.model_version'],
                'api_key': params['langfuse.azure_api_key']
            }
        ),
        
        # Config 4: Using openai_api_key instead of api_key
        (
            "Using openai_api_key",
            {
                'model': 'text-embedding-ada-002',
                'azure_endpoint': params['langfuse.azure_endpoint'],
                'deployment': 'text-embedding-ada-002',
                'openai_api_version': params['langfuse.model_version'],
                'openai_api_key': params['langfuse.azure_api_key']  # Using alias
            }
        ),
        
        # Config 5: Minimal config without api_key
        (
            "Minimal without api_key",
            {
                'model': 'text-embedding-ada-002',
                'azure_endpoint': params['langfuse.azure_endpoint'],
                'deployment': 'text-embedding-ada-002',
                'openai_api_version': params['langfuse.model_version']
                # No api_key - should use env var
            }
        ),
        
        # Config 6: Only model (everything from env vars)
        (
            "Only model specified",
            {
                'model': 'text-embedding-ada-002'
            }
        ),
        
        # Config 7: Using different API version
        (
            "Different API version",
            {
                'model': 'text-embedding-ada-002',
                'azure_endpoint': params['langfuse.azure_endpoint'],
                'deployment': 'text-embedding-ada-002',
                'openai_api_version': '2024-04-01-preview',  # Different version
                'api_key': params['langfuse.azure_api_key']
            }
        ),
        
        # Config 8: Test if the issue is with the endpoint format
        (
            "Endpoint without trailing slash",
            {
                'model': 'text-embedding-ada-002',
                'azure_endpoint': 'https://openai.azure.com',  # No trailing slash
                'deployment': 'text-embedding-ada-002',
                'openai_api_version': params['langfuse.model_version'],
                'api_key': params['langfuse.azure_api_key']
            }
        ),
    ]
    
    logger.info("="*80)
    logger.info("TESTING AZURE OPENAI EMBEDDINGS IN THREAD ENVIRONMENT")
    logger.info("="*80)
    
    results = []
    for config_name, embedding_config in test_configs:
        logger.info(f"\n{'-'*60}")
        logger.info(f"Testing: {config_name}")
        logger.info(f"Config: {embedding_config}")
        logger.info(f"{'-'*60}")
        
        success = test_in_thread(config_name, embedding_config, params)
        results.append((config_name, success))
    
    # Summary
    logger.info(f"\n{'='*80}")
    logger.info("RESULTS SUMMARY")
    logger.info(f"{'='*80}")
    
    successful_configs = []
    for config_name, success in results:
        status = "✅" if success else "❌"
        logger.info(f"{status} {config_name}")
        if success:
            successful_configs.append(config_name)
    
    if successful_configs:
        logger.info(f"\n🎉 WORKING CONFIGURATIONS:")
        for config in successful_configs:
            logger.info(f"  ✅ {config}")
        logger.info(f"\nRecommendation: Use the first working configuration in your code.")
    else:
        logger.info(f"\n😞 NO WORKING CONFIGURATIONS FOUND")
        logger.info("Need to investigate further or check package versions.")
    
    # Package versions for debugging
    logger.info(f"\n{'='*80}")
    logger.info("PACKAGE VERSIONS")
    logger.info(f"{'='*80}")
    
    try:
        import langchain_openai
        logger.info(f"langchain_openai: {langchain_openai.__version__}")
    except Exception as e:
        logger.info(f"langchain_openai: Error getting version - {e}")
    
    try:
        import openai
        logger.info(f"openai: {openai.__version__}")
    except Exception as e:
        logger.info(f"openai: Error getting version - {e}")
        
    try:
        import ragas
        logger.info(f"ragas: {ragas.__version__}")
    except Exception as e:
        logger.info(f"ragas: Error getting version - {e}")

if __name__ == "__main__":
    main()