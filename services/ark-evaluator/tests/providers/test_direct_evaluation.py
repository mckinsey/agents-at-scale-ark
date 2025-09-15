import pytest
import logging
from unittest.mock import Mock, AsyncMock, patch
from fastapi import HTTPException

from src.evaluator.providers.direct_evaluation import DirectEvaluationProvider
from src.evaluator.types import (
    UnifiedEvaluationRequest, EvaluationResponse, ModelRef, 
    EvaluationParameters, GoldenExample
)

logger = logging.getLogger(__name__)


class TestDirectEvaluationProvider:
    """Test suite for DirectEvaluationProvider"""
    
    def setup_method(self):
        """Set up test fixtures"""
        self.provider = DirectEvaluationProvider()
        self.mock_session = Mock()
        self.provider_with_session = DirectEvaluationProvider(shared_session=self.mock_session)
    
    def test_initialization(self):
        """Test provider initialization"""
        assert self.provider.get_evaluation_type() == "direct"
        assert self.provider.shared_session is None
        assert self.provider_with_session.shared_session is self.mock_session
    
    def test_get_evaluation_type(self):
        """Test evaluation type identification"""
        assert self.provider.get_evaluation_type() == "direct"
    
    @pytest.mark.asyncio
    async def test_evaluate_missing_config(self):
        """Test evaluation fails with missing config"""
        request = Mock(spec=UnifiedEvaluationRequest)
        request.config = None
        request.evaluatorName = "test-evaluator"
        
        with pytest.raises(HTTPException) as exc_info:
            await self.provider.evaluate(request)
        
        assert exc_info.value.status_code == 422
        assert "Direct evaluation requires input in config" in str(exc_info.value.detail)
    
    @pytest.mark.asyncio
    async def test_evaluate_missing_input(self):
        """Test evaluation fails with missing input in config"""
        request = Mock(spec=UnifiedEvaluationRequest)
        request.config = Mock()
        del request.config.input  # Simulate missing input attribute
        request.evaluatorName = "test-evaluator"
        
        with pytest.raises(HTTPException) as exc_info:
            await self.provider.evaluate(request)
        
        assert exc_info.value.status_code == 422
        assert "Direct evaluation requires input in config" in str(exc_info.value.detail)
    
    @pytest.mark.asyncio
    async def test_evaluate_missing_model_ref(self):
        """Test evaluation fails with missing model reference"""
        request = Mock(spec=UnifiedEvaluationRequest)
        request.config = Mock()
        request.config.input = "Test input"
        request.config.output = "Test output"
        request.evaluatorName = "test-evaluator"
        request.parameters = {}  # No model parameters
        
        with pytest.raises(HTTPException) as exc_info:
            await self.provider.evaluate(request)
        
        assert exc_info.value.status_code == 422
        assert "Direct evaluation requires model configuration in parameters" in str(exc_info.value.detail)
    
    @pytest.mark.asyncio
    @patch('src.evaluator.providers.direct_evaluation.LLMEvaluator')
    async def test_evaluate_successful_basic(self, mock_evaluator_class):
        """Test successful direct evaluation with basic parameters"""
        # Setup mock evaluator
        mock_evaluator_instance = AsyncMock()
        mock_evaluator_class.return_value = mock_evaluator_instance
        
        expected_response = EvaluationResponse(
            score="0.85",
            passed=True,
            metadata={"message": "Evaluation completed successfully"}
        )
        mock_evaluator_instance.evaluate.return_value = expected_response
        
        # Setup request
        request = Mock(spec=UnifiedEvaluationRequest)
        request.config = Mock()
        request.config.input = "What is the capital of France?"
        request.config.output = "Paris is the capital of France."
        request.evaluatorName = "test-evaluator"
        request.parameters = {
            "model.name": "gpt-4",
            "model.namespace": "default"
        }
        
        # Execute evaluation
        result = await self.provider.evaluate(request)
        
        # Verify results
        assert result == expected_response
        mock_evaluator_class.assert_called_once_with(session=None)
        mock_evaluator_instance.evaluate.assert_called_once()
        
        # Verify the call arguments
        call_args = mock_evaluator_instance.evaluate.call_args
        eval_request = call_args[0][0]
        eval_params = call_args[0][1]
        
        assert eval_request.queryId == "direct-evaluation"
        assert eval_request.input == "What is the capital of France?"
        assert eval_request.responses[0].content == "Paris is the capital of France."
        assert eval_request.responses[0].target.type == "system"
        assert eval_request.responses[0].target.name == "direct-output"
        assert eval_request.modelRef.name == "gpt-4"
        assert eval_request.modelRef.namespace == "default"
    
    @pytest.mark.asyncio
    @patch('src.evaluator.providers.direct_evaluation.LLMEvaluator')
    async def test_evaluate_with_golden_examples(self, mock_evaluator_class):
        """Test direct evaluation with golden examples"""
        # Setup mock evaluator
        mock_evaluator_instance = AsyncMock()
        mock_evaluator_class.return_value = mock_evaluator_instance
        
        expected_response = EvaluationResponse(
            score="0.92",
            passed=True,
            metadata={"message": "Evaluation with golden examples completed"}
        )
        mock_evaluator_instance.evaluate.return_value = expected_response
        
        # Setup request with golden examples
        import json
        golden_data = [
            {
                "input": "Test input",
                "expectedOutput": "Test expected output",
                "metadata": {"category": "test"}
            }
        ]
        
        request = Mock(spec=UnifiedEvaluationRequest)
        request.config = Mock()
        request.config.input = "What is AI?"
        request.config.output = "Artificial Intelligence is..."
        request.evaluatorName = "test-evaluator"
        request.parameters = {
            "model.name": "gpt-4",
            "model.namespace": "default",
            "golden-examples": json.dumps(golden_data)
        }
        
        # Execute evaluation
        result = await self.provider.evaluate(request)
        
        # Verify results
        assert result == expected_response
        mock_evaluator_instance.evaluate.assert_called_once()
        
        # Verify golden examples were passed
        call_args = mock_evaluator_instance.evaluate.call_args
        golden_examples = call_args[1]['golden_examples']
        assert golden_examples is not None
        assert len(golden_examples) == 1
        assert golden_examples[0].input == "Test input"
    
    @pytest.mark.asyncio
    @patch('src.evaluator.providers.direct_evaluation.LLMEvaluator')
    async def test_evaluate_with_shared_session(self, mock_evaluator_class):
        """Test direct evaluation uses shared session when provided"""
        # Setup mock evaluator
        mock_evaluator_instance = AsyncMock()
        mock_evaluator_class.return_value = mock_evaluator_instance
        
        expected_response = EvaluationResponse(score="0.8", passed=True, metadata={"message": "Success"})
        mock_evaluator_instance.evaluate.return_value = expected_response
        
        # Setup request
        request = Mock(spec=UnifiedEvaluationRequest)
        request.config = Mock()
        request.config.input = "Test input"
        request.config.output = "Test output"
        request.evaluatorName = "test-evaluator"
        request.parameters = {"model.name": "gpt-4"}
        
        # Execute with provider that has shared session
        result = await self.provider_with_session.evaluate(request)
        
        # Verify shared session was passed to evaluator
        mock_evaluator_class.assert_called_once_with(session=self.mock_session)
        assert result == expected_response
    
    @pytest.mark.asyncio
    @patch('src.evaluator.providers.direct_evaluation.LLMEvaluator')
    async def test_evaluate_with_empty_output(self, mock_evaluator_class):
        """Test direct evaluation handles empty output"""
        # Setup mock evaluator
        mock_evaluator_instance = AsyncMock()
        mock_evaluator_class.return_value = mock_evaluator_instance
        
        expected_response = EvaluationResponse(score="0.0", passed=False, metadata={"message": "No output provided"})
        mock_evaluator_instance.evaluate.return_value = expected_response
        
        # Setup request with no output
        request = Mock(spec=UnifiedEvaluationRequest)
        request.config = Mock()
        request.config.input = "Test input"
        request.config.output = None
        request.evaluatorName = "test-evaluator"
        request.parameters = {"model.name": "gpt-4"}
        
        # Execute evaluation
        result = await self.provider.evaluate(request)
        
        # Verify empty output was handled
        call_args = mock_evaluator_instance.evaluate.call_args
        eval_request = call_args[0][0]
        assert eval_request.responses[0].content == ""
        assert result == expected_response
    
    @pytest.mark.asyncio
    @patch('src.evaluator.providers.direct_evaluation.LLMEvaluator')
    async def test_evaluate_with_custom_parameters(self, mock_evaluator_class):
        """Test direct evaluation with custom evaluation parameters"""
        # Setup mock evaluator
        mock_evaluator_instance = AsyncMock()
        mock_evaluator_class.return_value = mock_evaluator_instance
        
        expected_response = EvaluationResponse(score="0.75", passed=True, metadata={"message": "Custom params used"})
        mock_evaluator_instance.evaluate.return_value = expected_response
        
        # Setup request with custom parameters
        request = Mock(spec=UnifiedEvaluationRequest)
        request.config = Mock()
        request.config.input = "Test input"
        request.config.output = "Test output"
        request.evaluatorName = "test-evaluator"
        request.parameters = {
            "model.name": "gpt-4",
            "scope": "accuracy,relevance",
            "min-score": "0.8",
            "temperature": "0.2",
            "max-tokens": "100"
        }
        
        # Execute evaluation
        result = await self.provider.evaluate(request)
        
        # Verify custom parameters were processed
        call_args = mock_evaluator_instance.evaluate.call_args
        eval_params = call_args[0][1]
        
        assert isinstance(eval_params, EvaluationParameters)
        assert result == expected_response