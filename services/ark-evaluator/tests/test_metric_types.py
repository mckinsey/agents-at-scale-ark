"""Test suite for metric evaluator types"""

import pytest
from pydantic import ValidationError

from src.evaluator.types import (
    QueryRef,
    MetricEvaluationRequest, 
    MetricEvaluationResponse
)


class TestQueryRef:
    """Test the QueryRef class"""
    
    def test_query_ref_creation(self):
        """Test basic QueryRef creation"""
        query_ref = QueryRef(name="test-query", namespace="default")
        assert query_ref.name == "test-query"
        assert query_ref.namespace == "default"
    
    def test_query_ref_required_fields(self):
        """Test that required fields are validated"""
        # namespace is optional, so this should work
        query_ref = QueryRef(name="test-query")
        assert query_ref.name == "test-query"
        assert query_ref.namespace is None
        
        # name is required
        with pytest.raises(ValidationError):
            QueryRef(namespace="default")  # Missing name


class TestMetricEvaluationRequest:
    """Test the MetricEvaluationRequest class"""
    
    def test_metric_evaluation_request_creation(self):
        """Test basic MetricEvaluationRequest creation"""
        request = MetricEvaluationRequest(
            queryId="test-query-123",
            input="What is 2+2?",
            output="4",
            parameters={"maxTokens": "1000", "maxDuration": "30s"}
        )
        assert request.queryId == "test-query-123"
        assert request.input == "What is 2+2?"
        assert request.output == "4"
        assert request.parameters["maxTokens"] == "1000"
        assert request.parameters["maxDuration"] == "30s"
    
    def test_metric_evaluation_request_defaults(self):
        """Test default values"""
        request = MetricEvaluationRequest(
            queryId="test-query-123",
            input="What is 2+2?",
            output="4"
        )
        assert request.parameters == {}
    
    def test_metric_evaluation_request_required_fields(self):
        """Test that required fields are validated"""
        with pytest.raises(ValidationError):
            MetricEvaluationRequest(parameters={})  # Missing required fields


class TestMetricEvaluationResponse:
    """Test the MetricEvaluationResponse class"""
    
    def test_metric_evaluation_response_creation(self):
        """Test basic MetricEvaluationResponse creation"""
        response = MetricEvaluationResponse(
            score="0.85",
            passed=True,
            metrics={
                "totalTokens": 245,
                "executionDuration": "2.1s",
                "tokenEfficiency": 0.65
            },
            metadata={
                "reasoning": "All metrics within acceptable thresholds",
                "evaluation_type": "performance_metrics"
            }
        )
        assert response.score == "0.85"
        assert response.passed is True
        assert response.metrics["totalTokens"] == 245
        assert response.metadata["reasoning"] == "All metrics within acceptable thresholds"
        assert response.error is None
    
    def test_metric_evaluation_response_defaults(self):
        """Test default values"""
        response = MetricEvaluationResponse(score="0.5", passed=False)
        assert response.score == "0.5"
        assert response.passed is False
        assert response.metrics == {}
        assert response.metadata is None
        assert response.error is None
    
    def test_metric_evaluation_response_with_error(self):
        """Test response with error"""
        response = MetricEvaluationResponse(
            score="0.0",
            passed=False,
            error="Query not found in cluster"
        )
        assert response.score == "0.0"
        assert response.passed is False
        assert response.error == "Query not found in cluster"
    
    def test_metric_evaluation_response_required_fields(self):
        """Test that required fields are validated"""
        with pytest.raises(ValidationError):
            MetricEvaluationResponse(passed=True)  # Missing score
        
        with pytest.raises(ValidationError):
            MetricEvaluationResponse(score="0.8")  # Missing passed


class TestMetricTypesSerialization:
    """Test metric types serialization"""
    
    def test_query_ref_serialization(self):
        """Test QueryRef JSON serialization"""
        query_ref = QueryRef(name="test-query", namespace="default")
        json_data = query_ref.model_dump()
        assert json_data["name"] == "test-query"
        assert json_data["namespace"] == "default"
    
    def test_request_serialization(self):
        """Test MetricEvaluationRequest JSON serialization"""
        request = MetricEvaluationRequest(
            queryId="test-query-123",
            input="What is 2+2?",
            output="4",
            parameters={"maxTokens": "1000"}
        )
        json_data = request.model_dump()
        assert json_data["queryId"] == "test-query-123"
        assert json_data["input"] == "What is 2+2?"
        assert json_data["output"] == "4"
        assert json_data["parameters"]["maxTokens"] == "1000"
    
    def test_response_serialization(self):
        """Test MetricEvaluationResponse JSON serialization"""
        response = MetricEvaluationResponse(
            score="0.85",
            passed=True,
            metrics={"totalTokens": 245},
            metadata={"reasoning": "Good performance"}
        )
        json_data = response.model_dump()
        assert json_data["score"] == "0.85"
        assert json_data["passed"] is True
        assert json_data["metrics"]["totalTokens"] == 245
        assert json_data["metadata"]["reasoning"] == "Good performance"


# Fixtures
@pytest.fixture
def sample_query_ref():
    """Fixture providing a sample QueryRef"""
    return QueryRef(name="test-query", namespace="default")

@pytest.fixture
def sample_parameters():
    """Fixture providing sample evaluation parameters"""
    return {
        "maxTokens": "5000",
        "maxDuration": "30s",
        "tokenEfficiencyThreshold": "0.3",
        "maxCostPerQuery": "0.10"
    }

@pytest.fixture
def sample_metrics():
    """Fixture providing sample metrics"""
    return {
        "totalTokens": 245,
        "promptTokens": 150,
        "completionTokens": 95,
        "executionDuration": "2.1s",
        "totalCost": 0.05,
        "tokenEfficiency": 0.63,
        "responseLength": 89
    }