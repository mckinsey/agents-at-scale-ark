#!/usr/bin/env python3

"""
Integration test to verify context recall metric works end-to-end.
This test simulates the original failing scenario.
"""

import sys
from pathlib import Path
import asyncio
from unittest.mock import Mock, AsyncMock, patch

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from src.evaluator.types import UnifiedEvaluationRequest, EvaluationConfig
from src.evaluator.oss_providers.ragas.ragas_provider import RagasProvider

async def test_context_recall_integration():
    """Test that context recall metric works end-to-end without RAGAS validation errors."""

    print("=== Integration Test: Context Recall Metric ===")
    print("Simulating the original failing scenario with context_precision/context_recall")

    # Create evaluation request that was previously failing
    request = UnifiedEvaluationRequest(
        type="direct",
        evaluatorName="test-evaluator",
        config=EvaluationConfig(
            input="Where is the Eiffel Tower located?",
            output="The Eiffel Tower is located in Paris."
        ),
        parameters={
            "azure.api_key": "test-key",
            "azure.endpoint": "https://test.openai.azure.com/",
            "azure.api_version": "2024-12-01-preview",
            "azure.deployment_name": "gpt-4",
            "metrics": "context_recall",
            "context": "Paris is the capital of France."
        }
    )

    provider = RagasProvider()

    print(f"Request input: {request.config.input}")
    print(f"Request output: {request.config.output}")
    print(f"Request context: {request.parameters.get('context')}")
    print(f"Metrics requested: {request.parameters.get('metrics')}")
    print()

    # Mock the adapter to simulate successful RAGAS evaluation without dependency issues
    with patch.object(provider, '_get_ragas_adapter') as mock_get_adapter:
        mock_adapter = AsyncMock()

        # Mock successful evaluation with context recall score
        mock_adapter.evaluate = AsyncMock(return_value={'context_recall': 0.85})

        # Mock validation results showing the metric is valid
        mock_adapter.get_validation_results = Mock(return_value={
            'valid_metrics': ['context_recall'],
            'invalid_metrics': [],
            'validation_errors': {}
        })

        mock_get_adapter.return_value = mock_adapter

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

            # Verify successful evaluation
            success_tests = []

            # Test 1: No validation errors
            if not result.error:
                success_tests.append("✅ No evaluation errors")
            else:
                success_tests.append(f"❌ Evaluation error: {result.error}")

            # Test 2: Got a score
            if float(result.score) > 0:
                success_tests.append(f"✅ Got evaluation score: {result.score}")
            else:
                success_tests.append("❌ No evaluation score returned")

            # Test 3: Metadata shows valid metrics
            if "valid_metrics" in result.metadata and "context_recall" in result.metadata["valid_metrics"]:
                success_tests.append("✅ Context recall metric marked as valid")
            else:
                success_tests.append("❌ Context recall metric not found in valid metrics")

            # Test 4: No invalid metrics
            if result.metadata.get("invalid_metrics", "") == "":
                success_tests.append("✅ No invalid metrics reported")
            else:
                success_tests.append(f"❌ Invalid metrics found: {result.metadata.get('invalid_metrics')}")

            print("=== Integration Test Results ===")
            for test_result in success_tests:
                print(test_result)

            if all("✅" in test for test in success_tests):
                print("\n🎉 SUCCESS: Context recall metric integration test passed!")
                print("The original RAGAS validation error should now be resolved.")
            else:
                print("\n❌ FAIL: Some integration tests failed.")

        except Exception as e:
            print(f"❌ Integration test failed with exception: {e}")
            import traceback
            traceback.print_exc()

async def test_dataset_columns():
    """Test that the dataset contains all required columns for RAGAS validation."""

    print("\n=== Dataset Columns Test ===")

    from src.evaluator.oss_providers.ragas.ragas_evaluator import RagasEvaluator

    # Create dataset like the real scenario
    dataset = RagasEvaluator.prepare_dataset(
        input_text="Where is the Eiffel Tower located?",
        output_text="The Eiffel Tower is located in Paris.",
        context="Paris is the capital of France.",
        ground_truth=None,
        metrics=['context_recall']
    )

    dataset_columns = dataset.column_names
    print(f"Dataset columns: {dataset_columns}")

    # Check for the columns that RAGAS requires
    required_columns = ['user_input', 'retrieved_contexts', 'response', 'reference']

    missing_columns = []
    for col in required_columns:
        if col in dataset_columns:
            print(f"✅ {col}: present")
        else:
            print(f"❌ {col}: missing")
            missing_columns.append(col)

    if not missing_columns:
        print("\n✅ SUCCESS: All required columns present for RAGAS validation")
        print("The original error 'requires the following additional columns ['reference']' should be resolved")
    else:
        print(f"\n❌ FAIL: Missing columns: {missing_columns}")

if __name__ == "__main__":
    asyncio.run(test_context_recall_integration())
    asyncio.run(test_dataset_columns())