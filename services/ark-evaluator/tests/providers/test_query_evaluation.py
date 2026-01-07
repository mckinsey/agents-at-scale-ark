import pytest
import logging
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from fastapi import HTTPException
from kubernetes.client.rest import ApiException

from src.evaluator.providers.query_evaluation import QueryEvaluationProvider
from src.evaluator.types import (
    UnifiedEvaluationRequest, EvaluationResponse, ModelRef,
    EvaluationParameters
)

logger = logging.getLogger(__name__)


class TestQueryEvaluationProvider:
    """Test suite for QueryEvaluationProvider"""
    
    def setup_method(self):
        """Set up test fixtures"""
        self.provider = QueryEvaluationProvider()
        self.mock_session = Mock()
        self.provider_with_session = QueryEvaluationProvider(shared_session=self.mock_session)
    
    def test_initialization(self):
        """Test provider initialization"""
        assert self.provider.get_evaluation_type() == "query"
        assert self.provider.shared_session is None
        assert self.provider_with_session.shared_session is self.mock_session
    
    def test_get_evaluation_type(self):
        """Test evaluation type identification"""
        assert self.provider.get_evaluation_type() == "query"
    
    @pytest.mark.asyncio
    async def test_evaluate_missing_config(self):
        """Test evaluation fails with missing config"""
        request = Mock(spec=UnifiedEvaluationRequest)
        request.config = None
        request.evaluatorName = "test-evaluator"
        
        with pytest.raises(HTTPException) as exc_info:
            await self.provider.evaluate(request)
        
        assert exc_info.value.status_code == 422
        assert "Query evaluation requires queryRef in config" in str(exc_info.value.detail)
    
    @pytest.mark.asyncio
    async def test_evaluate_missing_query_ref(self):
        """Test evaluation fails with missing queryRef"""
        request = Mock(spec=UnifiedEvaluationRequest)
        request.config = Mock()
        del request.config.queryRef  # Simulate missing queryRef attribute
        request.evaluatorName = "test-evaluator"
        
        with pytest.raises(HTTPException) as exc_info:
            await self.provider.evaluate(request)
        
        assert exc_info.value.status_code == 422
        assert "Query evaluation requires queryRef in config" in str(exc_info.value.detail)
    
    @pytest.mark.asyncio
    @patch('src.evaluator.providers.query_evaluation.config')
    @patch('src.evaluator.providers.query_evaluation.client')
    @patch('src.evaluator.providers.query_evaluation.LLMEvaluator')
    async def test_evaluate_successful_basic(self, mock_evaluator_class, mock_k8s_client, mock_k8s_config):
        """Test successful query evaluation with basic setup"""
        # Setup Kubernetes mocks
        mock_k8s_config.load_incluster_config.return_value = None
        mock_api_client = Mock()
        mock_custom_api = Mock()
        mock_k8s_client.ApiClient.return_value = mock_api_client
        mock_k8s_client.CustomObjectsApi.return_value = mock_custom_api
        
        # Mock query resource response
        mock_query_resource = {
            "spec": {"input": "What is the weather?"},
            "status": {
                "responses": [
                    {
                        "target": {"name": "weather-agent", "type": "agent"},
                        "content": "The weather is sunny today."
                    }
                ]
            }
        }
        mock_custom_api.get_namespaced_custom_object.return_value = mock_query_resource
        
        # Setup mock evaluator
        mock_evaluator_instance = AsyncMock()
        mock_evaluator_class.return_value = mock_evaluator_instance
        
        expected_response = EvaluationResponse(
            score="0.85",
            passed=True,
            metadata={"message": "Query evaluation completed successfully"}
        )
        mock_evaluator_instance.evaluate.return_value = expected_response
        
        # Setup request
        request = Mock(spec=UnifiedEvaluationRequest)
        request.config = Mock()
        request.config.queryRef = Mock()
        request.config.queryRef.name = "test-query"
        request.config.queryRef.namespace = "default"
        request.config.queryRef.responseTarget = None  # No specific target
        request.evaluatorName = "test-evaluator"
        request.parameters = {
            "model.name": "gpt-4",
            "model.namespace": "default"
        }
        
        # Execute evaluation
        result = await self.provider.evaluate(request)
        
        # Verify Kubernetes API calls
        mock_custom_api.get_namespaced_custom_object.assert_called_once_with(
            group="ark.mckinsey.com",
            version="v1alpha1",
            namespace="default",
            plural="queries",
            name="test-query"
        )
        
        # Verify evaluator was called
        mock_evaluator_class.assert_called_once_with(session=None)
        mock_evaluator_instance.evaluate.assert_called_once()
        
        # Verify result
        assert result == expected_response
    
    @pytest.mark.asyncio
    @patch('src.evaluator.providers.query_evaluation.config')
    @patch('src.evaluator.providers.query_evaluation.client')
    @patch('src.evaluator.providers.query_evaluation.LLMEvaluator')
    async def test_evaluate_with_response_target_type_name_format(self, mock_evaluator_class, mock_k8s_client, mock_k8s_config):
        """Test query evaluation with responseTarget in 'type:name' format"""
        # Setup Kubernetes mocks
        mock_k8s_config.load_incluster_config.return_value = None
        mock_api_client = Mock()
        mock_custom_api = Mock()
        mock_k8s_client.ApiClient.return_value = mock_api_client
        mock_k8s_client.CustomObjectsApi.return_value = mock_custom_api
        
        # Mock query resource with singular response
        mock_query_resource = {
            "spec": {
                "input": "What is the weather?",
                "target": {"name": "weather-agent", "type": "agent"}
            },
            "status": {
                "response": {
                    "content": "The weather is sunny."
                }
            }
        }
        mock_custom_api.get_namespaced_custom_object.return_value = mock_query_resource
        
        # Setup mock evaluator
        mock_evaluator_instance = AsyncMock()
        mock_evaluator_class.return_value = mock_evaluator_instance
        expected_response = EvaluationResponse(score="0.90", passed=True, metadata={"message": "Targeted evaluation completed"})
        mock_evaluator_instance.evaluate.return_value = expected_response
        
        # Setup request with specific target
        request = Mock(spec=UnifiedEvaluationRequest)
        request.config = Mock()
        request.config.queryRef = Mock()
        request.config.queryRef.name = "test-query"
        request.config.queryRef.namespace = "default"
        request.config.queryRef.responseTarget = "agent:weather-agent"  # Target specific agent
        request.evaluatorName = "test-evaluator"
        request.parameters = {"model.name": "gpt-4"}
        
        # Execute evaluation
        result = await self.provider.evaluate(request)
        
        # Verify the correct response was selected
        call_args = mock_evaluator_instance.evaluate.call_args
        eval_request = call_args[0][0]
        assert len(eval_request.responses) == 1
        assert eval_request.responses[0].target.name == "agent:weather-agent"
        assert eval_request.responses[0].target.type == "agent"
        assert eval_request.responses[0].content == "The weather is sunny."
        
        assert result == expected_response
    
    @pytest.mark.asyncio
    @patch('src.evaluator.providers.query_evaluation.config')
    @patch('src.evaluator.providers.query_evaluation.client')
    @patch('src.evaluator.providers.query_evaluation.LLMEvaluator')
    async def test_evaluate_with_legacy_response_target_format(self, mock_evaluator_class, mock_k8s_client, mock_k8s_config):
        """Test query evaluation with legacy responseTarget format (name only)"""
        # Setup Kubernetes mocks
        mock_k8s_config.load_incluster_config.return_value = None
        mock_api_client = Mock()
        mock_custom_api = Mock()
        mock_k8s_client.ApiClient.return_value = mock_api_client
        mock_k8s_client.CustomObjectsApi.return_value = mock_custom_api
        
        # Mock query resource with singular response
        mock_query_resource = {
            "spec": {
                "input": "What is the weather?",
                "target": {"name": "weather-agent", "type": "agent"}
            },
            "status": {
                "response": {
                    "content": "The weather is sunny."
                }
            }
        }
        mock_custom_api.get_namespaced_custom_object.return_value = mock_query_resource

        # Setup mock evaluator
        mock_evaluator_instance = AsyncMock()
        mock_evaluator_class.return_value = mock_evaluator_instance
        expected_response = EvaluationResponse(score="0.75", passed=True, metadata={"message": "Legacy format evaluation completed"})
        mock_evaluator_instance.evaluate.return_value = expected_response

        # Setup request with legacy target format
        request = Mock(spec=UnifiedEvaluationRequest)
        request.config = Mock()
        request.config.queryRef = Mock()
        request.config.queryRef.name = "test-query"
        request.config.queryRef.namespace = "default"
        request.config.queryRef.responseTarget = "weather-agent"  # Legacy format - name only
        request.evaluatorName = "test-evaluator"
        request.parameters = {"model.name": "gpt-4"}
        
        # Execute evaluation
        result = await self.provider.evaluate(request)
        
        # Verify the correct response was selected based on name only
        call_args = mock_evaluator_instance.evaluate.call_args
        eval_request = call_args[0][0]
        assert len(eval_request.responses) == 1
        assert eval_request.responses[0].target.name == "weather-agent"
        
        assert result == expected_response
    
    @pytest.mark.asyncio
    @patch('src.evaluator.providers.query_evaluation.config')
    @patch('src.evaluator.providers.query_evaluation.client')
    async def test_evaluate_query_not_found(self, mock_k8s_client, mock_k8s_config):
        """Test evaluation fails when query resource is not found"""
        # Setup Kubernetes mocks
        mock_k8s_config.load_incluster_config.return_value = None
        mock_api_client = Mock()
        mock_custom_api = Mock()
        mock_k8s_client.ApiClient.return_value = mock_api_client
        mock_k8s_client.CustomObjectsApi.return_value = mock_custom_api
        
        # Mock API exception for not found
        mock_custom_api.get_namespaced_custom_object.side_effect = ApiException(status=404, reason="Not Found")
        
        # Setup request
        request = Mock(spec=UnifiedEvaluationRequest)
        request.config = Mock()
        request.config.queryRef = Mock()
        request.config.queryRef.name = "nonexistent-query"
        request.config.queryRef.namespace = "default"
        request.config.queryRef.responseTarget = None
        request.evaluatorName = "test-evaluator"
        request.parameters = {"model.name": "gpt-4"}
        
        # Execute and expect exception
        with pytest.raises(HTTPException) as exc_info:
            await self.provider.evaluate(request)
        
        assert exc_info.value.status_code == 500
        assert "Failed to fetch query" in str(exc_info.value.detail)
    
    @pytest.mark.asyncio
    @patch('src.evaluator.providers.query_evaluation.config')
    @patch('src.evaluator.providers.query_evaluation.client')
    async def test_evaluate_kubernetes_api_error(self, mock_k8s_client, mock_k8s_config):
        """Test evaluation fails with Kubernetes API error"""
        # Setup Kubernetes mocks
        mock_k8s_config.load_incluster_config.return_value = None
        mock_api_client = Mock()
        mock_custom_api = Mock()
        mock_k8s_client.ApiClient.return_value = mock_api_client
        mock_k8s_client.CustomObjectsApi.return_value = mock_custom_api
        
        # Mock API exception for server error
        mock_custom_api.get_namespaced_custom_object.side_effect = ApiException(status=500, reason="Internal Server Error")
        
        # Setup request
        request = Mock(spec=UnifiedEvaluationRequest)
        request.config = Mock()
        request.config.queryRef = Mock()
        request.config.queryRef.name = "test-query"
        request.config.queryRef.namespace = "default"
        request.config.queryRef.responseTarget = None
        request.evaluatorName = "test-evaluator"
        request.parameters = {"model.name": "gpt-4"}
        
        # Execute and expect exception
        with pytest.raises(HTTPException) as exc_info:
            await self.provider.evaluate(request)
        
        assert exc_info.value.status_code == 500
        assert "Failed to fetch query" in str(exc_info.value.detail)
    
    @pytest.mark.asyncio
    @patch('src.evaluator.providers.query_evaluation.config')
    @patch('src.evaluator.providers.query_evaluation.client')
    @patch('src.evaluator.providers.query_evaluation.LLMEvaluator')
    async def test_evaluate_no_responses_in_query(self, mock_evaluator_class, mock_k8s_client, mock_k8s_config):
        """Test evaluation handles query with no responses (sets empty output)"""
        # Setup Kubernetes mocks
        mock_k8s_config.load_incluster_config.return_value = None
        mock_api_client = Mock()
        mock_custom_api = Mock()
        mock_k8s_client.ApiClient.return_value = mock_api_client
        mock_k8s_client.CustomObjectsApi.return_value = mock_custom_api
        
        # Mock query resource with no responses
        mock_query_resource = {
            "spec": {"input": "What is the weather?"},
            "status": {}  # No responses
        }
        mock_custom_api.get_namespaced_custom_object.return_value = mock_query_resource
        
        # Setup mock evaluator
        mock_evaluator_instance = AsyncMock()
        mock_evaluator_class.return_value = mock_evaluator_instance
        expected_response = EvaluationResponse(score="0.5", passed=False, metadata={"message": "No responses to evaluate"})
        mock_evaluator_instance.evaluate.return_value = expected_response
        
        # Setup request
        request = Mock(spec=UnifiedEvaluationRequest)
        request.config = Mock()
        request.config.queryRef = Mock()
        request.config.queryRef.name = "test-query"
        request.config.queryRef.namespace = "default"
        request.config.queryRef.responseTarget = None
        request.evaluatorName = "test-evaluator"
        request.parameters = {"model.name": "gpt-4"}
        
        # Execute - should work with empty output
        result = await self.provider.evaluate(request)
        
        # Verify it proceeded with empty output
        call_args = mock_evaluator_instance.evaluate.call_args
        eval_request = call_args[0][0]
        assert eval_request.responses[0].content == ""  # Empty content for no responses
        assert result == expected_response
    
    @pytest.mark.asyncio
    @patch('src.evaluator.providers.query_evaluation.config')
    @patch('src.evaluator.providers.query_evaluation.client')
    @patch('src.evaluator.providers.query_evaluation.LLMEvaluator')
    async def test_evaluate_target_not_found_in_responses(self, mock_evaluator_class, mock_k8s_client, mock_k8s_config):
        """Test evaluation handles when specified target is not found in responses (sets empty output)"""
        # Setup Kubernetes mocks
        mock_k8s_config.load_incluster_config.return_value = None
        mock_api_client = Mock()
        mock_custom_api = Mock()
        mock_k8s_client.ApiClient.return_value = mock_api_client
        mock_k8s_client.CustomObjectsApi.return_value = mock_custom_api
        
        # Mock query resource with responses but not the target we want
        mock_query_resource = {
            "spec": {"input": "What is the weather?"},
            "status": {
                "responses": [
                    {
                        "target": {"name": "other-agent", "type": "agent"},
                        "content": "Different response"
                    }
                ]
            }
        }
        mock_custom_api.get_namespaced_custom_object.return_value = mock_query_resource
        
        # Setup mock evaluator
        mock_evaluator_instance = AsyncMock()
        mock_evaluator_class.return_value = mock_evaluator_instance
        expected_response = EvaluationResponse(score="0.0", passed=False, metadata={"message": "Target not found"})
        mock_evaluator_instance.evaluate.return_value = expected_response
        
        # Setup request targeting non-existent response
        request = Mock(spec=UnifiedEvaluationRequest)
        request.config = Mock()
        request.config.queryRef = Mock()
        request.config.queryRef.name = "test-query"
        request.config.queryRef.namespace = "default"
        request.config.queryRef.responseTarget = "agent:missing-agent"  # This agent doesn't exist
        request.evaluatorName = "test-evaluator"
        request.parameters = {"model.name": "gpt-4"}
        
        # Execute - should work with empty output when target not found
        result = await self.provider.evaluate(request)
        
        # Verify it proceeded with empty output for missing target
        call_args = mock_evaluator_instance.evaluate.call_args
        eval_request = call_args[0][0]
        assert eval_request.responses[0].content == ""  # Empty content when target not found
        assert result == expected_response
    
    @pytest.mark.skip(reason="QueryEvaluationProvider doesn't have k8s initialization logic")
    @patch('src.evaluator.providers.query_evaluation.config')
    @patch('src.evaluator.providers.query_evaluation.client')
    def test_initialization_fallback_to_kube_config(self, mock_k8s_client, mock_k8s_config):
        """Test that provider initialization falls back to kube config when incluster config fails"""
        from kubernetes.config import ConfigException
        
        # Setup config mock to fail incluster then succeed with kube_config
        mock_k8s_config.load_incluster_config.side_effect = ConfigException("Not in cluster")
        mock_k8s_config.load_kube_config.return_value = None
        mock_core_api = Mock()
        mock_k8s_client.CoreV1Api.return_value = mock_core_api
        
        # Create provider (this triggers config loading)
        provider = QueryEvaluationProvider()
        
        # Verify both config methods were attempted during initialization
        mock_k8s_config.load_incluster_config.assert_called_once()
        mock_k8s_config.load_kube_config.assert_called_once()
        
        # Verify provider was created successfully
        assert provider.get_evaluation_type() == "query"