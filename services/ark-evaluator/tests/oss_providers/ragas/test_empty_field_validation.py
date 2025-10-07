#!/usr/bin/env python3

"""
Test script to verify empty field validation for RAGAS metrics.

This test verifies that the correctness metric fails gracefully when
no ground_truth (reference) is provided, instead of evaluating with
an empty reference field.
"""

import sys
from pathlib import Path
import asyncio
import json
import logging

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from src.evaluator.types import UnifiedEvaluationRequest, EvaluationConfig
from src.evaluator.oss_providers.ragas.ragas_provider import RagasProvider

# Configure logging to see the validation process
logging.basicConfig(level=logging.INFO)

async def test_empty_field_validation():
    """Test that correctness metric fails validation without ground_truth."""

    print("=== Testing Empty Field Validation for RAGAS Correctness Metric ===")

    # Create evaluation request without ground_truth parameter
    request = UnifiedEvaluationRequest(
        type="direct",
        evaluatorName="test-evaluator",
        config=EvaluationConfig(
            input="What is the capital of France?",
            output="The capital of France is Paris."
        ),
        parameters={
            # Note: No ground_truth parameter provided
            "azure.api_key": "test-key",
            "azure.endpoint": "https://test.openai.azure.com/",
            "azure.api_version": "2024-12-01-preview",
            "azure.deployment_name": "gpt-4",
            "metrics": "correctness"  # This requires reference field
        }
    )

    provider = RagasProvider()

    print(f"Request: {request.config.input}")
    print(f"Response: {request.config.output}")
    print(f"Metrics requested: {request.parameters.get('metrics')}")
    print(f"Ground truth provided: {request.parameters.get('ground_truth', 'None')}")
    print()

    try:
        result = await provider.evaluate(request)

        print("=== Evaluation Result ===")
        print(f"Score: {result.score}")
        print(f"Passed: {result.passed}")
        print(f"Error: {result.error}")
        print()

        print("=== Metadata ===")
        for key, value in result.metadata.items():
            print(f"{key}: {value}")
        print()

        # Check if the validation worked as expected
        if "invalid_metrics" in result.metadata:
            invalid_metrics = result.metadata["invalid_metrics"]
            if "correctness" in invalid_metrics:
                print("✅ SUCCESS: Correctness metric was properly invalidated due to missing reference field")

                # Check for validation errors
                if "validation_errors" in result.metadata:
                    validation_errors = json.loads(result.metadata["validation_errors"])
                    correctness_error = validation_errors.get("correctness", "")
                    print(f"✅ Validation error message: {correctness_error}")

                    if "empty" in correctness_error.lower() or "required" in correctness_error.lower():
                        print("✅ Error message correctly identifies empty required field")
                    else:
                        print("⚠️  Error message may not be specific about empty field")
                else:
                    print("⚠️  No validation errors found in metadata")
            else:
                print("❌ FAIL: Correctness metric was not invalidated")
        else:
            print("❌ FAIL: No invalid_metrics found in metadata")

        # Check that no actual evaluation occurred for invalid metrics
        if result.error or float(result.score) == 0.0:
            print("✅ No evaluation score returned for invalid metric")
        else:
            print(f"❌ FAIL: Got evaluation score {result.score} despite invalid metric")

    except Exception as e:
        print(f"❌ Error during evaluation: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_empty_field_validation())