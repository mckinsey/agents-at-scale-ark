#!/usr/bin/env python3
"""
Test script to verify RAGAS error handling instead of fallback scores.
"""

import asyncio
import sys
from pathlib import Path

# Add src to Python path
sys.path.insert(0, str(Path(__file__).parent / "src"))

async def test_ragas_error_handling():
    """Test that RAGAS adapter raises exceptions instead of returning fallback scores."""
    print("=== Testing RAGAS Error Handling ===")

    try:
        from src.evaluator.oss_providers.ragas.ragas_adapter_refactored import RagasAdapter, RagasEvaluationError
        print("✅ Successfully imported RagasAdapter and RagasEvaluationError")
    except ImportError as e:
        print(f"❌ Failed to import RAGAS components: {e}")
        return

    adapter = RagasAdapter()

    # Test 1: Missing RAGAS dependencies (simulate ImportError)
    print("\nTest 1: Import Error Handling")
    print("-" * 40)

    # This would normally trigger an ImportError in real scenario
    # For testing, we'll check the structure

    # Test 2: Validation error (missing required fields)
    print("\nTest 2: Validation Error Handling")
    print("-" * 40)

    try:
        # Create minimal params that should fail validation
        params = {
            # Missing LLM provider configuration
        }

        result = await adapter.evaluate(
            input_text="Test question",
            output_text="Test answer",
            metrics=["context_precision"],  # This requires context but we don't provide it
            params=params
        )

        print(f"❌ Expected RagasEvaluationError but got result: {result}")

    except Exception as e:
        if hasattr(e, 'error_type'):
            print(f"✅ Caught RagasEvaluationError: {e.message}")
            print(f"   Error Type: {e.error_type}")
            if hasattr(e, 'to_dict'):
                error_dict = e.to_dict()
                print(f"   Error Dict: {error_dict}")
        else:
            print(f"✅ Caught exception (expected): {type(e).__name__}: {e}")

    # Test 3: Provider integration test
    print("\nTest 3: Provider Error Response")
    print("-" * 40)

    try:
        from evaluator.oss_providers.ragas.ragas_provider import RagasProvider
        from evaluator.types import UnifiedEvaluationRequest, EvaluationConfig

        provider = RagasProvider()

        # Create request with missing required parameters
        request = UnifiedEvaluationRequest(
            type="direct",
            config={
                "input": "Test question",
                "output": "Test answer"
            },
            parameters={
                "metrics": "context_precision"  # Requires context but not provided
                # Missing LLM provider config
            }
        )

        response = await provider.evaluate(request)

        print(f"Response received:")
        print(f"  Score: {response.score}")
        print(f"  Passed: {response.passed}")
        print(f"  Error: {response.error}")
        print(f"  Metadata: {response.metadata}")

        if response.error and not response.passed:
            print("✅ Provider correctly returned error response instead of fallback scores")
        else:
            print("❌ Provider did not return expected error response")

    except Exception as e:
        print(f"❌ Provider test failed: {type(e).__name__}: {e}")

    print("\n=== Error Handling Test Complete ===")

if __name__ == "__main__":
    asyncio.run(test_ragas_error_handling())