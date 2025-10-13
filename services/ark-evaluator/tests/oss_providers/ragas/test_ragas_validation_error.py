#!/usr/bin/env python3
"""
Test script to verify RAGAS validation error handling.
"""

import asyncio
import sys
from pathlib import Path

# Add src to Python path
sys.path.insert(0, str(Path(__file__).parent / "src"))

async def test_ragas_validation_error():
    """Test that RAGAS returns validation errors instead of fallback scores."""
    print("=== Testing RAGAS Validation Error Handling ===")

    try:
        from src.evaluator.oss_providers.ragas.ragas_provider import RagasProvider
        from src.evaluator.types import UnifiedEvaluationRequest

        provider = RagasProvider()

        # Create request with valid LLM config but missing required fields for metrics
        request = UnifiedEvaluationRequest(
            type="direct",
            config={
                "input": "Test question",
                "output": "Test answer"
                # Missing context for context_precision metric
            },
            parameters={
                "metrics": "context_precision",  # Requires context field
                # Add valid Azure OpenAI config
                "azure.api_key": "dummy_key",
                "azure.endpoint": "https://dummy.openai.azure.com/",
                "azure.api_version": "2023-05-15"
            }
        )

        response = await provider.evaluate(request)

        print(f"Response received:")
        print(f"  Score: {response.score}")
        print(f"  Passed: {response.passed}")
        print(f"  Error: {response.error}")
        print(f"  Error Type: {response.metadata.get('error_type') if response.metadata else None}")

        if response.error and "validation" in response.error.lower():
            print("✅ Provider correctly returned validation error response")
        elif response.error:
            print("✅ Provider correctly returned error response (other type)")
        else:
            print("❌ Provider did not return expected error response")

        # Print metadata for debugging
        if response.metadata:
            print(f"  Metadata keys: {list(response.metadata.keys())}")
            for key, value in response.metadata.items():
                if len(str(value)) < 100:  # Only print short values
                    print(f"    {key}: {value}")

    except Exception as e:
        print(f"❌ Test failed: {type(e).__name__}: {e}")

    print("\n=== Validation Error Test Complete ===")

if __name__ == "__main__":
    asyncio.run(test_ragas_validation_error())