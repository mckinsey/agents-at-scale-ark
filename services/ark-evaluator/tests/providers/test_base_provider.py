import pytest
import logging
from typing import Optional
from unittest.mock import Mock

from src.evaluator.providers.base import EvaluationProvider
from src.evaluator.types import (
    UnifiedEvaluationRequest, EvaluationResponse, ModelRef, GoldenExample
)

logger = logging.getLogger(__name__)


class MockEvaluationProvider(EvaluationProvider):
    """Mock implementation for testing abstract base class"""
    
    async def evaluate(self, request: UnifiedEvaluationRequest) -> EvaluationResponse:
        return EvaluationResponse(
            score="0.8",
            passed=True,
            metadata={"message": "Mock evaluation completed"}
        )
    
    def get_evaluation_type(self) -> str:
        return "mock"


class TestEvaluationProvider:
    """Test suite for base EvaluationProvider abstract class"""
    
    def setup_method(self):
        """Set up test fixtures"""
        self.provider = MockEvaluationProvider()
        
    def test_initialization(self):
        """Test provider initialization"""
        assert self.provider.shared_session is None
        
        # Test with shared session
        mock_session = Mock()
        provider_with_session = MockEvaluationProvider(shared_session=mock_session)
        assert provider_with_session.shared_session is mock_session
    
    def test_get_evaluation_type(self):
        """Test evaluation type method"""
        assert self.provider.get_evaluation_type() == "mock"
    
    def test_extract_model_ref_with_valid_params(self):
        """Test model reference extraction with valid parameters"""
        parameters = {
            "model.name": "gpt-4",
            "model.namespace": "default"
        }
        
        model_ref = self.provider._extract_model_ref(parameters)
        assert model_ref is not None
        assert model_ref.name == "gpt-4"
        assert model_ref.namespace == "default"
    
    def test_extract_model_ref_with_default_name(self):
        """Test model reference extraction defaults to 'default' name"""
        parameters = {"model.namespace": "custom"}
        
        model_ref = self.provider._extract_model_ref(parameters)
        assert model_ref is not None
        assert model_ref.name == "default"
        assert model_ref.namespace == "custom"
    
    def test_extract_model_ref_with_no_params(self):
        """Test model reference extraction with no parameters"""
        model_ref = self.provider._extract_model_ref(None)
        assert model_ref is None
        
        model_ref = self.provider._extract_model_ref({})
        assert model_ref is None
    
    def test_extract_golden_examples_valid_json(self):
        """Test golden examples extraction with valid JSON"""
        golden_data = [
            {
                "input": "What is the capital of France?",
                "expectedOutput": "Paris",
                "metadata": {"category": "geography"},
                "expectedMinScore": "0.9",
                "difficulty": "easy",
                "category": "geography"
            },
            {
                "input": "Explain quantum computing",
                "expectedOutput": "Quantum computing uses quantum mechanics...",
                "metadata": {"category": "technology"}
            }
        ]
        
        import json
        parameters = {
            "golden-examples": json.dumps(golden_data)
        }
        
        examples = self.provider._extract_golden_examples(parameters)
        assert examples is not None
        assert len(examples) == 2
        
        # Test first example
        assert examples[0].input == "What is the capital of France?"
        assert examples[0].expectedOutput == "Paris"
        assert examples[0].metadata == {"category": "geography"}
        assert examples[0].expectedMinScore == "0.9"
        assert examples[0].difficulty == "easy"
        assert examples[0].category == "geography"
        
        # Test second example
        assert examples[1].input == "Explain quantum computing"
        assert examples[1].expectedOutput == "Quantum computing uses quantum mechanics..."
        assert examples[1].metadata == {"category": "technology"}
        assert examples[1].expectedMinScore is None
        assert examples[1].difficulty is None
        assert examples[1].category is None
    
    def test_extract_golden_examples_no_params(self):
        """Test golden examples extraction with no parameters"""
        examples = self.provider._extract_golden_examples(None)
        assert examples is None
        
        examples = self.provider._extract_golden_examples({})
        assert examples is None
    
    def test_extract_golden_examples_invalid_json(self):
        """Test golden examples extraction with invalid JSON"""
        parameters = {
            "golden-examples": "invalid json content"
        }
        
        examples = self.provider._extract_golden_examples(parameters)
        assert examples is None
    
    def test_extract_golden_examples_empty_array(self):
        """Test golden examples extraction with empty array"""
        parameters = {
            "golden-examples": "[]"
        }
        
        examples = self.provider._extract_golden_examples(parameters)
        assert examples is not None
        assert len(examples) == 0
    
    @pytest.mark.asyncio
    async def test_evaluate_method_called(self):
        """Test that the evaluate method can be called"""
        mock_request = Mock(spec=UnifiedEvaluationRequest)
        result = await self.provider.evaluate(mock_request)
        
        assert isinstance(result, EvaluationResponse)
        assert result.score == "0.8"
        assert result.passed is True
        assert result.metadata["message"] == "Mock evaluation completed"