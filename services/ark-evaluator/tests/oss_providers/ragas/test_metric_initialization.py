#!/usr/bin/env python3

"""
Test script to verify that both function-type and class-type RAGAS metrics
can be initialized correctly with the enhanced logic.
"""

import sys
from pathlib import Path
import logging

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

# Configure debug logging to see the initialization attempts
logging.basicConfig(level=logging.DEBUG)

def test_metric_initialization():
    """Test that different metric types can be initialized properly."""

    print("=== Testing RAGAS Metric Initialization ===")
    print("Testing both function-type (relevance) and class-type (context_precision) metrics")
    print()

    try:
        from evaluator.oss_providers.ragas_evaluator import RagasEvaluator

        # Test function-type metric (relevance -> answer_relevancy)
        print("Test 1: Function-type metric (relevance)")
        print("-" * 50)

        try:
            # Create a mock LLM for testing
            class MockLLM:
                pass

            mock_llm = MockLLM()

            function_metrics = RagasEvaluator.initialize_ragas_metrics(
                metrics=['relevance'],
                llm=mock_llm,
                embeddings=None
            )

            if function_metrics:
                print(f"✅ SUCCESS: Function-type metric 'relevance' initialized successfully")
                print(f"   Number of metrics: {len(function_metrics)}")
                print(f"   Metric type: {type(function_metrics[0])}")
            else:
                print("❌ FAIL: Function-type metric 'relevance' failed to initialize")

        except Exception as e:
            print(f"❌ FAIL: Function-type metric 'relevance' failed with exception: {e}")
            import traceback
            traceback.print_exc()

        print()

        # Test class-type metric (context_precision -> LLMContextPrecisionWithoutReference)
        print("Test 2: Class-type metric (context_precision)")
        print("-" * 50)

        try:
            class_metrics = RagasEvaluator.initialize_ragas_metrics(
                metrics=['context_precision'],
                llm=mock_llm,
                embeddings=None
            )

            if class_metrics:
                print(f"✅ SUCCESS: Class-type metric 'context_precision' initialized successfully")
                print(f"   Number of metrics: {len(class_metrics)}")
                print(f"   Metric type: {type(class_metrics[0])}")
            else:
                print("❌ FAIL: Class-type metric 'context_precision' failed to initialize")

        except Exception as e:
            print(f"❌ FAIL: Class-type metric 'context_precision' failed with exception: {e}")
            import traceback
            traceback.print_exc()

        print()

        # Test mixed metrics
        print("Test 3: Mixed metric types (relevance + context_precision)")
        print("-" * 50)

        try:
            mixed_metrics = RagasEvaluator.initialize_ragas_metrics(
                metrics=['relevance', 'context_precision'],
                llm=mock_llm,
                embeddings=None
            )

            if mixed_metrics and len(mixed_metrics) == 2:
                print(f"✅ SUCCESS: Mixed metrics initialized successfully")
                print(f"   Number of metrics: {len(mixed_metrics)}")
                for i, metric in enumerate(mixed_metrics):
                    print(f"   Metric {i+1} type: {type(metric)}")
            elif mixed_metrics and len(mixed_metrics) == 1:
                print(f"⚠️  PARTIAL: Only one metric initialized out of two")
                print(f"   Number of metrics: {len(mixed_metrics)}")
                print(f"   Metric type: {type(mixed_metrics[0])}")
            else:
                print("❌ FAIL: Mixed metrics failed to initialize")

        except Exception as e:
            print(f"❌ FAIL: Mixed metrics failed with exception: {e}")
            import traceback
            traceback.print_exc()

    except ImportError as e:
        print(f"❌ FAIL: Could not import RAGAS components: {e}")
        print("This might be expected in environments without RAGAS dependencies")

def test_backwards_compatibility():
    """Test that existing metrics still work after the changes."""

    print("\n=== Testing Backwards Compatibility ===")

    # Test all the standard metrics that were working before
    standard_metrics = ['relevance', 'correctness', 'similarity']

    try:
        from evaluator.oss_providers.ragas_evaluator import RagasEvaluator

        class MockLLM:
            pass

        mock_llm = MockLLM()

        for metric in standard_metrics:
            print(f"Testing backwards compatibility for: {metric}")
            try:
                metrics = RagasEvaluator.initialize_ragas_metrics(
                    metrics=[metric],
                    llm=mock_llm,
                    embeddings=None
                )

                if metrics:
                    print(f"✅ {metric}: OK")
                else:
                    print(f"❌ {metric}: Failed to initialize")

            except Exception as e:
                print(f"❌ {metric}: Exception - {e}")

        print("\n=== Summary ===")
        print("If all standard metrics show ✅ OK, then backwards compatibility is maintained")

    except ImportError as e:
        print(f"❌ Could not test backwards compatibility: {e}")

if __name__ == "__main__":
    test_metric_initialization()
    test_backwards_compatibility()