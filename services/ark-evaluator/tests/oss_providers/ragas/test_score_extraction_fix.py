#!/usr/bin/env python3

"""
Test script to verify that score extraction works for both function-based and class-based RAGAS metrics.
"""

import sys
from pathlib import Path
import pandas as pd
import logging

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

# Configure logging to see the debug messages
logging.basicConfig(level=logging.DEBUG)

def test_score_extraction():
    """Test score extraction with different RAGAS result structures."""

    print("=== Testing RAGAS Score Extraction Fix ===")
    print("Testing both function-based and class-based metric result extraction")
    print()

    try:
        from src.evaluator.oss_providers.ragas.ragas_evaluator import RagasEvaluator

        # Test 1: Function-based metric (relevance -> answer_relevancy)
        print("Test 1: Function-based metric score extraction")
        print("-" * 50)

        # Simulate RAGAS result for function-based metric
        class MockResult1:
            def to_pandas(self):
                return pd.DataFrame([{
                    'answer_relevancy': 0.85,
                    'user_input': 'What is machine learning?',
                    'response': 'Machine learning is...'
                }])

        mock_result1 = MockResult1()
        scores1 = RagasEvaluator.extract_scores(
            result=mock_result1,
            requested_metrics=['relevance']
        )

        print(f"Requested: ['relevance']")
        print(f"Extracted scores: {scores1}")

        if scores1.get('relevance') == 0.85:
            print("✅ SUCCESS: Function-based metric extraction works")
        else:
            print("❌ FAIL: Function-based metric extraction failed")

        print()

        # Test 2: Class-based metric (context_precision -> llm_context_precision_without_reference)
        print("Test 2: Class-based metric score extraction")
        print("-" * 50)

        # Simulate RAGAS result for class-based metric
        class MockResult2:
            def to_pandas(self):
                return pd.DataFrame([{
                    'llm_context_precision_without_reference': 0.73,
                    'user_input': 'Where is the Eiffel Tower?',
                    'response': 'The Eiffel Tower is in Paris.',
                    'retrieved_contexts': ['Paris is the capital of France.']
                }])

        mock_result2 = MockResult2()
        scores2 = RagasEvaluator.extract_scores(
            result=mock_result2,
            requested_metrics=['context_precision']
        )

        print(f"Requested: ['context_precision']")
        print(f"Extracted scores: {scores2}")

        if scores2.get('context_precision') == 0.73:
            print("✅ SUCCESS: Class-based metric extraction works")
        else:
            print("❌ FAIL: Class-based metric extraction failed")

        print()

        # Test 3: Mixed metrics (both types)
        print("Test 3: Mixed metric types")
        print("-" * 50)

        # Simulate RAGAS result with both metric types
        class MockResult3:
            def to_pandas(self):
                return pd.DataFrame([{
                    'answer_relevancy': 0.82,
                    'llm_context_precision_without_reference': 0.69,
                    'user_input': 'What causes climate change?',
                    'response': 'Climate change is caused by...',
                    'retrieved_contexts': ['Scientific data shows...']
                }])

        mock_result3 = MockResult3()
        scores3 = RagasEvaluator.extract_scores(
            result=mock_result3,
            requested_metrics=['relevance', 'context_precision']
        )

        print(f"Requested: ['relevance', 'context_precision']")
        print(f"Extracted scores: {scores3}")

        success_count = 0
        if scores3.get('relevance') == 0.82:
            print("✅ Function-based metric in mix: OK")
            success_count += 1
        else:
            print("❌ Function-based metric in mix: FAIL")

        if scores3.get('context_precision') == 0.69:
            print("✅ Class-based metric in mix: OK")
            success_count += 1
        else:
            print("❌ Class-based metric in mix: FAIL")

        if success_count == 2:
            print("✅ SUCCESS: Mixed metrics work correctly")
        else:
            print("❌ FAIL: Mixed metrics have issues")

        print()

        # Test 4: Alternative field name fallback
        print("Test 4: Alternative field name fallback")
        print("-" * 50)

        # Simulate RAGAS result with alternative field name
        class MockResult4:
            def to_pandas(self):
                return pd.DataFrame([{
                    'context_precision': 0.91,  # Alternative name instead of llm_context_precision_without_reference
                    'user_input': 'Test question',
                    'response': 'Test answer'
                }])

        mock_result4 = MockResult4()
        scores4 = RagasEvaluator.extract_scores(
            result=mock_result4,
            requested_metrics=['context_precision']
        )

        print(f"Requested: ['context_precision']")
        print(f"Extracted scores: {scores4}")

        if scores4.get('context_precision') == 0.91:
            print("✅ SUCCESS: Alternative field name fallback works")
        else:
            print("❌ FAIL: Alternative field name fallback failed")

        print()

        # Test 5: Unknown metric (should use default)
        print("Test 5: Unknown metric handling")
        print("-" * 50)

        class MockResult5:
            def to_pandas(self):
                return pd.DataFrame([{
                    'unknown_field': 0.95,
                    'user_input': 'Test question'
                }])

        mock_result5 = MockResult5()
        scores5 = RagasEvaluator.extract_scores(
            result=mock_result5,
            requested_metrics=['nonexistent_metric']
        )

        print(f"Requested: ['nonexistent_metric']")
        print(f"Extracted scores: {scores5}")

        if scores5.get('nonexistent_metric') == 0.5:
            print("✅ SUCCESS: Unknown metric gets default score")
        else:
            print("❌ FAIL: Unknown metric handling incorrect")

    except Exception as e:
        print(f"❌ Test failed with exception: {e}")
        import traceback
        traceback.print_exc()

def test_backward_compatibility():
    """Test that existing function-based metrics still work."""

    print("\n=== Testing Backward Compatibility ===")

    try:
        from src.evaluator.oss_providers.ragas.ragas_evaluator import RagasEvaluator

        # Test the mappings are correct
        mappings = RagasEvaluator.METRIC_MAPPINGS

        expected_mappings = {
            'relevance': 'answer_relevancy',
            'correctness': 'answer_correctness',
            'similarity': 'answer_similarity',
            'context_precision': 'llm_context_precision_without_reference'  # Updated
        }

        print("Checking metric mappings:")
        for metric, expected_field in expected_mappings.items():
            actual_field = mappings.get(metric)
            if actual_field == expected_field:
                print(f"✅ {metric} -> {actual_field}")
            else:
                print(f"❌ {metric} -> {actual_field} (expected: {expected_field})")

    except Exception as e:
        print(f"❌ Backward compatibility test failed: {e}")

if __name__ == "__main__":
    test_score_extraction()
    test_backward_compatibility()