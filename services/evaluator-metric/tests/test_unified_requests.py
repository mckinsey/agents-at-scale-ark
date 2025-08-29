"""Test suite for unified request types"""

import pytest
from pydantic import ValidationError

from src.evaluator_metric.types import (
    BaseEvaluationRequest,
    DirectRequest,
    DatasetRequest,
    QueryRefRequest,
    QueryDrivenRequest,
    GoldenExample,
    Model,
    Response,
    QueryTarget,
    UnifiedEvaluationRequest
)


class TestBaseEvaluationRequest:
    """Test the base evaluation request class"""
    
    def test_base_request_creation(self):
        """Test basic BaseEvaluationRequest creation"""
        request = BaseEvaluationRequest(
            mode="test",
            parameters={"scope": "accuracy"},
            model=Model(name="gpt-4", type="azure", config={})
        )
        assert request.mode == "test"
        assert request.parameters == {"scope": "accuracy"}
        assert request.model.name == "gpt-4"
    
    def test_base_request_defaults(self):
        """Test default values"""
        request = BaseEvaluationRequest(mode="test")
        assert request.mode == "test"
        assert request.parameters == {}
        assert request.model is None


class TestDirectRequest:
    """Test the DirectRequest class"""
    
    def test_direct_request_creation(self):
        """Test basic DirectRequest creation"""
        request = DirectRequest(
            input="What is 2+2?",
            output="4",
            parameters={"scope": "accuracy"},
            model=Model(name="gpt-4", type="azure", config={})
        )
        assert request.mode == "direct"
        assert request.input == "What is 2+2?"
        assert request.output == "4"
        assert request.parameters == {"scope": "accuracy"}
        assert request.golden_examples is None
    
    def test_direct_request_with_golden_examples(self):
        """Test DirectRequest with golden examples"""
        golden_example = GoldenExample(
            input="What is 1+1?",
            expectedOutput="2"
        )
        request = DirectRequest(
            input="What is 2+2?",
            output="4",
            goldenExamples=[golden_example]  # Using alias
        )
        assert request.mode == "direct"
        assert request.golden_examples is not None
        assert len(request.golden_examples) == 1
        assert request.golden_examples[0].input == "What is 1+1?"
        assert request.golden_examples[0].expectedOutput == "2"
    
    def test_direct_request_alias_field(self):
        """Test that golden_examples alias works"""
        request = DirectRequest(
            input="test",
            output="result",
            goldenExamples=[GoldenExample(input="q", expectedOutput="a")]
        )
        assert request.golden_examples is not None
        assert len(request.golden_examples) == 1
    
    def test_direct_request_required_fields(self):
        """Test that required fields are validated"""
        with pytest.raises(ValidationError):
            DirectRequest(output="4")  # Missing input
        
        with pytest.raises(ValidationError):
            DirectRequest(input="What is 2+2?")  # Missing output


class TestDatasetRequest:
    """Test the DatasetRequest class"""
    
    def test_dataset_request_creation(self):
        """Test basic DatasetRequest creation"""
        test_cases = {
            "case1": {"input": "What is 2+2?", "expectedOutput": "4"},
            "case2": {"input": "What is 3+3?", "expectedOutput": "6"}
        }
        request = DatasetRequest(
            evaluationId="test-eval-123",
            testCases=test_cases,
            parameters={"scope": "accuracy"}
        )
        assert request.mode == "dataset"
        assert request.evaluation_id == "test-eval-123"
        assert len(request.test_cases) == 2
        assert request.test_cases["case1"]["input"] == "What is 2+2?"
    
    def test_dataset_request_alias_fields(self):
        """Test that alias fields work correctly"""
        request = DatasetRequest(
            evaluationId="test-123",
            testCases={"case1": {"input": "test", "expectedOutput": "result"}}
        )
        assert request.evaluation_id == "test-123"
        assert request.test_cases is not None
    
    def test_dataset_request_required_fields(self):
        """Test that required fields are validated"""
        with pytest.raises(ValidationError):
            DatasetRequest(testCases={})  # Missing evaluationId
        
        with pytest.raises(ValidationError):
            DatasetRequest(evaluationId="test")  # Missing testCases


class TestQueryRefRequest:
    """Test the QueryRefRequest class"""
    
    def test_query_ref_request_creation(self):
        """Test basic QueryRefRequest creation"""
        request = QueryRefRequest(
            queryRef="query-123",
            responseIndex=1,
            parameters={"scope": "relevance"}
        )
        assert request.mode == "query-ref"
        assert request.query_ref == "query-123"
        assert request.response_index == 1
        assert request.parameters == {"scope": "relevance"}
    
    def test_query_ref_request_defaults(self):
        """Test default values"""
        request = QueryRefRequest(queryRef="query-123")
        assert request.query_ref == "query-123"
        assert request.response_index == 0  # Default value
        assert request.golden_examples is None
    
    def test_query_ref_request_with_golden_examples(self):
        """Test QueryRefRequest with golden examples"""
        golden_example = GoldenExample(
            input="What is the capital?",
            expectedOutput="Paris"
        )
        request = QueryRefRequest(
            queryRef="query-123",
            goldenExamples=[golden_example]
        )
        assert request.golden_examples is not None
        assert len(request.golden_examples) == 1
    
    def test_query_ref_request_required_fields(self):
        """Test that required fields are validated"""
        with pytest.raises(ValidationError):
            QueryRefRequest(responseIndex=0)  # Missing queryRef


class TestQueryDrivenRequest:
    """Test the QueryDrivenRequest class"""
    
    def test_query_driven_request_creation(self):
        """Test basic QueryDrivenRequest creation"""
        response = Response(
            target=QueryTarget(type="agent", name="test-agent"),
            content="Response content"
        )
        model = Model(name="gpt-4", type="azure", config={})
        
        request = QueryDrivenRequest(
            queryId="query-123",
            input="Test input",
            responses=[response],
            query={"metadata": {"name": "test-query"}},
            model=model
        )
        assert request.mode == "query-driven"
        assert request.queryId == "query-123"
        assert request.input == "Test input"
        assert len(request.responses) == 1
        assert request.model.name == "gpt-4"
    
    def test_query_driven_request_required_fields(self):
        """Test that all required fields are validated"""
        with pytest.raises(ValidationError):
            QueryDrivenRequest()  # Missing all required fields


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


class TestUnifiedRequestValidation:
    """Test unified request validation and type discrimination"""
    
    def test_direct_request_as_unified(self):
        """Test DirectRequest as part of UnifiedEvaluationRequest"""
        request = DirectRequest(
            input="test",
            output="result"
        )
        # Should be valid as UnifiedEvaluationRequest
        assert isinstance(request, DirectRequest)
        assert request.mode == "direct"
    
    def test_dataset_request_as_unified(self):
        """Test DatasetRequest as part of UnifiedEvaluationRequest"""
        request = DatasetRequest(
            evaluationId="test-123",
            testCases={"case1": {"input": "test", "expectedOutput": "result"}}
        )
        assert isinstance(request, DatasetRequest)
        assert request.mode == "dataset"
    
    def test_query_ref_request_as_unified(self):
        """Test QueryRefRequest as part of UnifiedEvaluationRequest"""
        request = QueryRefRequest(queryRef="query-123")
        assert isinstance(request, QueryRefRequest)
        assert request.mode == "query-ref"
    
    def test_query_driven_request_as_unified(self):
        """Test QueryDrivenRequest as part of UnifiedEvaluationRequest"""
        response = Response(
            target=QueryTarget(type="agent", name="test-agent"),
            content="Response content"
        )
        model = Model(name="gpt-4", type="azure", config={})
        
        request = QueryDrivenRequest(
            queryId="query-123",
            input="Test input",
            responses=[response],
            query={"metadata": {"name": "test-query"}},
            model=model
        )
        assert isinstance(request, QueryDrivenRequest)
        assert request.mode == "query-driven"


class TestRequestSerialization:
    """Test request serialization and deserialization"""
    
    def test_direct_request_json_serialization(self):
        """Test DirectRequest JSON serialization"""
        request = DirectRequest(
            input="What is 2+2?",
            output="4",
            parameters={"scope": "accuracy"}
        )
        json_data = request.model_dump()
        assert json_data["mode"] == "direct"
        assert json_data["input"] == "What is 2+2?"
        assert json_data["output"] == "4"
        assert json_data["parameters"] == {"scope": "accuracy"}
    
    def test_dataset_request_json_serialization(self):
        """Test DatasetRequest JSON serialization"""
        request = DatasetRequest(
            evaluationId="test-123",
            testCases={"case1": {"input": "test", "expectedOutput": "result"}}
        )
        json_data = request.model_dump()
        assert json_data["mode"] == "dataset"
        # Test the actual field name used internally
        assert json_data["evaluation_id"] == "test-123"
        assert "test_cases" in json_data
        
    def test_dataset_request_alias_serialization(self):
        """Test DatasetRequest JSON serialization with aliases"""
        request = DatasetRequest(
            evaluationId="test-123",
            testCases={"case1": {"input": "test", "expectedOutput": "result"}}
        )
        json_data = request.model_dump(by_alias=True)
        assert json_data["mode"] == "dataset"
        assert json_data["evaluationId"] == "test-123"
        assert "testCases" in json_data
    
    def test_alias_serialization(self):
        """Test that aliases are used in serialization"""
        request = DirectRequest(
            input="test",
            output="result",
            goldenExamples=[GoldenExample(input="q", expectedOutput="a")]
        )
        json_data = request.model_dump(by_alias=True)
        assert "goldenExamples" in json_data
        assert "golden_examples" not in json_data


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