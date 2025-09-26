#!/usr/bin/env python3

"""
Test script to verify context recall metric field mapping and dataset preparation.
"""

import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from src.evaluator.oss_providers.ragas.ragas_metrics import MetricRegistry
from src.evaluator.oss_providers.ragas.ragas_evaluator import RagasEvaluator

def test_context_recall_dataset_preparation():
    """Test that context recall metric dataset preparation works correctly."""

    print("=== Testing Context Recall Dataset Preparation ===")

    # Test dataset preparation with context
    dataset = RagasEvaluator.prepare_dataset(
        input_text="Where is the Eiffel Tower located?",
        output_text="The Eiffel Tower is located in Paris.",
        context="Paris is the capital of France.",
        ground_truth=None,  # Not needed for context recall
        metrics=['context_recall']
    )

    print("Dataset prepared for context_recall metric:")
    dataset_dict = dataset.to_pandas().iloc[0].to_dict()
    print(f"Dataset fields: {dataset_dict}")
    print()

    # Check expected fields
    expected_fields = ['user_input', 'response', 'reference', 'retrieved_contexts']
    actual_fields = list(dataset_dict.keys())

    print("=== Field Validation ===")
    for field in expected_fields:
        if field in actual_fields:
            print(f"✅ {field}: {dataset_dict[field]}")
        else:
            print(f"❌ Missing field: {field}")

    # Verify response and reference have the same content
    if dataset_dict.get('response') == dataset_dict.get('reference'):
        print("✅ SUCCESS: response and reference have the same content")
    else:
        print("❌ FAIL: response and reference should have the same content")
        print(f"   response: {dataset_dict.get('response')}")
        print(f"   reference: {dataset_dict.get('reference')}")

    # Verify retrieved_contexts is properly formatted
    if 'retrieved_contexts' in dataset_dict:
        contexts = dataset_dict['retrieved_contexts']
        # Can be list or numpy array from pandas conversion
        if hasattr(contexts, '__len__') and len(contexts) > 0:
            print(f"✅ SUCCESS: retrieved_contexts is properly formatted: {contexts}")
        else:
            print(f"❌ FAIL: retrieved_contexts should be non-empty, got: {contexts}")
    else:
        print("❌ FAIL: retrieved_contexts field missing")

    return dataset_dict

def test_context_recall_validation():
    """Test that context recall metric validation works correctly."""

    print("\n=== Testing Context Recall Validation ===")

    # Test with complete dataset
    complete_dataset = {
        'user_input': 'Where is the Eiffel Tower located?',
        'response': 'The Eiffel Tower is located in Paris.',
        'reference': 'The Eiffel Tower is located in Paris.',
        'retrieved_contexts': ['Paris is the capital of France.']
    }

    print("Test 1: Complete dataset")
    print(f"Dataset: {complete_dataset}")

    valid_metrics, invalid_metrics, validation_errors = RagasEvaluator.validate_and_filter_metrics(
        metrics=['context_recall'],
        dataset_entry=complete_dataset
    )

    print(f"Valid metrics: {valid_metrics}")
    print(f"Invalid metrics: {invalid_metrics}")
    print(f"Validation errors: {validation_errors}")

    if 'context_recall' in valid_metrics:
        print("✅ SUCCESS: Context recall metric correctly identified as valid")
    else:
        print("❌ FAIL: Context recall metric should be valid with complete dataset")
    print()

    # Test with missing reference
    incomplete_dataset = {
        'user_input': 'Where is the Eiffel Tower located?',
        'response': 'The Eiffel Tower is located in Paris.',
        # Missing 'reference' field
        'retrieved_contexts': ['Paris is the capital of France.']
    }

    print("Test 2: Dataset missing reference field")
    print(f"Dataset: {incomplete_dataset}")

    valid_metrics, invalid_metrics, validation_errors = RagasEvaluator.validate_and_filter_metrics(
        metrics=['context_recall'],
        dataset_entry=incomplete_dataset
    )

    print(f"Valid metrics: {valid_metrics}")
    print(f"Invalid metrics: {invalid_metrics}")
    print(f"Validation errors: {validation_errors}")

    if 'context_recall' in invalid_metrics:
        print("✅ SUCCESS: Context recall metric correctly identified as invalid without reference")
    else:
        print("❌ FAIL: Context recall metric should be invalid without reference field")

def test_context_recall_metric_info():
    """Test that context recall metric info is correct."""

    print("\n=== Testing Context Recall Metric Info ===")

    metric = MetricRegistry.get_metric('context_recall')
    if not metric:
        print("❌ FAIL: Context recall metric not found in registry")
        return

    print(f"Metric name: {metric.get_name()}")
    print(f"Display name: {metric.get_display_name()}")
    print(f"Description: {metric.get_description()}")
    print(f"Field mapping: {metric.get_ragas_field_mapping()}")

    required_fields = metric.get_required_fields()
    print(f"Required fields: {[f.name for f in required_fields]}")

    # Test override method
    dataset_entry = metric.prepare_dataset_entry(
        input_text="Where is the Eiffel Tower located?",
        output_text="The Eiffel Tower is located in Paris.",
        context="Paris is the capital of France."
    )
    print(f"Dataset entry from override method: {dataset_entry}")

    # Verify the override creates both response and reference
    if dataset_entry.get('response') == dataset_entry.get('reference'):
        print("✅ SUCCESS: Override method correctly sets response and reference to same value")
    else:
        print("❌ FAIL: Override method should set response and reference to same value")

if __name__ == "__main__":
    test_context_recall_dataset_preparation()
    test_context_recall_validation()
    test_context_recall_metric_info()