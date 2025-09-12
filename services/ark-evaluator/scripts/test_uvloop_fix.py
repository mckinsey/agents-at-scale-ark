#!/usr/bin/env python3
"""
Test RAGAS with uvloop fix in a realistic scenario.
"""

import asyncio
import logging
import os
import sys

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def test_with_uvloop():
    """Test RAGAS with uvloop (simulating FastAPI environment)."""
    # Install uvloop to simulate cluster environment
    import uvloop
    asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())
    logger.info("Set uvloop event loop policy")
    
    # Create uvloop event loop
    loop = asyncio.get_running_loop()
    logger.info(f"Main loop type: {type(loop)}")
    
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
    
    logger.info("Starting RAGAS evaluation with uvloop...")
    
    # Use the adapter's evaluate method which should detect uvloop
    adapter = RagasAdapter()
    scores = await adapter.evaluate(input_text, output_text, metrics, params)
    
    logger.info(f"Evaluation results: {scores}")
    
    # Check scores
    if scores['correctness'] > 0.9:
        logger.info("✅ SUCCESS: Got high correctness score with uvloop!")
    else:
        logger.error(f"❌ FAILED: Low correctness score {scores['correctness']}")
    
    return scores


if __name__ == "__main__":
    # Run with uvloop - simulate FastAPI's setup
    import uvloop
    
    # This is how FastAPI sets up uvloop
    uvloop.install()
    
    # Now run the test
    asyncio.run(test_with_uvloop())