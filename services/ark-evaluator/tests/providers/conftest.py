"""
Test configuration and fixtures for evaluation provider tests.
"""

import pytest
import logging
from unittest.mock import Mock, AsyncMock
from typing import Dict, Any

from src.evaluator.types import (
    UnifiedEvaluationRequest, EvaluationResponse, ModelRef, 
    EvaluationParameters, GoldenExample, QueryTarget, Response
)

# Configure logging for tests
logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)


@pytest.fixture
def mock_session():
    """Provide a mock HTTP session for testing"""
    return Mock()


@pytest.fixture
def sample_model_ref():
    """Provide a sample ModelRef for testing"""
    return ModelRef(name="gpt-4", namespace="default")


@pytest.fixture
def sample_evaluation_parameters():
    """Provide sample EvaluationParameters for testing"""
    return EvaluationParameters(
        scope="accuracy,relevance",
        min_score=0.7,
        temperature=0.1,
        max_tokens=1000
    )


@pytest.fixture
def sample_golden_examples():
    """Provide sample golden examples for testing"""
    return [
        GoldenExample(
            input="What is the capital of France?",
            expectedOutput="Paris",
            metadata={"category": "geography", "difficulty": "easy"},
            expectedMinScore=0.9,
            difficulty="easy",
            category="geography"
        ),
        GoldenExample(
            input="Explain quantum computing",
            expectedOutput="Quantum computing uses quantum mechanical phenomena...",
            metadata={"category": "technology", "difficulty": "hard"},
            expectedMinScore=0.8,
            difficulty="hard", 
            category="technology"
        )
    ]


@pytest.fixture
def sample_direct_evaluation_request(sample_model_ref):
    """Provide a sample direct evaluation request"""
    request = Mock(spec=UnifiedEvaluationRequest)
    request.evaluatorName = "test-evaluator"
    request.config = Mock()
    request.config.input = "What is artificial intelligence?"
    request.config.output = "Artificial intelligence is a field of computer science..."
    request.parameters = {
        "model.name": sample_model_ref.name,
        "model.namespace": sample_model_ref.namespace,
        "scope": "accuracy,relevance",
        "min-score": "0.8"
    }
    return request


@pytest.fixture
def sample_query_evaluation_request():
    """Provide a sample query evaluation request"""
    request = Mock(spec=UnifiedEvaluationRequest)
    request.evaluatorName = "test-evaluator"
    request.config = Mock()
    request.config.queryRef = Mock()
    request.config.queryRef.name = "test-query"
    request.config.queryRef.namespace = "default"
    request.config.queryRef.responseTarget = "agent:weather-agent"
    request.parameters = {
        "model.name": "gpt-4",
        "model.namespace": "default"
    }
    return request


@pytest.fixture
def sample_baseline_evaluation_request(sample_golden_examples):
    """Provide a sample baseline evaluation request"""
    import json
    
    request = Mock(spec=UnifiedEvaluationRequest)
    request.evaluatorName = "test-evaluator"
    request.parameters = {
        "model.name": "gpt-4",
        "model.namespace": "default",
        "golden-examples": json.dumps([
            {
                "input": example.input,
                "expectedOutput": example.expectedOutput,
                "metadata": example.metadata or {},
                "expectedMinScore": example.expectedMinScore,
                "difficulty": example.difficulty,
                "category": example.category
            }
            for example in sample_golden_examples
        ])
    }
    return request


@pytest.fixture
def sample_event_evaluation_request():
    """Provide a sample event evaluation request"""
    request = Mock(spec=UnifiedEvaluationRequest)
    request.evaluatorName = "test-evaluator"
    request.config = Mock()
    request.config.rules = [
        {
            "name": "tool_usage",
            "expression": "tool.called('web_search')",
            "description": "Verify tool was called"
        },
        {
            "name": "agent_response",
            "expression": "agent.responded()",
            "description": "Verify agent provided response"
        }
    ]
    request.parameters = {
        "query.name": "test-query",
        "query.namespace": "default",
        "sessionId": "session-123"
    }
    return request


@pytest.fixture
def sample_batch_evaluation_request():
    """Provide a sample batch evaluation request"""
    request = Mock(spec=UnifiedEvaluationRequest)
    request.evaluator_name = "test-evaluator"
    request.config = Mock()
    request.config.evaluations = [
        {"name": "eval-1", "namespace": "default"},
        {"name": "eval-2", "namespace": "default"}
    ]
    request.parameters = {}
    return request


@pytest.fixture
def sample_evaluation_response():
    """Provide a sample evaluation response"""
    return EvaluationResponse(
        score="0.85",
        passed=True,
        metadata={"message": "Evaluation completed successfully", "tokens_used": "150", "evaluation_time": "2.5s"}
    )


@pytest.fixture
def sample_query_resource():
    """Provide a sample Kubernetes Query resource"""
    return {
        "metadata": {
            "name": "test-query",
            "namespace": "default"
        },
        "spec": {
            "input": "What is the weather like today?"
        },
        "status": {
            "phase": "done",
            "responses": [
                {
                    "target": {"name": "weather-agent", "type": "agent"},
                    "content": "Today is sunny with a temperature of 72°F."
                },
                {
                    "target": {"name": "backup-agent", "type": "agent"}, 
                    "content": "Weather information: Clear skies, 72 degrees."
                }
            ]
        }
    }


@pytest.fixture
def mock_llm_evaluator():
    """Provide a mock LLM evaluator"""
    evaluator = AsyncMock()
    evaluator.evaluate.return_value = EvaluationResponse(
        score=0.8,
        passed=True,
        message="Mock evaluation completed"
    )
    return evaluator


@pytest.fixture
def mock_kubernetes_client():
    """Provide a mock Kubernetes client"""
    client = Mock()
    custom_api = Mock()
    client.CustomObjectsApi.return_value = custom_api
    return client, custom_api


@pytest.fixture
def mock_model_resolver():
    """Provide a mock model resolver"""
    resolver = Mock()
    resolver.resolve_model.return_value = {
        "name": "gpt-4",
        "type": "openai",
        "config": {
            "api_key": "test-key",
            "model": "gpt-4"
        }
    }
    return resolver


@pytest.fixture
def mock_llm_client():
    """Provide a mock LLM client"""
    client = AsyncMock()
    client.generate_response.return_value = "Mock LLM response"
    return client


class TestDataBuilder:
    """Builder class for creating test data objects"""
    
    @staticmethod
    def build_evaluation_request(
        evaluator_name: str = "test-evaluator",
        config: Dict[str, Any] = None,
        parameters: Dict[str, Any] = None
    ) -> Mock:
        """Build a mock evaluation request with specified parameters"""
        request = Mock(spec=UnifiedEvaluationRequest)
        request.evaluatorName = evaluator_name
        request.config = Mock() if config is None else Mock(**config)
        request.parameters = parameters or {}
        return request
    
    @staticmethod
    def build_evaluation_response(
        score: float = 0.8,
        passed: bool = True,
        message: str = "Test evaluation completed",
        reasoning: str = "Test reasoning",
        metadata: Dict[str, Any] = None
    ) -> EvaluationResponse:
        """Build an evaluation response with specified parameters"""
        return EvaluationResponse(
            score=str(score),
            passed=passed,
            metadata={
                **(metadata or {}),
                "message": message
            }
        )
    
    @staticmethod
    def build_query_target(name: str = "test-agent", target_type: str = "agent") -> QueryTarget:
        """Build a query target with specified parameters"""
        return QueryTarget(type=target_type, name=name)
    
    @staticmethod
    def build_response(
        target_name: str = "test-agent",
        target_type: str = "agent", 
        content: str = "Test response content"
    ) -> Response:
        """Build a response object with specified parameters"""
        return Response(
            target=TestDataBuilder.build_query_target(target_name, target_type),
            content=content
        )


@pytest.fixture
def test_data_builder():
    """Provide the test data builder"""
    return TestDataBuilder


# Markers are defined when used with @pytest.mark.* decorators
# No need to explicitly define them here