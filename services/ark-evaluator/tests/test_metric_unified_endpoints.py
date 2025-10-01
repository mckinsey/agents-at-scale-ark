"""Test suite for unified endpoints compatibility"""

import pytest
from unittest.mock import Mock, patch, AsyncMock
from fastapi.testclient import TestClient

from evaluator.app import create_app
from evaluator.metrics.metric_types import DirectRequest, QueryRefRequest


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
        with patch('evaluator.metrics.app.MetricEvaluator') as mock_evaluator_class:
            mock_evaluator = Mock()
            mock_evaluator_class.return_value = mock_evaluator
            yield mock_evaluator
    
    def test_health_endpoint(self, client):
        """Test health endpoint"""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "healthy", "service": "ark-evaluator"}
    
    def test_evaluate_direct_endpoint(self, client, mock_evaluator):
        """Test /evaluate endpoint with direct type"""
        # Mock the evaluator response
        mock_response = Mock()
        mock_response.score = "0.85"
        mock_response.passed = True
        mock_response.metadata = {"reasoning": "Good performance"}
        mock_response.error = None
        mock_response.tokenUsage = None
        
        mock_evaluator.evaluate_direct = AsyncMock(return_value=mock_response)
        
        # Test request payload for unified endpoint
        request_data = {
            "type": "direct",
            "config": {
                "input": "What is 2+2?",
                "output": "2+2 equals 4"
            },
            "parameters": {
                "maxTokens": "1000",
                "maxDuration": "30s"
            }
        }
        
        response = client.post("/evaluate-metrics", json=request_data)
        
        assert response.status_code == 200
        result = response.json()
        assert result["score"] == "0.85"
        assert result["passed"] is True
        assert result["metadata"]["reasoning"] == "Good performance"
        assert result["error"] is None
        
        # Verify the evaluator was called with correct parameters
        mock_evaluator.evaluate_direct.assert_called_once()
        call_args = mock_evaluator.evaluate_direct.call_args[0][0]
        assert call_args.input == "What is 2+2?"
        assert call_args.output == "2+2 equals 4"
        assert call_args.parameters["maxTokens"] == "1000"
    
    def test_evaluate_direct_error_handling(self, client, mock_evaluator):
        """Test error handling in /evaluate endpoint with direct type"""
        # Mock the evaluator to raise an exception
        mock_evaluator.evaluate_direct = AsyncMock(side_effect=Exception("Test error"))
        
        request_data = {
            "type": "direct",
            "config": {
                "input": "test input",
                "output": "test output"
            }
        }
        
        response = client.post("/evaluate-metrics", json=request_data)
        
        assert response.status_code == 500
        assert "Test error" in response.json()["detail"]
    
    def test_evaluate_query_ref_endpoint(self, client, mock_evaluator):
        """Test /evaluate endpoint with query type"""
        # Mock the evaluator response
        mock_response = Mock()
        mock_response.score = "0.72"
        mock_response.passed = True
        mock_response.metadata = {"reasoning": "Query metrics within thresholds"}
        mock_response.error = None
        mock_response.tokenUsage = None
        
        mock_evaluator.evaluate_query_ref = AsyncMock(return_value=mock_response)
        
        # Test request payload for unified endpoint
        request_data = {
            "type": "query",
            "config": {
                "queryRef": {
                    "name": "test-query",
                    "namespace": "default"
                }
            },
            "parameters": {
                "maxTokens": "2000"
            }
        }
        
        response = client.post("/evaluate-metrics", json=request_data)
        
        assert response.status_code == 200
        result = response.json()
        assert result["score"] == "0.72"
        assert result["passed"] is True
        assert "Query metrics within thresholds" in result["metadata"]["reasoning"]
        
        # Verify the evaluator was called
        mock_evaluator.evaluate_query_ref.assert_called_once()
        call_args = mock_evaluator.evaluate_query_ref.call_args[0][0]
        assert call_args.queryRef.name == "test-query"
        assert call_args.queryRef.namespace == "default"
    
    def test_evaluate_batch_endpoint_not_implemented(self, client, mock_evaluator):
        """Test /evaluate endpoint with batch type returns not implemented"""

        # Mock the evaluator response
        mock_response = Mock()
        mock_evaluator.evaluate_query_ref = AsyncMock(return_value=mock_response)

        request_data = {
            "type": "batch",
            "config": {
                "evaluations": []
            }
        }
        
        response = client.post("/evaluate-metrics", json=request_data)
        
        assert response.status_code == 501
        assert "not yet implemented" in response.json()["detail"].lower()
    
    def test_evaluate_endpoint_with_invalid_type(self, client):
        """Test /evaluate endpoint with invalid type"""
        request_data = {
            "type": "invalid_type",
            "config": {}
        }
        
        response = client.post("/evaluate-metrics", json=request_data)
        
        assert response.status_code == 422
    
    def test_request_validation(self, client):
        """Test request validation for unified endpoints"""
        # Test missing required fields
        response = client.post("/evaluate", json={})
        assert response.status_code == 422  # Validation error