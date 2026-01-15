"""Tests for OpenAI-compatible API endpoints."""
import os
import unittest.mock
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
import json
from openai.types.chat import ChatCompletion, ChatCompletionMessage
from openai.types.chat.chat_completion import Choice
from openai.types.completion_usage import CompletionUsage

# Set environment variable to skip authentication before importing the app
os.environ["AUTH_MODE"] = "open"

mock_completion = ChatCompletion(
    id="chatcmpl-test",
    object="chat.completion",
    created=1234567890,
    model="test-agent",
    choices=[
        Choice(
            index=0,
            message=ChatCompletionMessage(role="assistant", content="Hello!"),
            finish_reason="stop",
        )
    ],
    usage=CompletionUsage(
        prompt_tokens=10,
        completion_tokens=5,
        total_tokens=15,
    ),
)

class TestOpenAIChatCompletions(unittest.TestCase):
    """Test cases for the /openai/v1/chat/completions endpoint."""
    
    def setUp(self):
        """Set up test client."""
        from ark_api.main import app
        self.client = TestClient(app)
    
    @patch('ark_api.api.v1.openai.with_ark_client')
    @patch('ark_api.api.v1.openai.get_namespace')
    @patch('ark_api.api.v1.openai.parse_model_to_query_target')
    @patch('ark_api.api.v1.openai.watch_query_completion')
    def test_chat_completions_with_metadata(self, mock_watch, mock_parse_target, mock_get_namespace, mock_with_ark_client):
        """Test chat completions with metadata fields (sessionId, timeout)."""
        # Setup mocks
        mock_get_namespace.return_value = "default"
        mock_parse_target.return_value = {"name": "test-agent", "type": "agent"}
        
        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        mock_client.queries.a_create = AsyncMock()
        mock_watch.return_value = mock_completion
        
        request_data = {
            "model": "agent/test-agent",
            "messages": [{"role": "user", "content": "Hello"}],
            "metadata": {
                "sessionId": "test-session-123",
                "timeout": "1h"
            }
        }
        response = self.client.post("/openai/v1/chat/completions", json=request_data)

        self.assertEqual(response.status_code, 200)

        mock_client.queries.a_create.assert_called_once()
        query_resource = mock_client.queries.a_create.call_args[0][0]
        spec_dict = query_resource.spec.to_dict() if hasattr(query_resource.spec, 'to_dict') else query_resource.spec.__dict__
        session_id = spec_dict.get('sessionId') or spec_dict.get('session_id') or getattr(query_resource.spec, 'session_id', None) or getattr(query_resource.spec, 'sessionId', None)
        self.assertEqual(session_id, "test-session-123")
        timeout = spec_dict.get('timeout') or getattr(query_resource.spec, 'timeout', None)
        self.assertEqual(timeout, "1h")

    @patch('ark_api.api.v1.openai.with_ark_client')
    @patch('ark_api.api.v1.openai.get_namespace')
    @patch('ark_api.api.v1.openai.parse_model_to_query_target')
    @patch('ark_api.api.v1.openai.watch_query_completion')
    def test_chat_completions_with_tool_calls(self, mock_watch, mock_parse_target, mock_get_namespace,
                                              mock_with_ark_client):
        """Test chat completions with tool calls"""
        # Setup mocks
        mock_get_namespace.return_value = "default"
        mock_parse_target.return_value = {"name": "test-agent", "type": "agent"}

        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        mock_client.queries.a_create = AsyncMock()
        mock_watch.return_value = mock_completion

        request_json = {
            "model": "agent/test-agent",
            "messages": [{"role": "user", "content": "Hello"},
                         {"role": "assistant", "content": "Hi",
                          "tool_calls": [{"id": "call_1",
                                          "type": "function",
                                          "function": {"arguments": '{"message":"Saying hi."}', "name": "noop"}}]},
                         {"role": "tool", "tool_call_id": "call_1", "content": "Called tool"}],
            "metadata": {
                "sessionId": "test-session-123",
                "timeout": "1h"
            }
        }
        response = self.client.post("/openai/v1/chat/completions", json=request_json)

        self.assertEqual(response.status_code, 200)

        mock_client.queries.a_create.assert_called_once()
        query_resource = mock_client.queries.a_create.call_args[0][0]
        spec_dict = query_resource.spec.to_dict() if hasattr(query_resource.spec,
                                                             'to_dict') else query_resource.spec.__dict__
        session_id = spec_dict.get('sessionId') or spec_dict.get('session_id') or getattr(query_resource.spec,
                                                                                          'session_id',
                                                                                          None) or getattr(
            query_resource.spec, 'sessionId', None)
        self.assertEqual(session_id, "test-session-123")
        timeout = spec_dict.get('timeout') or getattr(query_resource.spec, 'timeout', None)
        self.assertEqual(timeout, "1h")

    @patch('ark_api.api.v1.openai.with_ark_client')
    @patch('ark_api.api.v1.openai.get_namespace')
    @patch('ark_api.api.v1.openai.parse_model_to_query_target')
    @patch('ark_api.api.v1.openai.watch_query_completion')
    def test_chat_completions_without_session_id(self, mock_watch, mock_parse_target, mock_get_namespace, mock_with_ark_client):
        """Test chat completions without session ID."""
        # Setup mocks
        mock_get_namespace.return_value = "default"
        mock_parse_target.return_value = {"name": "test-agent", "type": "agent"}
        
        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        mock_client.queries.a_create = AsyncMock()
        mock_watch.return_value = mock_completion
        
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
        # Access spec directly - sessionId should be None or not set
        session_id = getattr(query_resource.spec, 'sessionId', None)
        self.assertTrue(session_id is None or session_id == "")
    
    @patch('ark_api.api.v1.openai.with_ark_client')
    @patch('ark_api.api.v1.openai.get_namespace')
    @patch('ark_api.api.v1.openai.parse_model_to_query_target')
    @patch('ark_api.api.v1.openai.watch_query_completion')
    def test_chat_completions_with_session_id_and_other_annotations(self, mock_watch, mock_parse_target, mock_get_namespace, mock_with_ark_client):
        """Test chat completions with session ID and other annotations (e.g., A2A context ID)."""
        # Setup mocks
        mock_get_namespace.return_value = "default"
        mock_parse_target.return_value = {"name": "test-agent", "type": "agent"}
        
        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        mock_client.queries.a_create = AsyncMock()
        mock_watch.return_value = mock_completion
        
        # Make the request with session ID directly in metadata and A2A context ID in queryAnnotations
        request_data = {
            "model": "agent/test-agent",
            "messages": [{"role": "user", "content": "Hello"}],
            "metadata": {
                "sessionId": "test-session-123",
                "queryAnnotations": json.dumps({
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
        # Access spec - check both attribute access and dictionary representation
        spec_dict = query_resource.spec.to_dict() if hasattr(query_resource.spec, 'to_dict') else query_resource.spec.__dict__
        session_id = spec_dict.get('sessionId') or spec_dict.get('session_id') or getattr(query_resource.spec, 'session_id', None) or getattr(query_resource.spec, 'sessionId', None)
        self.assertEqual(session_id, "test-session-123")
        # Verify that A2A context ID is in metadata annotations (not in spec)
        # Metadata is a dict, so access it directly
        self.assertIn("annotations", query_resource.metadata)
        self.assertEqual(query_resource.metadata["annotations"]["ark.mckinsey.com/a2a-context-id"], "a2a-context-456")
    
    @patch('ark_api.api.v1.openai.with_ark_client')
    @patch('ark_api.api.v1.openai.get_namespace')
    @patch('ark_api.api.v1.openai.parse_model_to_query_target')
    @patch('ark_api.api.v1.openai.watch_query_completion')
    def test_chat_completions_with_invalid_query_annotations(self, mock_watch, mock_parse_target, mock_get_namespace, mock_with_ark_client):
        """Test chat completions with invalid queryAnnotations JSON."""
        # Setup mocks
        mock_get_namespace.return_value = "default"
        mock_parse_target.return_value = {"name": "test-agent", "type": "agent"}
        
        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        mock_client.queries.a_create = AsyncMock()
        mock_watch.return_value = mock_completion
        
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
        # Access spec directly - sessionId should be None or not set
        session_id = getattr(query_resource.spec, 'sessionId', None)
        self.assertTrue(session_id is None or session_id == "")

    @patch('ark_api.api.v1.openai.with_ark_client')
    @patch('ark_api.api.v1.openai.get_namespace')
    @patch('ark_api.api.v1.openai.parse_model_to_query_target')
    @patch('ark_api.api.v1.openai.watch_query_completion')
    def test_chat_completions_with_conversation_id(self, mock_watch, mock_parse_target, mock_get_namespace, mock_with_ark_client):
        """Test chat completions with conversationId for memory continuity."""
        mock_get_namespace.return_value = "default"
        mock_parse_target.return_value = {"name": "test-agent", "type": "agent"}

        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        mock_client.queries.a_create = AsyncMock()
        mock_watch.return_value = mock_completion

        request_data = {
            "model": "agent/test-agent",
            "messages": [{"role": "user", "content": "Hello"}],
            "metadata": {
                "sessionId": "test-session-123",
                "conversationId": "conv-456-789"
            }
        }
        response = self.client.post("/openai/v1/chat/completions", json=request_data)

        self.assertEqual(response.status_code, 200)

        mock_client.queries.a_create.assert_called_once()
        query_resource = mock_client.queries.a_create.call_args[0][0]
        spec_dict = query_resource.spec.to_dict() if hasattr(query_resource.spec, 'to_dict') else query_resource.spec.__dict__
        session_id = spec_dict.get('sessionId') or spec_dict.get('session_id') or getattr(query_resource.spec, 'session_id', None) or getattr(query_resource.spec, 'sessionId', None)
        conversation_id = spec_dict.get('conversationId') or spec_dict.get('conversation_id') or getattr(query_resource.spec, 'conversation_id', None) or getattr(query_resource.spec, 'conversationId', None)
        self.assertEqual(session_id, "test-session-123")
        self.assertEqual(conversation_id, "conv-456-789")

