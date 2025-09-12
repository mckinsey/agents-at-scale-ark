#!/usr/bin/env python3
"""
Standalone RAGAS test script to verify uvloop compatibility fixes.
Run this outside the cluster to test RAGAS evaluation.
"""

import asyncio
import logging
import os
import sys
from typing import Dict, List

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def test_ragas_with_uvloop():
    """Test RAGAS with uvloop environment."""
    try:
        # Install uvloop to simulate cluster environment
        import uvloop
        asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())
        logger.info("Set uvloop event loop policy")
    except ImportError:
        logger.warning("uvloop not available, using default asyncio")

    from evaluator.oss_providers.ragas_adapter import RagasAdapter

    # Test data
    input_text = "What is the square root of 25?"
    output_text = "The square root of 25 is 5"
    metrics = ['relevance', 'correctness', 'clarity']
    
    # Mock parameters for OpenAI (you can change these to your preferred provider)
    params = {
        'llm_provider': 'openai',
        'openai_api_key': os.getenv('OPENAI_API_KEY', 'sk-test-key'),
        'openai_model': 'gpt-3.5-turbo',
        'context': 'This is a simple math question about square roots.',
        'context_source': 'test'
    }
    
    logger.info("Starting RAGAS evaluation test...")
    logger.info(f"Input: {input_text}")
    logger.info(f"Output: {output_text}")
    logger.info(f"Metrics: {metrics}")
    
    # Test the adapter
    adapter = RagasAdapter()
    scores = await adapter.evaluate(input_text, output_text, metrics, params)
    
    logger.info(f"Evaluation results: {scores}")
    
    # Calculate overall score
    overall_score = sum(scores.values()) / len(scores)
    logger.info(f"Overall score: {overall_score:.4f}")
    
    return scores


def test_ragas_sync_thread():
    """Test RAGAS in sync mode (separate thread approach)."""
    import threading
    import concurrent.futures
    
    logger.info("Testing RAGAS in separate thread...")
    
    def run_ragas_in_thread():
        # CRITICAL: Reset the event loop policy to default BEFORE creating the loop
        # This ensures the thread doesn't inherit uvloop from the main thread
        asyncio.set_event_loop_policy(asyncio.DefaultEventLoopPolicy())
        
        # Now create a standard asyncio loop (not uvloop)
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        logger.info(f"Thread loop type: {type(loop)}")
        
        try:
            from evaluator.oss_providers.ragas_adapter import RagasAdapter
            
            # Test data
            input_text = "What is the square root of 25?"
            output_text = "The square root of 25 is 5"
            metrics = ['relevance', 'correctness', 'clarity']
            
            params = {
                'llm_provider': 'openai',
                'openai_api_key': os.getenv('OPENAI_API_KEY', 'sk-test-key'),
                'openai_model': 'gpt-3.5-turbo',
                'context': 'This is a simple math question about square roots.',
                'context_source': 'test'
            }
            
            adapter = RagasAdapter()
            # Use the internal async method directly
            scores = loop.run_until_complete(
                adapter._run_ragas_async(input_text, output_text, metrics, params)
            )
            
            logger.info(f"Thread-based evaluation results: {scores}")
            return scores
            
        finally:
            loop.close()
    
    # Run in thread pool
    with concurrent.futures.ThreadPoolExecutor() as executor:
        future = executor.submit(run_ragas_in_thread)
        return future.result()


async def main():
    """Main test function."""
    logger.info("=== RAGAS Standalone Test ===")
    
    # Test 1: Direct async with uvloop
    logger.info("\n--- Test 1: Direct async with uvloop ---")
    try:
        scores1 = await test_ragas_with_uvloop()
        logger.info(f"✅ Test 1 passed: {scores1}")
    except Exception as e:
        logger.error(f"❌ Test 1 failed: {e}")
        
    # Test 2: Thread-based approach
    logger.info("\n--- Test 2: Thread-based approach ---")
    try:
        scores2 = test_ragas_sync_thread()
        logger.info(f"✅ Test 2 passed: {scores2}")
    except Exception as e:
        logger.error(f"❌ Test 2 failed: {e}")
    
    logger.info("\n=== Test completed ===")


if __name__ == "__main__":
    # Set test environment variable if needed
    if not os.getenv('OPENAI_API_KEY'):
        logger.warning("OPENAI_API_KEY not set, using mock key (evaluation will likely fail)")
    
    # Run the test
    asyncio.run(main())