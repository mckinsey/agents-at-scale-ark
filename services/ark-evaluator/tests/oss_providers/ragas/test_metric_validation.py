#!/usr/bin/env python3

"""
Test script to verify metric validation logic directly.
"""

import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from src.evaluator.oss_providers.ragas.ragas_metrics import MetricRegistry
from src.evaluator.oss_providers.ragas.ragas_evaluator import RagasEvaluator

def test_correctness_validation():
    """Test that correctness metric validation works correctly."""

    print("=== Testing Correctness Metric Validation ===")

    # Test with empty reference field
    dataset_entry_with_empty_ref = {
        'user_input': 'What is the capital of France?',
        'response': 'The capital of France is Paris.',
        'reference': ''  # Empty reference
    }

    print("Test 1: Dataset with empty reference field")
    print(f"Dataset entry: {dataset_entry_with_empty_ref}")

    valid_metrics, invalid_metrics, validation_errors = RagasEvaluator.validate_and_filter_metrics(
        metrics=['correctness'],
        dataset_entry=dataset_entry_with_empty_ref
    )

    print(f"Valid metrics: {valid_metrics}")
    print(f"Invalid metrics: {invalid_metrics}")
    print(f"Validation errors: {validation_errors}")

    if 'correctness' in invalid_metrics:
        print("✅ SUCCESS: Correctness metric correctly identified as invalid with empty reference")
    else:
        print("❌ FAIL: Correctness metric should be invalid with empty reference")
    print()

    # Test with missing reference field
    dataset_entry_without_ref = {
        'user_input': 'What is the capital of France?',
        'response': 'The capital of France is Paris.',
        # No reference field at all
    }

    print("Test 2: Dataset without reference field")
    print(f"Dataset entry: {dataset_entry_without_ref}")

    valid_metrics, invalid_metrics, validation_errors = RagasEvaluator.validate_and_filter_metrics(
        metrics=['correctness'],
        dataset_entry=dataset_entry_without_ref
    )

    print(f"Valid metrics: {valid_metrics}")
    print(f"Invalid metrics: {invalid_metrics}")
    print(f"Validation errors: {validation_errors}")

    if 'correctness' in invalid_metrics:
        print("✅ SUCCESS: Correctness metric correctly identified as invalid without reference field")
    else:
        print("❌ FAIL: Correctness metric should be invalid without reference field")
    print()

    # Test with valid reference field
    dataset_entry_with_valid_ref = {
        'user_input': 'What is the capital of France?',
        'response': 'The capital of France is Paris.',
        'reference': 'Paris is the capital and most populous city of France.'
    }

    print("Test 3: Dataset with valid reference field")
    print(f"Dataset entry: {dataset_entry_with_valid_ref}")

    valid_metrics, invalid_metrics, validation_errors = RagasEvaluator.validate_and_filter_metrics(
        metrics=['correctness'],
        dataset_entry=dataset_entry_with_valid_ref
    )

    print(f"Valid metrics: {valid_metrics}")
    print(f"Invalid metrics: {invalid_metrics}")
    print(f"Validation errors: {validation_errors}")

    if 'correctness' in valid_metrics:
        print("✅ SUCCESS: Correctness metric correctly identified as valid with proper reference")
    else:
        print("❌ FAIL: Correctness metric should be valid with proper reference")

def test_dataset_preparation():
    """Test that dataset preparation doesn't add empty defaults."""

    print("\n=== Testing Dataset Preparation ===")

    # Test preparation without ground_truth
    dataset = RagasEvaluator.prepare_dataset(
        input_text="What is the capital of France?",
        output_text="The capital of France is Paris.",
        context=None,
        ground_truth=None,
        metrics=['correctness']
    )

    print("Dataset prepared without ground_truth:")
    dataset_dict = dataset.to_pandas().iloc[0].to_dict()
    print(f"Dataset fields: {dataset_dict}")

    if 'reference' not in dataset_dict:
        print("✅ SUCCESS: No reference field added when no ground_truth provided")
    elif dataset_dict.get('reference') == '':
        print("❌ FAIL: Empty reference field was added as default")
    else:
        print(f"ℹ️  Reference field has value: {dataset_dict.get('reference')}")

if __name__ == "__main__":
    test_correctness_validation()
    test_dataset_preparation()