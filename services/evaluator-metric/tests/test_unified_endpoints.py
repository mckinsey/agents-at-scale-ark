"""Test suite for unified endpoints compatibility"""

import pytest
from unittest.mock import Mock, patch, AsyncMock
from fastapi.testclient import TestClient

from src.evaluator_metric.app import create_app
from src.evaluator_metric.types import DirectRequest, QueryRefRequest


class TestUnifiedEndpoints:
    """Test the unified endpoints that match evaluator-llm"""
    
    @pytest.fixture
    def client(self):
        """Create test client"""
        app = create_app()
        return TestClient(app)
    
    @pytest.fixture
    def mock_evaluator(self):
        """Mock MetricEvaluator"""
        with patch('src.evaluator_metric.app.MetricEvaluator') as mock_evaluator_class:
            mock_evaluator = Mock()
            mock_evaluator_class.return_value = mock_evaluator
            yield mock_evaluator
    
    def test_health_endpoint(self, client):
        """Test health endpoint"""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "healthy", "service": "evaluator-metric"}
    
    def test_evaluate_direct_endpoint(self, client, mock_evaluator):
        """Test /evaluate/direct endpoint"""
        # Mock the evaluator response
        mock_response = Mock()
        mock_response.score = "0.85"
        mock_response.passed = True
        mock_response.metadata = {"reasoning": "Good performance"}
        mock_response.error = None
        
        mock_evaluator.evaluate_direct = AsyncMock(return_value=mock_response)
        
        # Test request payload
        request_data = {
            "mode": "direct",
            "input": "What is 2+2?",
            "output": "2+2 equals 4",
            "parameters": {
                "maxTokens": "1000",
                "maxDuration": "30s"
            }
        }
        
        response = client.post("/evaluate/direct", json=request_data)
        
        assert response.status_code == 200
        result = response.json()
        assert result["score"] == "0.85"
        assert result["passed"] is True
        assert result["metadata"]["reasoning"] == "Good performance"
        assert result["error"] is None
        
        # Verify the evaluator was called with correct parameters
        mock_evaluator.evaluate_direct.assert_called_once()
        call_args = mock_evaluator.evaluate_direct.call_args[0][0]
        assert call_args.mode == "direct"
        assert call_args.input == "What is 2+2?"
        assert call_args.output == "2+2 equals 4"
        assert call_args.parameters["maxTokens"] == "1000"
    
    def test_evaluate_direct_error_handling(self, client, mock_evaluator):
        """Test error handling in /evaluate/direct endpoint"""
        # Mock the evaluator to raise an exception
        mock_evaluator.evaluate_direct = AsyncMock(side_effect=Exception("Test error"))
        
        request_data = {
            "mode": "direct",
            "input": "test input",
            "output": "test output"
        }
        
        response = client.post("/evaluate/direct", json=request_data)
        
        assert response.status_code == 500
        assert "Test error" in response.json()["detail"]
    
    def test_evaluate_query_ref_endpoint(self, client, mock_evaluator):
        """Test /evaluate/query-ref endpoint"""
        # Mock the evaluator response
        mock_response = Mock()
        mock_response.score = "0.72"
        mock_response.passed = True
        mock_response.metadata = {"reasoning": "Query metrics within thresholds"}
        mock_response.error = None
        
        mock_evaluator.evaluate_query_ref = AsyncMock(return_value=mock_response)
        
        # Test request payload
        request_data = {
            "mode": "query-ref",
            "queryRef": "default/test-query",
            "parameters": {
                "maxTokens": "2000"
            }
        }
        
        response = client.post("/evaluate/query-ref", json=request_data)
        
        assert response.status_code == 200
        result = response.json()
        assert result["score"] == "0.72"
        assert result["passed"] is True
        assert "Query metrics within thresholds" in result["metadata"]["reasoning"]
        
        # Verify the evaluator was called
        mock_evaluator.evaluate_query_ref.assert_called_once()
        call_args = mock_evaluator.evaluate_query_ref.call_args[0][0]
        assert call_args.mode == "query-ref"
        assert call_args.query_ref == "default/test-query"
    
    def test_evaluate_dataset_endpoint_placeholder(self, client):
        """Test /evaluate/dataset endpoint placeholder"""
        request_data = {
            "mode": "dataset",
            "evaluationId": "test-eval",
            "testCases": {
                "case1": {"input": "test", "expectedOutput": "result"}
            }
        }
        
        response = client.post("/evaluate/dataset", json=request_data)
        
        assert response.status_code == 200
        result = response.json()
        assert result["score"] == "0.0"
        assert result["passed"] is False
        assert "Dataset evaluation not implemented" in result["error"]
    
    def test_legacy_evaluate_endpoint_still_works(self, client, mock_evaluator):
        """Test that legacy /evaluate endpoint still works"""
        # Mock the evaluator response
        mock_response = Mock()
        mock_response.score = "0.90"
        mock_response.passed = True
        mock_response.metrics = {"totalTokens": 150}
        mock_response.metadata = {"reasoning": "Excellent performance"}
        mock_response.error = None
        
        mock_evaluator.evaluate_metrics = AsyncMock(return_value=mock_response)
        
        # Test request payload
        request_data = {
            "queryRef": {
                "name": "test-query",
                "namespace": "default"
            },
            "parameters": {
                "maxTokens": "1000"
            }
        }
        
        response = client.post("/evaluate", json=request_data)
        
        assert response.status_code == 200
        result = response.json()
        assert result["score"] == "0.90"
        assert result["passed"] is True
        assert result["metrics"]["totalTokens"] == 150
        
        # Verify the evaluator was called
        mock_evaluator.evaluate_metrics.assert_called_once()
    
    def test_request_validation(self, client):
        """Test request validation for unified endpoints"""
        # Test missing required fields for direct endpoint
        response = client.post("/evaluate/direct", json={"mode": "direct"})
        assert response.status_code == 422  # Validation error
        
        # Test missing required fields for query-ref endpoint  
        response = client.post("/evaluate/query-ref", json={"mode": "query-ref"})
        assert response.status_code == 422  # Validation error