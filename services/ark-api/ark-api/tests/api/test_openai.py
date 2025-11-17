"""Tests for OpenAI-compatible API endpoints."""
import os
import unittest
import unittest.mock
from unittest.mock import Mock, patch, AsyncMock
from fastapi.testclient import TestClient
import json

# Set environment variable to skip authentication before importing the app
os.environ["AUTH_MODE"] = "open"


class TestOpenAIChatCompletions(unittest.TestCase):
    """Test cases for the /openai/v1/chat/completions endpoint."""
    
    def setUp(self):
        """Set up test client."""
        from ark_api.main import app
        self.client = TestClient(app)
    
    @patch('ark_api.api.v1.openai.with_ark_client')
    @patch('ark_api.api.v1.openai.get_namespace')
    @patch('ark_api.api.v1.openai.parse_model_to_query_target')
    @patch('ark_api.api.v1.openai.poll_query_completion')
    def test_chat_completions_with_session_id(self, mock_poll, mock_parse_target, mock_get_namespace, mock_with_ark_client):
        """Test chat completions with session ID in queryAnnotations."""
        # Setup mocks
        mock_get_namespace.return_value = "default"
        mock_parse_target.return_value = {"name": "test-agent", "type": "agent"}
        
        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        mock_client.queries.a_create = AsyncMock()
        
        mock_completion = Mock()
        mock_completion.id = "chatcmpl-test"
        mock_completion.object = "chat.completion"
        mock_completion.created = 1234567890
        mock_completion.model = "test-agent"
        mock_completion.choices = [Mock()]
        mock_completion.choices[0].message = Mock()
        mock_completion.choices[0].message.role = "assistant"
        mock_completion.choices[0].message.content = "Hello!"
        mock_completion.choices[0].finish_reason = "stop"
        mock_poll.return_value = mock_completion
        
        # Make the request with session ID in queryAnnotations
        request_data = {
            "model": "agent/test-agent",
            "messages": [{"role": "user", "content": "Hello"}],
            "metadata": {
                "queryAnnotations": json.dumps({"sessionId": "test-session-123"})
            }
        }
        response = self.client.post("/openai/v1/chat/completions", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        
        # Verify that a_create was called with a query that has sessionId in spec
        mock_client.queries.a_create.assert_called_once()
        query_resource = mock_client.queries.a_create.call_args[0][0]
        # QueryV1alpha1 has a to_dict() method that returns the full structure
        query_dict = query_resource.to_dict()
        spec = query_dict.get('spec', {})
        self.assertEqual(spec.get("sessionId"), "test-session-123")
    
    @patch('ark_api.api.v1.openai.with_ark_client')
    @patch('ark_api.api.v1.openai.get_namespace')
    @patch('ark_api.api.v1.openai.parse_model_to_query_target')
    @patch('ark_api.api.v1.openai.poll_query_completion')
    def test_chat_completions_without_session_id(self, mock_poll, mock_parse_target, mock_get_namespace, mock_with_ark_client):
        """Test chat completions without session ID."""
        # Setup mocks
        mock_get_namespace.return_value = "default"
        mock_parse_target.return_value = {"name": "test-agent", "type": "agent"}
        
        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        mock_client.queries.a_create = AsyncMock()
        
        mock_completion = Mock()
        mock_completion.id = "chatcmpl-test"
        mock_completion.object = "chat.completion"
        mock_completion.created = 1234567890
        mock_completion.model = "test-agent"
        mock_completion.choices = [Mock()]
        mock_completion.choices[0].message = Mock()
        mock_completion.choices[0].message.role = "assistant"
        mock_completion.choices[0].message.content = "Hello!"
        mock_completion.choices[0].finish_reason = "stop"
        mock_poll.return_value = mock_completion
        
        # Make the request without session ID
        request_data = {
            "model": "agent/test-agent",
            "messages": [{"role": "user", "content": "Hello"}]
        }
        response = self.client.post("/openai/v1/chat/completions", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        
        # Verify that a_create was called with a query that doesn't have sessionId in spec
        mock_client.queries.a_create.assert_called_once()
        query_resource = mock_client.queries.a_create.call_args[0][0]
        # QueryV1alpha1 has a to_dict() method that returns the full structure
        query_dict = query_resource.to_dict()
        spec = query_dict.get('spec', {})
        # sessionId should not be present or be None/empty
        session_id = spec.get("sessionId")
        self.assertTrue(session_id is None or session_id == "")
    
    @patch('ark_api.api.v1.openai.with_ark_client')
    @patch('ark_api.api.v1.openai.get_namespace')
    @patch('ark_api.api.v1.openai.parse_model_to_query_target')
    @patch('ark_api.api.v1.openai.poll_query_completion')
    def test_chat_completions_with_session_id_and_other_annotations(self, mock_poll, mock_parse_target, mock_get_namespace, mock_with_ark_client):
        """Test chat completions with session ID and other annotations (e.g., A2A context ID)."""
        # Setup mocks
        mock_get_namespace.return_value = "default"
        mock_parse_target.return_value = {"name": "test-agent", "type": "agent"}
        
        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        mock_client.queries.a_create = AsyncMock()
        
        mock_completion = Mock()
        mock_completion.id = "chatcmpl-test"
        mock_completion.object = "chat.completion"
        mock_completion.created = 1234567890
        mock_completion.model = "test-agent"
        mock_completion.choices = [Mock()]
        mock_completion.choices[0].message = Mock()
        mock_completion.choices[0].message.role = "assistant"
        mock_completion.choices[0].message.content = "Hello!"
        mock_completion.choices[0].finish_reason = "stop"
        mock_poll.return_value = mock_completion
        
        # Make the request with session ID and A2A context ID
        request_data = {
            "model": "agent/test-agent",
            "messages": [{"role": "user", "content": "Hello"}],
            "metadata": {
                "queryAnnotations": json.dumps({
                    "sessionId": "test-session-123",
                    "ark.mckinsey.com/a2a-context-id": "a2a-context-456"
                })
            }
        }
        response = self.client.post("/openai/v1/chat/completions", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        
        # Verify that a_create was called with a query that has sessionId in spec
        mock_client.queries.a_create.assert_called_once()
        query_resource = mock_client.queries.a_create.call_args[0][0]
        # QueryV1alpha1 has a to_dict() method that returns the full structure
        query_dict = query_resource.to_dict()
        spec = query_dict.get('spec', {})
        self.assertEqual(spec.get("sessionId"), "test-session-123")
        # Verify that A2A context ID is in metadata annotations (not in spec)
        metadata = query_dict.get('metadata', {})
        self.assertIn("annotations", metadata)
        self.assertEqual(metadata["annotations"]["ark.mckinsey.com/a2a-context-id"], "a2a-context-456")
    
    @patch('ark_api.api.v1.openai.with_ark_client')
    @patch('ark_api.api.v1.openai.get_namespace')
    @patch('ark_api.api.v1.openai.parse_model_to_query_target')
    @patch('ark_api.api.v1.openai.poll_query_completion')
    def test_chat_completions_with_invalid_query_annotations(self, mock_poll, mock_parse_target, mock_get_namespace, mock_with_ark_client):
        """Test chat completions with invalid queryAnnotations JSON."""
        # Setup mocks
        mock_get_namespace.return_value = "default"
        mock_parse_target.return_value = {"name": "test-agent", "type": "agent"}
        
        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        mock_client.queries.a_create = AsyncMock()
        
        mock_completion = Mock()
        mock_completion.id = "chatcmpl-test"
        mock_completion.object = "chat.completion"
        mock_completion.created = 1234567890
        mock_completion.model = "test-agent"
        mock_completion.choices = [Mock()]
        mock_completion.choices[0].message = Mock()
        mock_completion.choices[0].message.role = "assistant"
        mock_completion.choices[0].message.content = "Hello!"
        mock_completion.choices[0].finish_reason = "stop"
        mock_poll.return_value = mock_completion
        
        # Make the request with invalid JSON in queryAnnotations
        request_data = {
            "model": "agent/test-agent",
            "messages": [{"role": "user", "content": "Hello"}],
            "metadata": {
                "queryAnnotations": "invalid json {"
            }
        }
        response = self.client.post("/openai/v1/chat/completions", json=request_data)
        
        # Assert response - should still succeed but without sessionId
        self.assertEqual(response.status_code, 200)
        
        # Verify that a_create was called with a query that doesn't have sessionId
        mock_client.queries.a_create.assert_called_once()
        query_resource = mock_client.queries.a_create.call_args[0][0]
        # QueryV1alpha1 has a to_dict() method that returns the full structure
        query_dict = query_resource.to_dict()
        spec = query_dict.get('spec', {})
        # sessionId should not be present or be None/empty
        session_id = spec.get("sessionId")
        self.assertTrue(session_id is None or session_id == "")

