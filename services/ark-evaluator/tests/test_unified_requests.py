"""Test suite for unified request types"""

import pytest
from pydantic import ValidationError

from evaluator.types import (
    EvaluationRequest,
    GoldenExample,
    Model,
    Response,
    QueryTarget,
    UnifiedEvaluationRequest,
    EvaluationConfig,
    EvaluationType,
    DirectEvaluationConfig,
    QueryBasedEvaluationConfig,
    QueryRef
)


class TestEvaluationRequest:
    """Test the EvaluationRequest class"""
    
    def test_evaluation_request_creation(self):
        """Test basic EvaluationRequest creation"""
        response = Response(
            target=QueryTarget(type="agent", name="test-agent"),
            content="Response content"
        )
        
        request = EvaluationRequest(
            queryId="query-123",
            input="Test input",
            responses=[response],
            query={"metadata": {"name": "test-query"}}
        )
        assert request.queryId == "query-123"
        assert request.input == "Test input"
        assert len(request.responses) == 1
        assert request.query["metadata"]["name"] == "test-query"
    
    def test_evaluation_request_required_fields(self):
        """Test that all required fields are validated"""
        with pytest.raises(ValidationError):
            EvaluationRequest()  # Missing all required fields


class TestUnifiedEvaluationRequest:
    """Test the UnifiedEvaluationRequest class"""
    
    def test_direct_evaluation_request(self):
        """Test direct evaluation request"""
        config = EvaluationConfig(
            input="What is 2+2?",
            output="4"
        )
        
        request = UnifiedEvaluationRequest(
            type=EvaluationType.DIRECT,
            config=config,
            parameters={"scope": "accuracy"},
            evaluatorName="test-evaluator"
        )
        
        assert request.type == EvaluationType.DIRECT
        assert request.config.input == "What is 2+2?"
        assert request.config.output == "4"
        assert request.parameters["scope"] == "accuracy"
        assert request.evaluatorName == "test-evaluator"
    
    def test_query_evaluation_request(self):
        """Test query-based evaluation request"""
        query_ref = QueryRef(name="test-query", namespace="default")
        config = EvaluationConfig(queryRef=query_ref)
        
        request = UnifiedEvaluationRequest(
            type=EvaluationType.QUERY,
            config=config,
            evaluatorName="query-evaluator"
        )
        
        assert request.type == EvaluationType.QUERY
        assert request.config.queryRef.name == "test-query"
        assert request.config.queryRef.namespace == "default"
    
    def test_event_evaluation_request(self):
        """Test event-based evaluation request"""
        rules = [
            {
                "name": "tool_usage",
                "expression": "tool.was_called()",
                "weight": 1
            }
        ]
        config = EvaluationConfig(rules=rules)
        
        request = UnifiedEvaluationRequest(
            type=EvaluationType.EVENT,
            config=config,
            parameters={"query.name": "test-query", "query.namespace": "default"},
            evaluatorName="event-evaluator"
        )
        
        assert request.type == EvaluationType.EVENT
        assert len(request.config.rules) == 1
        assert request.config.rules[0]["name"] == "tool_usage"
        assert request.config.rules[0]["expression"] == "tool.was_called()"
    
    def test_get_config_for_type_direct(self):
        """Test extracting direct config"""
        config = EvaluationConfig(input="test", output="result")
        request = UnifiedEvaluationRequest(
            type=EvaluationType.DIRECT,
            config=config
        )
        
        direct_config = request.get_config_for_type()
        assert isinstance(direct_config, DirectEvaluationConfig)
        assert direct_config.input == "test"
        assert direct_config.output == "result"
    
    def test_get_config_for_type_query(self):
        """Test extracting query config"""
        query_ref = QueryRef(name="test-query")
        config = EvaluationConfig(queryRef=query_ref)
        request = UnifiedEvaluationRequest(
            type=EvaluationType.QUERY,
            config=config
        )
        
        query_config = request.get_config_for_type()
        assert isinstance(query_config, QueryBasedEvaluationConfig)
        assert query_config.queryRef.name == "test-query"


class TestGoldenExample:
    """Test the GoldenExample class"""
    
    def test_golden_example_creation(self):
        """Test basic GoldenExample creation"""
        example = GoldenExample(
            input="What is the capital of France?",
            expectedOutput="Paris",
            metadata={"category": "geography"}
        )
        assert example.input == "What is the capital of France?"
        assert example.expectedOutput == "Paris"
        assert example.metadata == {"category": "geography"}
    
    def test_golden_example_defaults(self):
        """Test default values"""
        example = GoldenExample(
            input="test",
            expectedOutput="result"
        )
        assert example.metadata == {}  # Default empty dict
    
    def test_golden_example_required_fields(self):
        """Test that required fields are validated"""
        with pytest.raises(ValidationError):
            GoldenExample(expectedOutput="result")  # Missing input
        
        with pytest.raises(ValidationError):
            GoldenExample(input="test")  # Missing expectedOutput


class TestQueryRef:
    """Test the QueryRef class"""
    
    def test_query_ref_creation(self):
        """Test basic QueryRef creation"""
        query_ref = QueryRef(
            name="test-query",
            namespace="default",
            responseTarget="agent-1"
        )
        assert query_ref.name == "test-query"
        assert query_ref.namespace == "default"
        assert query_ref.responseTarget == "agent-1"
    
    def test_query_ref_defaults(self):
        """Test default values"""
        query_ref = QueryRef(name="test-query")
        assert query_ref.name == "test-query"
        assert query_ref.namespace is None
        assert query_ref.responseTarget is None


class TestResponse:
    """Test the Response class"""
    
    def test_response_creation(self):
        """Test basic Response creation"""
        target = QueryTarget(type="agent", name="test-agent")
        response = Response(target=target, content="Test response")
        
        assert response.target.type == "agent"
        assert response.target.name == "test-agent"
        assert response.content == "Test response"


class TestModel:
    """Test the Model class"""
    
    def test_model_creation(self):
        """Test basic Model creation"""
        model = Model(
            name="gpt-4",
            type="azure",
            config={"base_url": "https://api.openai.com"}
        )
        assert model.name == "gpt-4"
        assert model.type == "azure"
        assert model.config["base_url"] == "https://api.openai.com"
    
    def test_model_defaults(self):
        """Test default values"""
        model = Model(name="gpt-4", type="openai")
        assert model.config == {}


# Fixtures
@pytest.fixture
def sample_golden_example():
    """Fixture providing a sample golden example"""
    return GoldenExample(
        input="What is the capital of France?",
        expectedOutput="Paris",
        metadata={"category": "geography"}
    )

@pytest.fixture
def sample_model():
    """Fixture providing a sample model"""
    return Model(
        name="gpt-4",
        type="azure",
        config={"base_url": "https://api.openai.com"}
    )

@pytest.fixture
def sample_response():
    """Fixture providing a sample response"""
    return Response(
        target=QueryTarget(type="agent", name="test-agent"),
        content="Sample response content"
    )