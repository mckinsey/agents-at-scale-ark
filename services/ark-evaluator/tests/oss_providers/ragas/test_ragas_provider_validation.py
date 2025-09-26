#!/usr/bin/env python3

"""
Test the RAGAS provider validation behavior without dependency issues.
"""

import sys
from pathlib import Path
import asyncio
from unittest.mock import Mock, AsyncMock, patch

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from src.evaluator.types import UnifiedEvaluationRequest, EvaluationConfig
from src.evaluator.oss_providers.ragas.ragas_provider import RagasProvider

async def test_provider_validation():
    """Test that the provider correctly reports validation failures in metadata."""

    print("=== Testing RAGAS Provider Validation Metadata ===")

    # Create evaluation request without ground_truth parameter
    request = UnifiedEvaluationRequest(
        type="direct",
        evaluatorName="test-evaluator",
        config=EvaluationConfig(
            input="What is the capital of France?",
            output="The capital of France is Paris."
        ),
        parameters={
            "azure.api_key": "test-key",
            "azure.endpoint": "https://test.openai.azure.com/",
            "azure.api_version": "2024-12-01-preview",
            "azure.deployment_name": "gpt-4",
            "metrics": "correctness"  # This requires reference field
        }
    )

    provider = RagasProvider()

    # Mock the adapter to avoid dependency issues but test the validation flow
    with patch.object(provider, '_get_ragas_adapter') as mock_get_adapter:
        mock_adapter = AsyncMock()

        # Mock the adapter to return empty scores (which happens when validation fails)
        mock_adapter.evaluate = AsyncMock(return_value={})  # No scores returned

        # Mock validation results to show correctness failed validation
        mock_adapter.get_validation_results = Mock(return_value={
            'valid_metrics': [],
            'invalid_metrics': ['correctness'],
            'validation_errors': {'correctness': "Field 'reference' is required but empty"}
        })

        mock_get_adapter.return_value = mock_adapter

        result = await provider.evaluate(request)

        print(f"Request metrics: {request.parameters.get('metrics')}")
        print(f"Ground truth provided: {request.parameters.get('ground_truth', 'None')}")
        print()

        print("=== Evaluation Result ===")
        print(f"Score: {result.score}")
        print(f"Passed: {result.passed}")
        print(f"Error: {result.error}")
        print()

        print("=== Metadata ===")
        for key, value in result.metadata.items():
            print(f"{key}: {value}")
        print()

        # Verify the validation results are properly included
        success_tests = []

        # Test 1: Check that invalid metrics are reported
        if "invalid_metrics" in result.metadata and "correctness" in result.metadata["invalid_metrics"]:
            success_tests.append("✅ Invalid metrics correctly reported in metadata")
        else:
            success_tests.append("❌ Invalid metrics not found in metadata")

        # Test 2: Check validation summary
        if "validation_summary" in result.metadata and "0 successful" in result.metadata["validation_summary"]:
            success_tests.append("✅ Validation summary correctly reports 0 successful metrics")
        else:
            success_tests.append("❌ Validation summary not found or incorrect")

        # Test 3: Check validation errors
        if "validation_errors" in result.metadata:
            success_tests.append("✅ Validation errors included in metadata")
        else:
            success_tests.append("❌ Validation errors not found in metadata")

        # Test 4: Check that failed metrics are reported
        if "failed_metrics" in result.metadata:
            success_tests.append("✅ Failed metrics information included in metadata")
        else:
            success_tests.append("❌ Failed metrics information not found in metadata")

        # Test 5: Check that empty scores are handled correctly
        if result.error and "No scores returned" in result.error:
            success_tests.append("✅ Correctly handles case with no valid metrics to evaluate")
        else:
            success_tests.append("❌ Should return error when no metrics can be evaluated")

        print("=== Validation Tests ===")
        for test_result in success_tests:
            print(test_result)

if __name__ == "__main__":
    asyncio.run(test_provider_validation())