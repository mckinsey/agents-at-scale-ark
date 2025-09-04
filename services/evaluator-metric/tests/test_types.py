import pytest
import logging
from typing import Dict, Any
from unittest.mock import patch

from src.evaluator_metric.types import EvaluationParameters, EvaluationScope

# Configure logging for tests
logging.basicConfig(level=logging.WARNING)


class TestEvaluationParameters:
    """Test suite for EvaluationParameters class"""

    def test_default_initialization(self):
        """Test that EvaluationParameters can be initialized with defaults"""
        params = EvaluationParameters()
        assert params.scope == "all"
        assert params.min_score == 0.7
        assert params.max_tokens is None
        assert params.temperature == 0.0
        assert params.evaluation_criteria is None
        assert params.custom_metadata is None

    def test_valid_single_scope(self):
        """Test valid single scope values"""
        valid_scopes = ["relevance", "accuracy", "conciseness", "completeness", "clarity", "usefulness", "all"]
        
        for scope in valid_scopes:
            params = EvaluationParameters(scope=scope)
            assert params.scope == scope

    def test_valid_multiple_scopes(self):
        """Test valid multiple scope values"""
        test_cases = [
            ("relevance,accuracy", "relevance,accuracy"),
            ("clarity,usefulness,completeness", "clarity,usefulness,completeness"),
            ("relevance, accuracy, clarity", "relevance,accuracy,clarity"),  # Handles spaces
            ("relevance,  accuracy  ,  clarity", "relevance,accuracy,clarity"),  # Handles extra spaces
        ]
        
        for input_scope, expected_scope in test_cases:
            params = EvaluationParameters(scope=input_scope)
            assert params.scope == expected_scope

    def test_case_insensitive_scope(self):
        """Test that scope values are case insensitive"""
        test_cases = [
            ("RELEVANCE", "relevance"),
            ("Accuracy", "accuracy"),
            ("CLARITY,Usefulness", "clarity,usefulness"),
            ("ALL", "all"),
        ]
        
        for input_scope, expected_scope in test_cases:
            params = EvaluationParameters(scope=input_scope)
            assert params.scope == expected_scope

    def test_invalid_scope_values(self):
        """Test that invalid scope values are handled gracefully"""
        with patch('src.evaluator_metric.types.logger') as mock_logger:
            # Test single invalid value
            params = EvaluationParameters(scope="invalid_scope")
            assert params.scope == "all"
            mock_logger.warning.assert_called()
            
            # Test mixed valid/invalid values
            params = EvaluationParameters(scope="relevance,invalid,clarity")
            assert params.scope == "relevance,clarity"
            
            # Test all invalid values
            params = EvaluationParameters(scope="invalid1,invalid2")
            assert params.scope == "all"

    def test_empty_scope_handling(self):
        """Test handling of empty scope values"""
        with patch('src.evaluator_metric.types.logger') as mock_logger:
            # Empty string
            params = EvaluationParameters(scope="")
            assert params.scope == "all"
            
            # Whitespace only
            params = EvaluationParameters(scope="   ")
            assert params.scope == "all"
            
            # None value
            params = EvaluationParameters(scope=None)
            assert params.scope == "all"

    def test_get_scope_list_method(self):
        """Test the get_scope_list method"""
        # Single scope
        params = EvaluationParameters(scope="relevance")
        assert params.get_scope_list() == ["relevance"]
        
        # Multiple scopes
        params = EvaluationParameters(scope="relevance,accuracy,clarity")
        assert params.get_scope_list() == ["relevance", "accuracy", "clarity"]
        
        # "all" scope returns all criteria except "all"
        params = EvaluationParameters(scope="all")
        expected_all = ["relevance", "accuracy", "conciseness", "completeness", "clarity", "usefulness"]
        assert set(params.get_scope_list()) == set(expected_all)

    def test_from_request_params_method(self):
        """Test the from_request_params class method"""
        # Valid parameters
        request_params = {
            "scope": "relevance,accuracy",
            "min_score": 0.8,
            "max_tokens": 1000,
            "temperature": 0.1
        }
        params = EvaluationParameters.from_request_params(request_params)
        assert params.scope == "relevance,accuracy"
        assert params.min_score == 0.8
        assert params.max_tokens == 1000
        assert params.temperature == 0.1

    def test_from_request_params_with_kebab_case(self):
        """Test parameter name normalization (kebab-case to snake_case)"""
        request_params = {
            "scope": "relevance",
            "min-score": 0.8,
            "max-tokens": 1000,
            "evaluation-criteria": ["accuracy", "clarity"]
        }
        params = EvaluationParameters.from_request_params(request_params)
        assert params.min_score == 0.8
        assert params.max_tokens == 1000
        assert params.evaluation_criteria == ["accuracy", "clarity"]

    def test_from_request_params_with_unknown_parameters(self):
        """Test that unknown parameters are stored in custom_metadata"""
        request_params = {
            "scope": "relevance",
            "unknown_param": "value",
            "another_unknown": 123
        }
        params = EvaluationParameters.from_request_params(request_params)
        assert params.scope == "relevance"
        assert params.custom_metadata == {
            "unknown_param": "value",
            "another_unknown": 123
        }

    def test_from_request_params_with_empty_dict(self):
        """Test handling of empty parameters dictionary"""
        with patch('src.evaluator_metric.types.logger') as mock_logger:
            params = EvaluationParameters.from_request_params({})
            assert params.scope == "all"
            assert params.min_score == 0.7
            mock_logger.warning.assert_called_with("No parameters provided, using defaults")

    def test_from_request_params_with_invalid_data(self):
        """Test handling of invalid parameter data"""
        with patch('src.evaluator_metric.types.logger') as mock_logger:
            # Invalid min_score (string instead of float)
            request_params = {"min_score": "invalid"}
            params = EvaluationParameters.from_request_params(request_params)
            assert params.min_score == 0.7  # Should default to 0.7
            mock_logger.warning.assert_called()

    def test_to_dict_method(self):
        """Test the to_dict method"""
        params = EvaluationParameters(
            scope="relevance,accuracy",
            min_score=0.8,
            max_tokens=1000,
            custom_metadata={"key": "value"}
        )
        
        result = params.to_dict()
        assert result["scope"] == "relevance,accuracy"
        assert result["min_score"] == 0.8
        assert result["max_tokens"] == 1000
        assert result["custom_metadata"] == {"key": "value"}
        assert "evaluation_criteria" not in result  # None values excluded

    def test_parameter_validation(self):
        """Test parameter validation constraints"""
        # Valid min_score range
        params = EvaluationParameters(min_score=0.5)
        assert params.min_score == 0.5
        
        # Invalid min_score (too low)
        with pytest.raises(ValueError):
            EvaluationParameters(min_score=-0.1)
        
        # Invalid min_score (too high)
        with pytest.raises(ValueError):
            EvaluationParameters(min_score=1.1)
        
        # Valid temperature range
        params = EvaluationParameters(temperature=1.5)
        assert params.temperature == 1.5
        
        # Invalid temperature (too high)
        with pytest.raises(ValueError):
            EvaluationParameters(temperature=2.5)
        
        # Valid max_tokens (positive integer)
        params = EvaluationParameters(max_tokens=1000)
        assert params.max_tokens == 1000
        
        # Invalid max_tokens (zero)
        with pytest.raises(ValueError):
            EvaluationParameters(max_tokens=0)
        
        # Invalid max_tokens (negative)
        with pytest.raises(ValueError):
            EvaluationParameters(max_tokens=-100)

    def test_edge_cases(self):
        """Test edge cases and boundary conditions"""
        # Maximum valid values
        params = EvaluationParameters(
            min_score=1.0,
            temperature=2.0,
            max_tokens=999999
        )
        assert params.min_score == 1.0
        assert params.temperature == 2.0
        assert params.max_tokens == 999999
        
        # Minimum valid values
        params = EvaluationParameters(
            min_score=0.0,
            temperature=0.0,
            max_tokens=1
        )
        assert params.min_score == 0.0
        assert params.temperature == 0.0
        assert params.max_tokens == 1

    def test_complex_scope_combinations(self):
        """Test complex scope combinations and edge cases"""
        # Mixed case with spaces and commas
        params = EvaluationParameters(scope="Relevance,  Accuracy , Clarity")
        assert params.scope == "relevance,accuracy,clarity"
        
        # Duplicate values (should be preserved as-is)
        params = EvaluationParameters(scope="relevance,relevance,accuracy")
        assert params.scope == "relevance,relevance,accuracy"
        
        # All valid values
        all_scopes = "relevance,accuracy,conciseness,completeness,clarity,usefulness"
        params = EvaluationParameters(scope=all_scopes)
        assert params.scope == all_scopes

    def test_logging_behavior(self):
        """Test that appropriate warnings are logged"""
        with patch('src.evaluator_metric.types.logger') as mock_logger:
            # Test invalid scope
            EvaluationParameters(scope="invalid")
            mock_logger.warning.assert_called()
            
            # Test empty scope
            EvaluationParameters(scope="")
            mock_logger.warning.assert_called()
            
            # Test mixed valid/invalid
            EvaluationParameters(scope="relevance,invalid,clarity")
            mock_logger.warning.assert_called()


class TestEvaluationScope:
    """Test suite for EvaluationScope enum"""

    def test_enum_values(self):
        """Test that enum has correct values"""
        assert EvaluationScope.RELEVANCE.value == "relevance"
        assert EvaluationScope.ACCURACY.value == "accuracy"
        assert EvaluationScope.CONCISENESS.value == "conciseness"
        assert EvaluationScope.COMPLETENESS.value == "completeness"
        assert EvaluationScope.CLARITY.value == "clarity"
        assert EvaluationScope.USEFULNESS.value == "usefulness"
        assert EvaluationScope.ALL.value == "all"

    def test_enum_validation(self):
        """Test enum validation"""
        # Valid values
        assert EvaluationScope("relevance") == EvaluationScope.RELEVANCE
        assert EvaluationScope("accuracy") == EvaluationScope.ACCURACY
        
        # Invalid values should raise ValueError
        with pytest.raises(ValueError):
            EvaluationScope("invalid")


# Fixtures for common test data
@pytest.fixture
def valid_scopes():
    """Fixture providing valid scope values"""
    return ["relevance", "accuracy", "conciseness", "completeness", "clarity", "usefulness", "all"]

@pytest.fixture
def sample_request_params():
    """Fixture providing sample request parameters"""
    return {
        "scope": "relevance,accuracy",
        "min-score": 0.8,
        "max-tokens": 1000,
        "temperature": 0.1,
        "evaluation-criteria": ["accuracy", "clarity"],
        "custom-metadata": {"user_id": "123"}
    }