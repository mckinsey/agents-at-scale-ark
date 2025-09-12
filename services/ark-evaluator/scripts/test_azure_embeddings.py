#!/usr/bin/env python3
"""
Test script to diagnose Azure OpenAI Embeddings parameter issues
"""

import os
import sys
from typing import Dict, Any

def test_azure_embeddings_config(config: Dict[str, Any], test_name: str):
    """Test a specific configuration for Azure OpenAI Embeddings"""
    print(f"\n{'='*60}")
    print(f"Testing: {test_name}")
    print(f"Config: {config}")
    print(f"{'='*60}")
    
    try:
        from langchain_openai import AzureOpenAIEmbeddings
        from ragas.embeddings import LangchainEmbeddingsWrapper
        
        # Try to create embeddings with the given config
        azure_embeddings = AzureOpenAIEmbeddings(**config)
        wrapped_embeddings = LangchainEmbeddingsWrapper(azure_embeddings)
        
        print(f"✅ SUCCESS: {test_name}")
        print(f"Created embeddings: {azure_embeddings}")
        print(f"Wrapped embeddings: {wrapped_embeddings}")
        
        # Try to embed a test text
        try:
            test_text = "This is a test embedding"
            result = azure_embeddings.embed_query(test_text)
            print(f"✅ Embedding test successful, vector length: {len(result)}")
        except Exception as e:
            print(f"⚠️ Embedding test failed: {e}")
        
        return True
        
    except Exception as e:
        print(f"❌ FAILED: {test_name}")
        print(f"Error: {e}")
        print(f"Error type: {type(e).__name__}")
        return False

def main():
    # Get configuration from environment or use test values
    api_key = os.getenv('AZURE_OPENAI_API_KEY', 'test-key')
    endpoint = os.getenv('AZURE_OPENAI_ENDPOINT', 'https://openai.azure.com/')
    deployment = os.getenv('AZURE_OPENAI_DEPLOYMENT', 'text-embedding-ada-002')
    api_version = os.getenv('OPENAI_API_VERSION', '2024-12-01-preview')
    
    print("Testing Azure OpenAI Embeddings Parameter Combinations")
    print(f"Using endpoint: {endpoint}")
    print(f"Using deployment: {deployment}")
    print(f"Using API version: {api_version}")
    
    # Test different parameter combinations
    test_configs = [
        # Test 1: Using deployment (as per documentation)
        (
            {
                'model': 'text-embedding-ada-002',
                'azure_endpoint': endpoint,
                'deployment': deployment,
                'openai_api_version': api_version,
                'api_key': api_key
            },
            "deployment + azure_endpoint + openai_api_version"
        ),
        
        # Test 2: Using azure_deployment instead
        (
            {
                'model': 'text-embedding-ada-002',
                'azure_endpoint': endpoint,
                'azure_deployment': deployment,
                'openai_api_version': api_version,
                'api_key': api_key
            },
            "azure_deployment + azure_endpoint + openai_api_version"
        ),
        
        # Test 3: Without model parameter first
        (
            {
                'azure_endpoint': endpoint,
                'deployment': deployment,
                'openai_api_version': api_version,
                'api_key': api_key,
                'model': 'text-embedding-ada-002'
            },
            "deployment + azure_endpoint (model last)"
        ),
        
        # Test 4: Using openai_api_key instead of api_key
        (
            {
                'model': 'text-embedding-ada-002',
                'azure_endpoint': endpoint,
                'deployment': deployment,
                'openai_api_version': api_version,
                'openai_api_key': api_key
            },
            "deployment + openai_api_key (alias)"
        ),
        
        # Test 5: Using only environment variables
        (
            {
                'model': 'text-embedding-ada-002',
                'deployment': deployment
            },
            "minimal config with env vars"
        ),
        
        # Test 6: With api_version instead of openai_api_version
        (
            {
                'model': 'text-embedding-ada-002',
                'azure_endpoint': endpoint,
                'deployment': deployment,
                'api_version': api_version,
                'api_key': api_key
            },
            "deployment + api_version (wrong param name)"
        ),
    ]
    
    # Set environment variables for test 5
    os.environ['AZURE_OPENAI_API_KEY'] = api_key
    os.environ['AZURE_OPENAI_ENDPOINT'] = endpoint
    os.environ['OPENAI_API_VERSION'] = api_version
    
    results = []
    for config, name in test_configs:
        success = test_azure_embeddings_config(config, name)
        results.append((name, success))
    
    # Summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    for name, success in results:
        status = "✅" if success else "❌"
        print(f"{status} {name}")
    
    # Additional diagnostics
    print(f"\n{'='*60}")
    print("PACKAGE VERSIONS")
    print(f"{'='*60}")
    
    try:
        import langchain_openai
        print(f"langchain_openai: {langchain_openai.__version__}")
    except:
        print("langchain_openai: version not available")
    
    try:
        import openai
        print(f"openai: {openai.__version__}")
    except:
        print("openai: version not available")
        
    try:
        import ragas
        print(f"ragas: {ragas.__version__}")
    except:
        print("ragas: version not available")

if __name__ == "__main__":
    main()