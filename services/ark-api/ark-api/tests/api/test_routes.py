"""Tests for API routes."""
import os
import unittest
import unittest.mock
from unittest.mock import Mock, patch, AsyncMock
from fastapi.testclient import TestClient

# Set environment variable to skip authentication before importing the app
os.environ["AUTH_MODE"] = "open"


class TestNamespacesEndpoint(unittest.TestCase):
    """Test cases for the /namespaces endpoint."""
    
    def setUp(self):
        """Set up test client."""
        from ark_api.main import app
        self.client = TestClient(app)
    
    @patch('ark_api.api.v1.namespaces.ApiClient')
    @patch('ark_api.api.v1.namespaces.client.CoreV1Api')
    def test_list_namespaces_success(self, mock_v1_api, mock_api_client):
        """Test successful namespace listing."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Mock namespace objects
        mock_namespace1 = Mock()
        mock_namespace1.metadata.name = "default"
        
        mock_namespace2 = Mock()
        mock_namespace2.metadata.name = "kube-system"
        
        # Mock the API response
        mock_api_instance = mock_v1_api.return_value
        mock_response = Mock()
        mock_response.items = [mock_namespace1, mock_namespace2]
        mock_api_instance.list_namespace = AsyncMock(return_value=mock_response)
        
        # Make the request
        response = self.client.get("/v1/namespaces")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 2)
        self.assertEqual(len(data["items"]), 2)
        self.assertEqual(data["items"][0]["name"], "default")
        self.assertEqual(data["items"][1]["name"], "kube-system")


class TestDeleteEndpoints(unittest.TestCase):
    """Test cases for delete endpoints."""
    
    def setUp(self):
        """Set up test client."""
        from ark_api.main import app
        self.client = TestClient(app)
    
    @patch('ark_api.api.v1.agents.with_ark_client')
    def test_delete_agent_success(self, mock_with_ark_client):
        """Test successful agent deletion."""
        # Setup mock
        mock_client = AsyncMock()
        mock_client.agents.a_delete = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Make the request
        response = self.client.delete("/v1/agents/test-agent")
        
        # Assert response
        self.assertEqual(response.status_code, 204)
        mock_client.agents.a_delete.assert_called_once_with("test-agent")
    
    @patch('ark_api.api.v1.agents.with_ark_client')
    def test_delete_agent_not_found(self, mock_with_ark_client):
        """Test agent deletion when agent doesn't exist."""
        # Setup mock to raise exception
        mock_client = AsyncMock()
        mock_client.agents.a_delete = AsyncMock(side_effect=Exception("Agent not found"))
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Make the request
        response = self.client.delete("/v1/agents/nonexistent-agent")
        
        # Assert response
        self.assertEqual(response.status_code, 500)
    
    @patch('ark_api.api.v1.models.with_ark_client')
    def test_delete_model_success(self, mock_with_ark_client):
        """Test successful model deletion."""
        # Setup mock
        mock_client = AsyncMock()
        mock_client.models.a_delete = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Make the request
        response = self.client.delete("/v1/models/test-model")
        
        # Assert response
        self.assertEqual(response.status_code, 204)
        mock_client.models.a_delete.assert_called_once_with("test-model")
    
    @patch('ark_api.api.v1.tools.with_ark_client')
    def test_delete_tool_success(self, mock_with_ark_client):
        """Test successful tool deletion."""
        # Setup mock
        mock_client = AsyncMock()
        mock_client.tools.a_delete = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Make the request
        response = self.client.delete("/v1/tools/test-tool")
        
        # Assert response
        self.assertEqual(response.status_code, 204)
        mock_client.tools.a_delete.assert_called_once_with("test-tool")
    
    @patch('ark_api.api.v1.teams.with_ark_client')
    def test_delete_team_success(self, mock_with_ark_client):
        """Test successful team deletion."""
        # Setup mock
        mock_client = AsyncMock()
        mock_client.teams.a_delete = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Make the request
        response = self.client.delete("/v1/teams/test-team")
        
        # Assert response
        self.assertEqual(response.status_code, 204)
        mock_client.teams.a_delete.assert_called_once_with("test-team")
    
    @patch('ark_api.api.v1.queries.with_ark_client')
    def test_delete_query_success(self, mock_with_ark_client):
        """Test successful query deletion."""
        # Setup mock
        mock_client = AsyncMock()
        mock_client.queries.a_delete = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Make the request
        response = self.client.delete("/v1/queries/test-query")
        
        # Assert response
        self.assertEqual(response.status_code, 204)
        mock_client.queries.a_delete.assert_called_once_with("test-query")


class TestAPIKeyEndpoints(unittest.TestCase):
    """Test cases for API key management endpoints."""
    
    def setUp(self):
        """Set up test client."""
        from ark_api.main import app
        self.client = TestClient(app)
    
    @patch('ark_api.api.v1.api_keys.APIKeyService')
    def test_create_api_key_success(self, mock_api_key_service):
        """Test successful API key creation."""
        from datetime import datetime, timezone
        from ark_api.models.auth import APIKeyCreateResponse
        
        # Setup mock
        mock_service_instance = AsyncMock()
        mock_response = APIKeyCreateResponse(
            id="test-id",
            name="test-key",
            public_key="pk_test_123",
            secret_key="sk_test_456",
            created_at=datetime.now(timezone.utc),
            expires_at=None
        )
        mock_service_instance.create_api_key.return_value = mock_response
        mock_api_key_service.return_value = mock_service_instance
        
        # Make the request
        response = self.client.post(
            "/v1/api-keys",
            json={"name": "test-key", "description": "Test API key"}
        )
        
        # Assert response
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["public_key"], "pk_test_123")
        self.assertEqual(data["secret_key"], "sk_test_456")
        self.assertEqual(data["name"], "test-key")
    
    @patch('ark_api.api.v1.api_keys.APIKeyService')
    def test_list_api_keys_success(self, mock_api_key_service):
        """Test successful API key listing."""
        from datetime import datetime, timezone
        
        # Setup mock
        mock_service_instance = AsyncMock()
        mock_result = Mock()
        mock_result.count = 2
        mock_result.items = [
            {
                "id": "test-id-1",
                "public_key": "pk_test_123", 
                "name": "test-key-1", 
                "is_active": True,
                "created_at": datetime.now(timezone.utc),
                "last_used_at": None,
                "expires_at": None
            },
            {
                "id": "test-id-2",
                "public_key": "pk_test_456", 
                "name": "test-key-2", 
                "is_active": False,
                "created_at": datetime.now(timezone.utc),
                "last_used_at": None,
                "expires_at": None
            }
        ]
        mock_service_instance.list_api_keys.return_value = mock_result
        mock_api_key_service.return_value = mock_service_instance
        
        # Make the request
        response = self.client.get("/v1/api-keys")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["items"]), 2)
        self.assertEqual(data["items"][0]["name"], "test-key-1")
        self.assertEqual(data["items"][1]["name"], "test-key-2")
    
    @patch('ark_api.api.v1.api_keys.APIKeyService')
    def test_delete_api_key_success(self, mock_api_key_service):
        """Test successful API key deletion."""
        # Setup mock
        mock_service_instance = AsyncMock()
        mock_service_instance.delete_api_key.return_value = True
        mock_api_key_service.return_value = mock_service_instance
        
        # Make the request
        response = self.client.delete("/v1/api-keys/pk_test_123")
        
        # Assert response
        self.assertEqual(response.status_code, 204)
        mock_service_instance.delete_api_key.assert_called_once_with("pk_test_123")
    
    @patch('ark_api.api.v1.api_keys.APIKeyService')
    def test_delete_api_key_not_found(self, mock_api_key_service):
        """Test API key deletion when key doesn't exist."""
        # Setup mock
        mock_service_instance = AsyncMock()
        mock_service_instance.delete_api_key.return_value = False
        mock_api_key_service.return_value = mock_service_instance
        
        # Make the request
        response = self.client.delete("/v1/api-keys/nonexistent_key")
        
        # Assert response
        self.assertEqual(response.status_code, 404)
        data = response.json()
        self.assertIn("not found", data["detail"])


class TestSessionEndpoints(unittest.TestCase):
    """Test cases for session management endpoints."""
    
    def setUp(self):
        """Set up test client."""
        from ark_api.main import app
        self.client = TestClient(app)
    
    @patch('ark_api.api.v1.conversations.with_ark_client')
    @patch('ark_api.api.v1.conversations.get_all_memory_resources')
    @patch('ark_api.api.v1.conversations.httpx.AsyncClient')
    def test_delete_session_success(self, mock_httpx_client, mock_get_memory_resources, mock_with_ark_client):
        """Test successful session deletion."""
        # Setup mocks
        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        
        mock_get_memory_resources.return_value = [
            {
                "metadata": {"name": "test-memory"}, 
                "spec": {"service": {"name": "memory-service"}},
                "status": {"lastResolvedAddress": "http://memory-service:8080"}
            }
        ]
        
        mock_http_response = Mock()
        mock_http_response.status_code = 200
        mock_http_response.is_success = True
        mock_http_client_instance = AsyncMock()
        mock_http_client_instance.delete = AsyncMock(return_value=mock_http_response)
        mock_httpx_client.return_value.__aenter__.return_value = mock_http_client_instance
        
        # Make the request
        response = self.client.delete("/v1/conversations/test-session")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("deleted successfully from", data["message"])
        self.assertIn("memory service(s)", data["message"])
    
    @patch('ark_api.api.v1.conversations.with_ark_client')
    @patch('ark_api.api.v1.conversations.get_all_memory_resources')
    @patch('ark_api.api.v1.conversations.httpx.AsyncClient')
    def test_delete_all_sessions_success(self, mock_httpx_client, mock_get_memory_resources, mock_with_ark_client):
        """Test successful deletion of all sessions."""
        # Setup mocks
        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        
        mock_get_memory_resources.return_value = [
            {
                "metadata": {"name": "test-memory"}, 
                "spec": {"service": {"name": "memory-service"}},
                "status": {"lastResolvedAddress": "http://memory-service:8080"}
            }
        ]
        
        mock_http_response = Mock()
        mock_http_response.status_code = 200
        mock_http_response.is_success = True
        mock_http_client_instance = AsyncMock()
        mock_http_client_instance.delete.return_value = mock_http_response
        mock_httpx_client.return_value.__aenter__.return_value = mock_http_client_instance
        
        # Make the request
        response = self.client.delete("/v1/conversations")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("All conversations deleted successfully from", data["message"])
        self.assertIn("memory service(s)", data["message"])
    
    @patch('ark_api.api.v1.conversations.with_ark_client')
    @patch('ark_api.api.v1.conversations.get_all_memory_resources')
    @patch('ark_api.api.v1.conversations.httpx.AsyncClient')
    def test_delete_query_messages_success(self, mock_httpx_client, mock_get_memory_resources, mock_with_ark_client):
        """Test successful query message deletion."""
        # Setup mocks
        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        
        mock_get_memory_resources.return_value = [
            {
                "metadata": {"name": "test-memory"}, 
                "spec": {"service": {"name": "memory-service"}},
                "status": {"lastResolvedAddress": "http://memory-service:8080"}
            }
        ]
        
        mock_http_response = Mock()
        mock_http_response.status_code = 200
        mock_http_response.is_success = True
        mock_http_client_instance = AsyncMock()
        mock_http_client_instance.delete.return_value = mock_http_response
        mock_httpx_client.return_value.__aenter__.return_value = mock_http_client_instance
        
        # Make the request
        response = self.client.delete("/v1/conversations/test-session/queries/test-query/messages")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("messages deleted successfully", data["message"])
    
    @patch('ark_api.api.v1.conversations.with_ark_client')
    @patch('ark_api.api.v1.conversations.get_all_memory_resources')
    @patch('ark_api.api.v1.conversations.httpx.AsyncClient')
    def test_delete_session_all_services_unreachable(self, mock_httpx_client, mock_get_memory_resources, mock_with_ark_client):
        """Test session deletion when all memory services are unreachable (503)."""
        # Setup mocks
        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        
        mock_get_memory_resources.return_value = [
            {
                "metadata": {"name": "test-memory"}, 
                "spec": {"service": {"name": "memory-service"}},
                "status": {"lastResolvedAddress": "http://memory-service:8080"}
            }
        ]
        
        # Simulate network error
        mock_http_client_instance = AsyncMock()
        mock_http_client_instance.delete.side_effect = Exception("Connection refused")
        mock_httpx_client.return_value.__aenter__.return_value = mock_http_client_instance
        
        # Make the request
        response = self.client.delete("/v1/conversations/test-session")
        
        # Assert response
        self.assertEqual(response.status_code, 503)
        data = response.json()
        self.assertIn("Could not reach any memory services", data["detail"])
    
    @patch('ark_api.api.v1.conversations.with_ark_client')
    @patch('ark_api.api.v1.conversations.get_all_memory_resources')
    @patch('ark_api.api.v1.conversations.httpx.AsyncClient')
    def test_delete_session_multiple_services(self, mock_httpx_client, mock_get_memory_resources, mock_with_ark_client):
        """Test session deletion across multiple memory services."""
        # Setup mocks
        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        
        mock_get_memory_resources.return_value = [
            {
                "metadata": {"name": "test-memory-1"}, 
                "spec": {"service": {"name": "memory-service-1"}},
                "status": {"lastResolvedAddress": "http://memory-service-1:8080"}
            },
            {
                "metadata": {"name": "test-memory-2"}, 
                "spec": {"service": {"name": "memory-service-2"}},
                "status": {"lastResolvedAddress": "http://memory-service-2:8080"}
            }
        ]
        
        # Both services return 200
        mock_http_response = Mock()
        mock_http_response.status_code = 200
        mock_http_response.is_success = True
        mock_http_client_instance = AsyncMock()
        mock_http_client_instance.delete.return_value = mock_http_response
        mock_httpx_client.return_value.__aenter__.return_value = mock_http_client_instance
        
        # Make the request
        response = self.client.delete("/v1/conversations/test-session")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("deleted successfully from 2 memory service(s)", data["message"])
    
    @patch('ark_api.api.v1.conversations.with_ark_client')
    @patch('ark_api.api.v1.conversations.get_all_memory_resources')
    @patch('ark_api.api.v1.conversations.httpx.AsyncClient')
    def test_delete_session_database_error_500(self, mock_httpx_client, mock_get_memory_resources, mock_with_ark_client):
        """Test session deletion when database returns 500 error."""
        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        
        mock_get_memory_resources.return_value = [
            {
                "metadata": {"name": "test-memory"}, 
                "spec": {"service": {"name": "memory-service"}},
                "status": {"lastResolvedAddress": "http://memory-service:8080"}
            }
        ]
        
        mock_http_response = Mock()
        mock_http_response.status_code = 500
        mock_http_response.is_success = False
        mock_http_client_instance = AsyncMock()
        mock_http_client_instance.delete.return_value = mock_http_response
        mock_httpx_client.return_value.__aenter__.return_value = mock_http_client_instance
        
        response = self.client.delete("/v1/conversations/test-session")
        
        self.assertEqual(response.status_code, 500)
        data = response.json()
        self.assertIn("Failed to delete conversation", data["detail"])
        self.assertIn("database", data["detail"])
    
    @patch('ark_api.api.v1.conversations.with_ark_client')
    @patch('ark_api.api.v1.conversations.get_all_memory_resources')
    @patch('ark_api.api.v1.conversations.httpx.AsyncClient')
    def test_delete_session_idempotent_404(self, mock_httpx_client, mock_get_memory_resources, mock_with_ark_client):
        """Test session deletion when session is not found (404) - should succeed as idempotent."""
        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        
        mock_get_memory_resources.return_value = [
            {
                "metadata": {"name": "test-memory"}, 
                "spec": {"service": {"name": "memory-service"}},
                "status": {"lastResolvedAddress": "http://memory-service:8080"}
            }
        ]
        
        mock_http_response = Mock()
        mock_http_response.status_code = 404
        mock_http_response.is_success = False
        mock_http_client_instance = AsyncMock()
        mock_http_client_instance.delete.return_value = mock_http_response
        mock_httpx_client.return_value.__aenter__.return_value = mock_http_client_instance
        
        response = self.client.delete("/v1/conversations/test-session")
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("deleted successfully", data["message"])
    
    @patch('ark_api.api.v1.conversations.with_ark_client')
    @patch('ark_api.api.v1.conversations.get_all_memory_resources')
    @patch('ark_api.api.v1.conversations.httpx.AsyncClient')
    def test_delete_session_partial_failure(self, mock_httpx_client, mock_get_memory_resources, mock_with_ark_client):
        """Test session deletion when some services succeed and some fail."""
        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        
        mock_get_memory_resources.return_value = [
            {
                "metadata": {"name": "test-memory-1"}, 
                "spec": {"service": {"name": "memory-service-1"}},
                "status": {"lastResolvedAddress": "http://memory-service-1:8080"}
            },
            {
                "metadata": {"name": "test-memory-2"}, 
                "spec": {"service": {"name": "memory-service-2"}},
                "status": {"lastResolvedAddress": "http://memory-service-2:8080"}
            }
        ]
        
        call_count = [0]
        def side_effect(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                response = Mock()
                response.status_code = 200
                response.is_success = True
                return response
            else:
                raise Exception("Connection refused")
        
        mock_http_client_instance = AsyncMock()
        mock_http_client_instance.delete.side_effect = side_effect
        mock_httpx_client.return_value.__aenter__.return_value = mock_http_client_instance
        
        response = self.client.delete("/v1/conversations/test-session")
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("deleted successfully from 1 memory service(s)", data["message"])
    
    @patch('ark_api.api.v1.conversations.with_ark_client')
    @patch('ark_api.api.v1.conversations.get_all_memory_resources')
    def test_delete_session_no_memory_services(self, mock_get_memory_resources, mock_with_ark_client):
        """Test session deletion when no memory services are configured."""
        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        
        mock_get_memory_resources.return_value = []
        
        response = self.client.delete("/v1/conversations/test-session")
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("deleted successfully", data["message"])
        self.assertIn("0 memory service(s)", data["message"])
    
    @patch('ark_api.api.v1.conversations.with_ark_client')
    @patch('ark_api.api.v1.conversations.get_all_memory_resources')
    @patch('ark_api.api.v1.conversations.httpx.AsyncClient')
    def test_delete_all_sessions_database_error_500(self, mock_httpx_client, mock_get_memory_resources, mock_with_ark_client):
        """Test delete all sessions when database returns 500 error."""
        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        
        mock_get_memory_resources.return_value = [
            {
                "metadata": {"name": "test-memory"}, 
                "spec": {"service": {"name": "memory-service"}},
                "status": {"lastResolvedAddress": "http://memory-service:8080"}
            }
        ]
        
        mock_http_response = Mock()
        mock_http_response.status_code = 500
        mock_http_response.is_success = False
        mock_http_client_instance = AsyncMock()
        mock_http_client_instance.delete.return_value = mock_http_response
        mock_httpx_client.return_value.__aenter__.return_value = mock_http_client_instance
        
        response = self.client.delete("/v1/conversations")
        
        self.assertEqual(response.status_code, 500)
        data = response.json()
        self.assertIn("Failed to delete all conversations from database", data["detail"])
    
    @patch('ark_api.api.v1.conversations.with_ark_client')
    @patch('ark_api.api.v1.conversations.get_all_memory_resources')
    @patch('ark_api.api.v1.conversations.httpx.AsyncClient')
    def test_delete_all_sessions_all_unreachable(self, mock_httpx_client, mock_get_memory_resources, mock_with_ark_client):
        """Test delete all sessions when all memory services are unreachable."""
        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        
        mock_get_memory_resources.return_value = [
            {
                "metadata": {"name": "test-memory-1"}, 
                "spec": {"service": {"name": "memory-service-1"}},
                "status": {"lastResolvedAddress": "http://memory-service-1:8080"}
            },
            {
                "metadata": {"name": "test-memory-2"}, 
                "spec": {"service": {"name": "memory-service-2"}},
                "status": {"lastResolvedAddress": "http://memory-service-2:8080"}
            }
        ]
        
        mock_http_client_instance = AsyncMock()
        mock_http_client_instance.delete.side_effect = Exception("Connection refused")
        mock_httpx_client.return_value.__aenter__.return_value = mock_http_client_instance
        
        response = self.client.delete("/v1/conversations")
        
        self.assertEqual(response.status_code, 503)
        data = response.json()
        self.assertIn("Could not reach any memory services", data["detail"])
        self.assertIn("test-memory-1", data["detail"])
        self.assertIn("test-memory-2", data["detail"])
    
    @patch('ark_api.api.v1.conversations.with_ark_client')
    @patch('ark_api.api.v1.conversations.get_all_memory_resources')
    @patch('ark_api.api.v1.conversations.httpx.AsyncClient')
    def test_delete_all_sessions_multiple_services(self, mock_httpx_client, mock_get_memory_resources, mock_with_ark_client):
        """Test delete all sessions across multiple memory services."""
        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        
        mock_get_memory_resources.return_value = [
            {
                "metadata": {"name": "test-memory-1"}, 
                "spec": {"service": {"name": "memory-service-1"}},
                "status": {"lastResolvedAddress": "http://memory-service-1:8080"}
            },
            {
                "metadata": {"name": "test-memory-2"}, 
                "spec": {"service": {"name": "memory-service-2"}},
                "status": {"lastResolvedAddress": "http://memory-service-2:8080"}
            }
        ]
        
        mock_http_response = Mock()
        mock_http_response.status_code = 200
        mock_http_response.is_success = True
        mock_http_client_instance = AsyncMock()
        mock_http_client_instance.delete.return_value = mock_http_response
        mock_httpx_client.return_value.__aenter__.return_value = mock_http_client_instance
        
        response = self.client.delete("/v1/conversations")
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("deleted successfully from 2 memory service(s)", data["message"])
    
    @patch('ark_api.api.v1.conversations.with_ark_client')
    @patch('ark_api.api.v1.conversations.get_all_memory_resources')
    @patch('ark_api.api.v1.conversations.httpx.AsyncClient')
    def test_delete_query_messages_database_error_500(self, mock_httpx_client, mock_get_memory_resources, mock_with_ark_client):
        """Test query messages deletion when database returns 500 error."""
        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        
        mock_get_memory_resources.return_value = [
            {
                "metadata": {"name": "test-memory"}, 
                "spec": {"service": {"name": "memory-service"}},
                "status": {"lastResolvedAddress": "http://memory-service:8080"}
            }
        ]
        
        mock_http_response = Mock()
        mock_http_response.status_code = 500
        mock_http_response.is_success = False
        mock_http_client_instance = AsyncMock()
        mock_http_client_instance.delete.return_value = mock_http_response
        mock_httpx_client.return_value.__aenter__.return_value = mock_http_client_instance
        
        response = self.client.delete("/v1/conversations/test-session/queries/test-query/messages")
        
        self.assertEqual(response.status_code, 500)
        data = response.json()
        self.assertIn("Failed to delete query", data["detail"])
        self.assertIn("database", data["detail"])
    
    @patch('ark_api.api.v1.conversations.with_ark_client')
    @patch('ark_api.api.v1.conversations.get_all_memory_resources')
    @patch('ark_api.api.v1.conversations.httpx.AsyncClient')
    def test_delete_query_messages_all_unreachable(self, mock_httpx_client, mock_get_memory_resources, mock_with_ark_client):
        """Test query messages deletion when all memory services are unreachable."""
        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        
        mock_get_memory_resources.return_value = [
            {
                "metadata": {"name": "test-memory"}, 
                "spec": {"service": {"name": "memory-service"}},
                "status": {"lastResolvedAddress": "http://memory-service:8080"}
            }
        ]
        
        mock_http_client_instance = AsyncMock()
        mock_http_client_instance.delete.side_effect = Exception("Connection refused")
        mock_httpx_client.return_value.__aenter__.return_value = mock_http_client_instance
        
        response = self.client.delete("/v1/conversations/test-session/queries/test-query/messages")
        
        self.assertEqual(response.status_code, 503)
        data = response.json()
        self.assertIn("Could not reach any memory services", data["detail"])
    
    @patch('ark_api.api.v1.conversations.with_ark_client')
    @patch('ark_api.api.v1.conversations.get_all_memory_resources')
    @patch('ark_api.api.v1.conversations.httpx.AsyncClient')
    def test_delete_query_messages_multiple_services(self, mock_httpx_client, mock_get_memory_resources, mock_with_ark_client):
        """Test query messages deletion across multiple memory services."""
        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        
        mock_get_memory_resources.return_value = [
            {
                "metadata": {"name": "test-memory-1"}, 
                "spec": {"service": {"name": "memory-service-1"}},
                "status": {"lastResolvedAddress": "http://memory-service-1:8080"}
            },
            {
                "metadata": {"name": "test-memory-2"}, 
                "spec": {"service": {"name": "memory-service-2"}},
                "status": {"lastResolvedAddress": "http://memory-service-2:8080"}
            }
        ]
        
        mock_http_response = Mock()
        mock_http_response.status_code = 200
        mock_http_response.is_success = True
        mock_http_client_instance = AsyncMock()
        mock_http_client_instance.delete.return_value = mock_http_response
        mock_httpx_client.return_value.__aenter__.return_value = mock_http_client_instance
        
        response = self.client.delete("/v1/conversations/test-session/queries/test-query/messages")
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("deleted successfully from 2 memory service(s)", data["message"])


class TestAgentsEndpoint(unittest.TestCase):
    """Test cases for the /namespaces/{namespace}/agents endpoint."""
    
    def setUp(self):
        """Set up test client."""
        from ark_api.main import app
        self.client = TestClient(app)
    
    @patch('ark_api.api.v1.agents.with_ark_client')
    def test_list_agents_success(self, mock_ark_client):
        """Test successful agent listing."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock agent objects
        mock_agent1 = Mock()
        mock_agent1.to_dict.return_value = {
            "metadata": {"name": "test-agent", "namespace": "default"},
            "spec": {
                "description": "Test agent",
                "prompt": "You are a helpful assistant",
                "modelRef": {"name": "gpt-4"}
            },
            "status": {"conditions": [{"type": "Available", "status": "True"}]}
        }
        
        mock_agent2 = Mock()
        mock_agent2.to_dict.return_value = {
            "metadata": {"name": "another-agent", "namespace": "default"},
            "spec": {
                "description": "Another test agent",
                "prompt": "You are another assistant"
            },
            "status": {"conditions": [{"type": "Available", "status": "False"}]}
        }
        
        # Mock the API response
        mock_client.agents.a_list = AsyncMock(return_value=[mock_agent1, mock_agent2])
        
        # Make the request
        response = self.client.get("/v1/agents?namespace=default")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 2)
        self.assertEqual(len(data["items"]), 2)
        
        # Check first agent
        self.assertEqual(data["items"][0]["name"], "test-agent")
        self.assertEqual(data["items"][0]["description"], "Test agent")
        self.assertEqual(data["items"][0]["model_ref"], "gpt-4")
        self.assertEqual(data["items"][0]["available"], "True")

        # Check second agent
        self.assertEqual(data["items"][1]["name"], "another-agent")
        self.assertEqual(data["items"][1]["description"], "Another test agent")
        self.assertEqual(data["items"][1]["model_ref"], "default")
        self.assertEqual(data["items"][1]["available"], "False")
    
    @patch('ark_api.api.v1.agents.with_ark_client')
    def test_list_agents_empty(self, mock_ark_client):
        """Test listing agents when none exist in the namespace."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock empty response
        mock_client.agents.a_list = AsyncMock(return_value=[])
        
        # Make the request
        response = self.client.get("/v1/agents?namespace=test-namespace")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 0)
        self.assertEqual(data["items"], [])
    
    @patch('ark_api.api.v1.agents.with_ark_client')
    def test_create_agent_success(self, mock_ark_client):
        """Test successful agent creation."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock the created agent response
        mock_agent = Mock()
        mock_agent.to_dict.return_value = {
            "metadata": {"name": "new-agent", "namespace": "default"},
            "spec": {
                "description": "New test agent",
                "prompt": "You are a new assistant",
                "modelRef": {"name": "gpt-4"},
                "executionEngine": {"name": "langchain"},
                "parameters": [{"name": "temperature", "value": "0.7"}],
                "tools": [{"type": "built-in", "name": "calculator"}]
            },
            "status": {"phase": "pending"}
        }
        
        mock_client.agents.a_create = AsyncMock(return_value=mock_agent)
        
        # Make the request
        request_data = {
            "name": "new-agent",
            "description": "New test agent",
            "prompt": "You are a new assistant",
            "modelRef": {"name": "gpt-4"},
            "executionEngine": {"name": "langchain"},
            "parameters": [{"name": "temperature", "value": "0.7"}],
            "tools": [{"type": "built-in", "name": "calculator"}]
        }
        response = self.client.post("/v1/agents?namespace=default", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "new-agent")
        self.assertEqual(data["description"], "New test agent")
        self.assertEqual(data["prompt"], "You are a new assistant")
        self.assertEqual(data["modelRef"]["name"], "gpt-4")
        self.assertEqual(data["executionEngine"]["name"], "langchain")
        self.assertEqual(len(data["parameters"]), 1)
        self.assertEqual(data["parameters"][0]["name"], "temperature")
        self.assertEqual(len(data["tools"]), 1)
        self.assertEqual(data["tools"][0]["name"], "calculator")
    
    @patch('ark_api.api.v1.agents.with_ark_client')
    def test_create_agent_minimal(self, mock_ark_client):
        """Test agent creation with minimal fields."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock the created agent response
        mock_agent = Mock()
        mock_agent.to_dict.return_value = {
            "metadata": {"name": "minimal-agent", "namespace": "default"},
            "spec": {},
            "status": {"phase": "pending"}
        }
        
        mock_client.agents.a_create = AsyncMock(return_value=mock_agent)
        
        # Make the request with only required field
        request_data = {"name": "minimal-agent"}
        response = self.client.post("/v1/agents?namespace=default", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "minimal-agent")
        self.assertIsNone(data.get("description"))
        self.assertIsNone(data.get("prompt"))
    
    @patch('ark_api.api.v1.agents.with_ark_client')
    def test_get_agent_success(self, mock_ark_client):
        """Test successfully retrieving an agent."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock the agent response
        mock_agent = Mock()
        mock_agent.to_dict.return_value = {
            "metadata": {"name": "test-agent", "namespace": "default"},
            "spec": {
                "description": "Test agent",
                "prompt": "You are a helpful assistant",
                "modelRef": {"name": "gpt-4"}
            },
            "status": {
                "phase": "Ready",
                "conditions": [{"type": "Ready", "status": "True"}]
            }
        }
        
        mock_client.agents.a_get = AsyncMock(return_value=mock_agent)
        
        # Make the request
        response = self.client.get("/v1/agents/test-agent?namespace=default")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "test-agent")
        self.assertEqual(data["description"], "Test agent")
        self.assertEqual(data["prompt"], "You are a helpful assistant")
        self.assertEqual(data["modelRef"]["name"], "gpt-4")
        self.assertEqual(data["status"]["phase"], "Ready")
    
    @patch('ark_api.api.v1.agents.with_ark_client')
    def test_update_agent_success(self, mock_ark_client):
        """Test successful agent update."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock existing agent
        existing_agent = Mock()
        existing_agent.to_dict.return_value = {
            "metadata": {"name": "test-agent", "namespace": "default"},
            "spec": {
                "description": "Old description",
                "prompt": "Old prompt"
            },
            "status": {"phase": "Ready"}
        }
        
        # Mock updated agent
        updated_agent = Mock()
        updated_agent.to_dict.return_value = {
            "metadata": {"name": "test-agent", "namespace": "default"},
            "spec": {
                "description": "Updated description",
                "prompt": "Updated prompt",
                "modelRef": {"name": "gpt-4"}
            },
            "status": {"phase": "Ready"}
        }
        
        mock_client.agents.a_get = AsyncMock(return_value=existing_agent)
        mock_client.agents.a_update = AsyncMock(return_value=updated_agent)
        
        # Make the request
        request_data = {
            "description": "Updated description",
            "prompt": "Updated prompt",
            "modelRef": {"name": "gpt-4"}
        }
        response = self.client.put("/v1/agents/test-agent?namespace=default", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "test-agent")
        self.assertEqual(data["description"], "Updated description")
        self.assertEqual(data["prompt"], "Updated prompt")
        self.assertEqual(data["modelRef"]["name"], "gpt-4")
    
    @patch('ark_api.api.v1.agents.with_ark_client')
    def test_update_agent_partial(self, mock_ark_client):
        """Test partial agent update."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock existing agent
        existing_agent = Mock()
        existing_agent.to_dict.return_value = {
            "metadata": {"name": "test-agent", "namespace": "default"},
            "spec": {
                "description": "Original description",
                "prompt": "Original prompt",
                "modelRef": {"name": "gpt-3.5-turbo"}
            },
            "status": {"phase": "Ready"}
        }
        
        # Mock updated agent
        updated_agent = Mock()
        updated_agent.to_dict.return_value = {
            "metadata": {"name": "test-agent", "namespace": "default"},
            "spec": {
                "description": "Updated description only",
                "prompt": "Original prompt",
                "modelRef": {"name": "gpt-3.5-turbo"}
            },
            "status": {"phase": "Ready"}
        }
        
        mock_client.agents.a_get = AsyncMock(return_value=existing_agent)
        mock_client.agents.a_update = AsyncMock(return_value=updated_agent)
        
        # Make the request - only update description
        request_data = {"description": "Updated description only"}
        response = self.client.put("/v1/agents/test-agent?namespace=default", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["description"], "Updated description only")
        self.assertEqual(data["prompt"], "Original prompt")
        self.assertEqual(data["modelRef"]["name"], "gpt-3.5-turbo")
    
    @patch('ark_api.api.v1.agents.with_ark_client')
    def test_delete_agent_success(self, mock_ark_client):
        """Test successful agent deletion."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock successful deletion (no return value)
        mock_client.agents.a_delete = AsyncMock(return_value=None)
        
        # Make the request
        response = self.client.delete("/v1/agents/test-agent?namespace=default")
        
        # Assert response
        self.assertEqual(response.status_code, 204)
        
        # Verify the delete was called correctly
        mock_client.agents.a_delete.assert_called_once_with("test-agent")


class TestModelsEndpoint(unittest.TestCase):
    """Test cases for the /namespaces/{namespace}/models endpoint."""
    
    def setUp(self):
        """Set up test client."""
        from ark_api.main import app
        self.client = TestClient(app)
    
    @patch('ark_api.api.v1.models.with_ark_client')
    def test_list_models_success(self, mock_ark_client):
        """Test successful model listing."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock model objects
        mock_model1 = Mock()
        mock_model1.to_dict.return_value = {
            "metadata": {"name": "gpt-4-model", "namespace": "default"},
            "spec": {
                "type": "openai",
                "model": {"value": "gpt-4"}
            },
            "status": {"conditions": [
                {"type": "ModelAvailable", "status": "True"}
            ]}
        }
        
        mock_model2 = Mock()
        mock_model2.to_dict.return_value = {
            "metadata": {"name": "claude-model", "namespace": "default"},
            "spec": {
                "type": "bedrock",
                "model": {"value": "anthropic.claude-v2"}
            },
            "status": {"conditions": [
                {"type": "ModelAvailable", "status": "False"}
            ]}
        }
        
        # Mock the API response
        mock_client.models.a_list = AsyncMock(return_value=[mock_model1, mock_model2])
        
        # Make the request
        response = self.client.get("/v1/models?namespace=default")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 2)
        self.assertEqual(len(data["items"]), 2)
        
        # Check first model
        self.assertEqual(data["items"][0]["name"], "gpt-4-model")
        self.assertEqual(data["items"][0]["provider"], "openai")
        self.assertEqual(data["items"][0]["type"], "completions")
        self.assertEqual(data["items"][0]["model"], "gpt-4")
        self.assertEqual(data["items"][0]["available"], "True")

        # Check second model
        self.assertEqual(data["items"][1]["name"], "claude-model")
        self.assertEqual(data["items"][1]["provider"], "bedrock")
        self.assertEqual(data["items"][1]["type"], "completions")
        self.assertEqual(data["items"][1]["model"], "anthropic.claude-v2")
        self.assertEqual(data["items"][1]["available"], "False")
    
    @patch('ark_api.api.v1.models.with_ark_client')
    def test_list_models_empty(self, mock_ark_client):
        """Test listing models when none exist in the namespace."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock empty response
        mock_client.models.a_list = AsyncMock(return_value=[])
        
        # Make the request
        response = self.client.get("/v1/models?namespace=test-namespace")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 0)
        self.assertEqual(data["items"], [])
    
    @patch('ark_api.api.v1.models.with_ark_client')
    def test_create_model_openai_success(self, mock_ark_client):
        """Test successful OpenAI model creation."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock the created model response
        mock_model = Mock()
        mock_model.to_dict.return_value = {
            "metadata": {"name": "gpt-4-model", "namespace": "default"},
            "spec": {
                "type": "completions",
                "provider": "openai",
                "model": {"value": "gpt-4"},
                "config": {
                    "openai": {
                        "apiKey": {"value": "sk-test"},
                        "baseUrl": {"value": "https://api.openai.com/v1"}
                    }
                }
            }
        }

        mock_client.models.a_create = AsyncMock(return_value=mock_model)

        # Make the request
        request_data = {
            "name": "gpt-4-model",
            "provider": "openai",
            "model": "gpt-4",
            "config": {
                "openai": {
                    "apiKey": "sk-test",
                    "baseUrl": "https://api.openai.com/v1"
                }
            }
        }
        response = self.client.post("/v1/models?namespace=default", json=request_data)

        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "gpt-4-model")
        self.assertEqual(data["provider"], "openai")
        self.assertEqual(data["type"], "completions")
        self.assertEqual(data["model"], "gpt-4")
        self.assertEqual(data["config"]["openai"]["apiKey"]["value"], "sk-test")
        self.assertEqual(data["config"]["openai"]["baseUrl"]["value"], "https://api.openai.com/v1")
    
    @patch('ark_api.api.v1.models.with_ark_client')
    def test_create_model_azure_success(self, mock_ark_client):
        """Test successful Azure model creation."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client

        # Mock the created model response
        mock_model = Mock()
        mock_model.to_dict.return_value = {
            "metadata": {"name": "azure-gpt", "namespace": "default"},
            "spec": {
                "type": "completions",
                "provider": "azure",
                "model": {"value": "gpt-35-turbo"},
                "config": {
                    "azure": {
                        "apiKey": {"value": "test-key"},
                        "baseUrl": {"value": "https://test.openai.azure.com"},
                        "apiVersion": {"value": "2023-05-15"}
                    }
                }
            }
        }

        mock_client.models.a_create = AsyncMock(return_value=mock_model)

        # Make the request
        request_data = {
            "name": "azure-gpt",
            "provider": "azure",
            "model": "gpt-35-turbo",
            "config": {
                "azure": {
                    "apiKey": "test-key",
                    "baseUrl": "https://test.openai.azure.com",
                    "apiVersion": "2023-05-15"
                }
            }
        }
        response = self.client.post("/v1/models?namespace=default", json=request_data)

        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "azure-gpt")
        self.assertEqual(data["provider"], "azure")
        self.assertEqual(data["type"], "completions")
        self.assertEqual(data["config"]["azure"]["apiVersion"]["value"], "2023-05-15")
    
    @patch('ark_api.api.v1.models.with_ark_client')
    def test_create_model_bedrock_success(self, mock_ark_client):
        """Test successful Bedrock model creation."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client

        # Mock the created model response
        mock_model = Mock()
        mock_model.to_dict.return_value = {
            "metadata": {"name": "claude-bedrock", "namespace": "default"},
            "spec": {
                "type": "completions",
                "provider": "bedrock",
                "model": {"value": "anthropic.claude-v2"},
                "config": {
                    "bedrock": {
                        "region": {"value": "us-east-1"},
                        "accessKeyId": {"value": "AKIATEST"},
                        "secretAccessKey": {"value": "secret"},
                        "maxTokens": {"value": "1000"},
                        "temperature": {"value": "0.7"}
                    }
                }
            }
        }

        mock_client.models.a_create = AsyncMock(return_value=mock_model)

        # Make the request
        request_data = {
            "name": "claude-bedrock",
            "provider": "bedrock",
            "model": "anthropic.claude-v2",
            "config": {
                "bedrock": {
                    "region": "us-east-1",
                    "accessKeyId": "AKIATEST",
                    "secretAccessKey": "secret",
                    "maxTokens": 1000,
                    "temperature": "0.7"
                }
            }
        }
        response = self.client.post("/v1/models?namespace=default", json=request_data)

        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "claude-bedrock")
        self.assertEqual(data["provider"], "bedrock")
        self.assertEqual(data["type"], "completions")
        self.assertEqual(data["config"]["bedrock"]["region"]["value"], "us-east-1")
        self.assertEqual(data["config"]["bedrock"]["maxTokens"]["value"], "1000")
        self.assertEqual(data["config"]["bedrock"]["temperature"]["value"], "0.7")
    
    @patch('ark_api.api.v1.models.with_ark_client')
    def test_get_model_success(self, mock_ark_client):
        """Test successfully retrieving a model."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client

        # Mock the model response
        mock_model = Mock()
        mock_model.to_dict.return_value = {
            "metadata": {"name": "gpt-4-model", "namespace": "default"},
            "spec": {
                "type": "completions",
                "provider": "openai",
                "model": {"value": "gpt-4"},
                "config": {
                    "openai": {
                        "apiKey": {"valueFrom": {"secretKeyRef": {"name": "openai-secret", "key": "api-key"}}},
                        "baseUrl": {"value": "https://api.openai.com/v1"}
                    }
                }
            },
            "status": {
                "conditions": [
                    {"type": "ModelAvailable", "status": "True"}
                ],
                "resolvedAddress": "https://api.openai.com/v1"
            }
        }

        mock_client.models.a_get = AsyncMock(return_value=mock_model)

        # Make the request
        response = self.client.get("/v1/models/gpt-4-model?namespace=default")

        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "gpt-4-model")
        self.assertEqual(data["provider"], "openai")
        self.assertEqual(data["type"], "completions")
        self.assertEqual(data["model"], "gpt-4")
        self.assertEqual(data["available"], "True")
        self.assertEqual(data["resolved_address"], "https://api.openai.com/v1")
        self.assertIn("valueFrom", data["config"]["openai"]["apiKey"])
    
    @patch('ark_api.api.v1.models.with_ark_client')
    def test_update_model_success(self, mock_ark_client):
        """Test successful model update."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock existing model
        existing_model = Mock()
        existing_model.to_dict.return_value = {
            "metadata": {"name": "gpt-model", "namespace": "default"},
            "spec": {
                "provider": "openai",
                "type": "completions",
                "model": {"value": "gpt-3.5-turbo"},
                "config": {
                    "openai": {
                        "apiKey": {"value": "old-key"},
                        "baseUrl": {"value": "https://api.openai.com/v1"}
                    }
                }
            }
        }

        # Mock updated model
        updated_model = Mock()
        updated_model.to_dict.return_value = {
            "metadata": {"name": "gpt-model", "namespace": "default"},
            "spec": {
                "provider": "openai",
                "type": "completions",
                "model": {"value": "gpt-4"},
                "config": {
                    "openai": {
                        "apiKey": {"value": "new-key"},
                        "baseUrl": {"value": "https://api.openai.com/v1"}
                    }
                }
            }
        }

        mock_client.models.a_get = AsyncMock(return_value=existing_model)
        mock_client.models.a_update = AsyncMock(return_value=updated_model)

        # Make the request
        request_data = {
            "model": "gpt-4",
            "config": {
                "openai": {
                    "apiKey": "new-key",
                    "baseUrl": "https://api.openai.com/v1"
                }
            }
        }
        response = self.client.put("/v1/models/gpt-model?namespace=default", json=request_data)

        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "gpt-model")
        self.assertEqual(data["model"], "gpt-4")
        self.assertEqual(data["config"]["openai"]["apiKey"]["value"], "new-key")
    
    @patch('ark_api.api.v1.models.with_ark_client')
    def test_update_model_partial(self, mock_ark_client):
        """Test partial model update."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client

        # Mock existing model
        existing_model = Mock()
        existing_model.to_dict.return_value = {
            "metadata": {"name": "gpt-model", "namespace": "default"},
            "spec": {
                "provider": "openai",
                "type": "completions",
                "model": {"value": "gpt-3.5-turbo"},
                "config": {
                    "openai": {
                        "apiKey": {"value": "test-key"},
                        "baseUrl": {"value": "https://api.openai.com/v1"}
                    }
                }
            }
        }

        # Mock updated model
        updated_model = Mock()
        updated_model.to_dict.return_value = {
            "metadata": {"name": "gpt-model", "namespace": "default"},
            "spec": {
                "provider": "openai",
                "type": "completions",
                "model": {"value": "gpt-4"},
                "config": {
                    "openai": {
                        "apiKey": {"value": "test-key"},
                        "baseUrl": {"value": "https://api.openai.com/v1"}
                    }
                }
            }
        }

        mock_client.models.a_get = AsyncMock(return_value=existing_model)
        mock_client.models.a_update = AsyncMock(return_value=updated_model)

        # Make the request - only update model
        request_data = {"model": "gpt-4"}
        response = self.client.put("/v1/models/gpt-model?namespace=default", json=request_data)

        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["model"], "gpt-4")
        # Config should remain unchanged
        self.assertEqual(data["config"]["openai"]["apiKey"]["value"], "test-key")
    
    @patch('ark_api.api.v1.models.with_ark_client')
    def test_delete_model_success(self, mock_ark_client):
        """Test successful model deletion."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock successful deletion (no return value)
        mock_client.models.a_delete = AsyncMock(return_value=None)
        
        # Make the request
        response = self.client.delete("/v1/models/gpt-model?namespace=default")
        
        # Assert response
        self.assertEqual(response.status_code, 204)
        
        # Verify the delete was called correctly
        mock_client.models.a_delete.assert_called_once_with("gpt-model")


class TestQueriesEndpoint(unittest.TestCase):
    """Test cases for the /namespaces/{namespace}/queries endpoint."""
    
    def setUp(self):
        """Set up test client."""
        from ark_api.main import app
        self.client = TestClient(app)
    
    @patch('ark_api.api.v1.queries.with_ark_client')
    def test_list_queries_success(self, mock_ark_client):
        """Test successful query listing."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock query objects
        mock_query1 = Mock()
        mock_query1.to_dict.return_value = {
            "metadata": {"name": "test-query", "namespace": "default"},
            "spec": {
                "input": "What is the weather today?"
            },
            "status": {
                "phase": "done", 
                "response": "It's sunny and 72°F",
                "conditions": [
                    {
                        "type": "Completed",
                        "status": "True",
                        "reason": "QuerySucceeded",
                        "message": "Query completed successfully",
                        "lastTransitionTime": "2025-01-15T10:30:00Z",
                        "observedGeneration": 1
                    }
                ]
            }
        }
        
        mock_query2 = Mock()
        mock_query2.to_dict.return_value = {
            "metadata": {"name": "another-query", "namespace": "default"},
            "spec": {
                "input": "Tell me a joke"
            },
            "status": {
                "phase": "running",
                "conditions": [
                    {
                        "type": "Completed",
                        "status": "False",
                        "reason": "QueryRunning",
                        "message": "Query is currently running",
                        "lastTransitionTime": "2025-01-15T10:25:00Z",
                        "observedGeneration": 1
                    }
                ]
            }
        }
        
        # Mock the API response
        mock_client.queries.a_list = AsyncMock(return_value=[mock_query1, mock_query2])
        
        # Make the request
        response = self.client.get("/v1/queries?namespace=default")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 2)
        self.assertEqual(len(data["items"]), 2)
        
        # Check first query
        self.assertEqual(data["items"][0]["name"], "test-query")
        self.assertEqual(data["items"][0]["input"], "What is the weather today?")
        self.assertEqual(data["items"][0]["status"]["phase"], "done")
        # Check conditions field
        self.assertIn("conditions", data["items"][0]["status"])
        self.assertEqual(len(data["items"][0]["status"]["conditions"]), 1)
        self.assertEqual(data["items"][0]["status"]["conditions"][0]["type"], "Completed")
        self.assertEqual(data["items"][0]["status"]["conditions"][0]["status"], "True")
        self.assertEqual(data["items"][0]["status"]["conditions"][0]["reason"], "QuerySucceeded")
        
        # Check second query
        self.assertEqual(data["items"][1]["name"], "another-query")
        self.assertEqual(data["items"][1]["input"], "Tell me a joke")
        self.assertEqual(data["items"][1]["status"]["phase"], "running")
        # Check conditions field
        self.assertIn("conditions", data["items"][1]["status"])
        self.assertEqual(len(data["items"][1]["status"]["conditions"]), 1)
        self.assertEqual(data["items"][1]["status"]["conditions"][0]["type"], "Completed")
        self.assertEqual(data["items"][1]["status"]["conditions"][0]["status"], "False")
        self.assertEqual(data["items"][1]["status"]["conditions"][0]["reason"], "QueryRunning")
    
    @patch('ark_api.api.v1.queries.with_ark_client')
    def test_list_queries_empty(self, mock_ark_client):
        """Test listing queries when none exist in the namespace."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock empty response
        mock_client.queries.a_list = AsyncMock(return_value=[])
        
        # Make the request
        response = self.client.get("/v1/queries?namespace=test-namespace")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 0)
        self.assertEqual(data["items"], [])
    
    @patch('ark_api.api.v1.queries.with_ark_client')
    def test_create_query_simple(self, mock_ark_client):
        """Test creating a simple query."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock the created query response
        mock_query = Mock()
        mock_query.to_dict.return_value = {
            "metadata": {"name": "simple-query", "namespace": "default"},
            "spec": {
                "input": "What is 2+2?"
            },
            "status": {"phase": "pending"}
        }
        
        mock_client.queries.a_create = AsyncMock(return_value=mock_query)
        
        # Make the request
        request_data = {
            "name": "simple-query",
            "input": "What is 2+2?"
        }
        response = self.client.post("/v1/queries?namespace=default", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "simple-query")
        self.assertEqual(data["input"], "What is 2+2?")
    
    @patch('ark_api.api.v1.queries.with_ark_client')
    def test_create_query_with_targets(self, mock_ark_client):
        """Test creating a query with target."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client

        # Mock the created query response
        mock_query = Mock()
        mock_query.to_dict.return_value = {
            "metadata": {"name": "targeted-query", "namespace": "default"},
            "spec": {
                "input": "Analyze this code",
                "target": {"name": "code-analyzer", "type": "agent"}
            },
            "status": {"phase": "pending"}
        }

        mock_client.queries.a_create = AsyncMock(return_value=mock_query)

        # Make the request
        request_data = {
            "name": "targeted-query",
            "input": "Analyze this code",
            "target": {"name": "code-analyzer", "type": "agent"}
        }
        response = self.client.post("/v1/queries?namespace=default", json=request_data)

        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "targeted-query")
        self.assertEqual(data["target"]["name"], "code-analyzer")
        self.assertEqual(data["target"]["type"], "agent")
    
    @patch('ark_api.api.v1.queries.with_ark_client')
    def test_create_query_with_all_fields(self, mock_ark_client):
        """Test creating a query with all optional fields."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock the created query response
        mock_query = Mock()
        mock_query.to_dict.return_value = {
            "metadata": {"name": "full-query", "namespace": "default"},
            "spec": {
                "input": "Complex query with context",
                "memory": {"name": "conversation-history"},
                "parameters": [{"name": "user", "value": "john"}],
                "selector": {"matchLabels": {"app": "chatbot"}},
                "serviceAccount": "query-runner",
                "sessionId": "session-123",
                "target": {"name": "assistant", "type": "agent"}
            },
            "status": {"phase": "pending"}
        }

        mock_client.queries.a_create = AsyncMock(return_value=mock_query)

        # Make the request
        request_data = {
            "name": "full-query",
            "input": "Complex query with context",
            "memory": {"name": "conversation-history"},
            "parameters": [{"name": "user", "value": "john"}],
            "selector": {"matchLabels": {"app": "chatbot"}},
            "serviceAccount": "query-runner",
            "sessionId": "session-123",
            "target": {"name": "assistant", "type": "agent"}
        }
        response = self.client.post("/v1/queries?namespace=default", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "full-query")
        self.assertEqual(data["memory"]["name"], "conversation-history")
        self.assertEqual(data["parameters"][0]["name"], "user")
        self.assertEqual(data["selector"]["matchLabels"]["app"], "chatbot")
        self.assertEqual(data["serviceAccount"], "query-runner")
        self.assertEqual(data["sessionId"], "session-123")
    
    @patch('ark_api.api.v1.queries.with_ark_client')
    def test_get_query_success(self, mock_ark_client):
        """Test successfully retrieving a query."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock the query response
        mock_query = Mock()
        mock_query.to_dict.return_value = {
            "metadata": {"name": "test-query", "namespace": "default"},
            "spec": {
                "input": "What is the meaning of life?",
                "target": {"name": "philosopher", "type": "agent"}
            },
            "status": {
                "phase": "done",
                "response": "42",
                "conditions": [
                    {
                        "type": "Completed",
                        "status": "True",
                        "reason": "QuerySucceeded",
                        "message": "Query completed successfully",
                        "lastTransitionTime": "2025-01-15T10:30:00Z",
                        "observedGeneration": 1
                    }
                ]
            }
        }
        
        mock_client.queries.a_get = AsyncMock(return_value=mock_query)
        
        # Make the request
        response = self.client.get("/v1/queries/test-query?namespace=default")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "test-query")
        self.assertEqual(data["input"], "What is the meaning of life?")
        self.assertEqual(data["status"]["phase"], "done")
        self.assertEqual(data["status"]["response"], "42")
        # Check conditions field
        self.assertIn("conditions", data["status"])
        self.assertEqual(len(data["status"]["conditions"]), 1)
        self.assertEqual(data["status"]["conditions"][0]["type"], "Completed")
        self.assertEqual(data["status"]["conditions"][0]["status"], "True")
        self.assertEqual(data["status"]["conditions"][0]["reason"], "QuerySucceeded")
    
    @patch('ark_api.api.v1.queries.with_ark_client')
    def test_update_query_success(self, mock_ark_client):
        """Test successful query update."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock existing query
        existing_query = Mock()
        existing_query.to_dict.return_value = {
            "metadata": {"name": "test-query", "namespace": "default"},
            "spec": {
                "input": "Old question"
            },
            "status": {"phase": "done"}
        }
        # Need to add other attributes to avoid KeyError
        existing_query.metadata = {"name": "test-query", "namespace": "default"}
        existing_query.spec = existing_query.to_dict()["spec"]
        
        # Mock updated query
        updated_query = Mock()
        updated_query.to_dict.return_value = {
            "metadata": {"name": "test-query", "namespace": "default"},
            "spec": {
                "input": "New question",
                "sessionId": "new-session"
            },
            "status": {"phase": "pending"}
        }
        
        mock_client.queries.a_get = AsyncMock(return_value=existing_query)
        mock_client.queries.a_update = AsyncMock(return_value=updated_query)
        
        # Make the request
        request_data = {
            "input": "New question",
            "sessionId": "new-session"
        }
        response = self.client.put("/v1/queries/test-query?namespace=default", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "test-query")
        self.assertEqual(data["input"], "New question")
        self.assertEqual(data["sessionId"], "new-session")
    
    @patch('ark_api.api.v1.queries.with_ark_client')
    def test_update_query_partial(self, mock_ark_client):
        """Test partial query update."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock existing query
        existing_query = Mock()
        existing_query.to_dict.return_value = {
            "metadata": {"name": "test-query", "namespace": "default"},
            "spec": {
                "input": "Question",
                "memory": {"name": "old-memory"},
                "sessionId": "old-session"
            },
            "status": {"phase": "done"}
        }
        # Need to add other attributes to avoid KeyError
        existing_query.metadata = {"name": "test-query", "namespace": "default"}
        existing_query.spec = existing_query.to_dict()["spec"]
        
        # Mock updated query
        updated_query = Mock()
        updated_query.to_dict.return_value = {
            "metadata": {"name": "test-query", "namespace": "default"},
            "spec": {
                "input": "Question",
                "memory": {"name": "new-memory"},
                "sessionId": "old-session"
            },
            "status": {"phase": "pending"}
        }
        
        mock_client.queries.a_get = AsyncMock(return_value=existing_query)
        mock_client.queries.a_update = AsyncMock(return_value=updated_query)
        
        # Make the request - only update memory
        request_data = {"memory": {"name": "new-memory"}}
        response = self.client.put("/v1/queries/test-query?namespace=default", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["input"], "Question")  # Unchanged
        self.assertEqual(data["memory"]["name"], "new-memory")  # Updated
        self.assertEqual(data["sessionId"], "old-session")  # Unchanged
    
    @patch('ark_api.api.v1.queries.with_ark_client')
    def test_delete_query_success(self, mock_ark_client):
        """Test successful query deletion."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock successful deletion (no return value)
        mock_client.queries.a_delete = AsyncMock(return_value=None)
        
        # Make the request
        response = self.client.delete("/v1/queries/test-query?namespace=default")
        
        # Assert response
        self.assertEqual(response.status_code, 204)
        
        # Verify the delete was called correctly
        mock_client.queries.a_delete.assert_called_once_with("test-query")


class TestTeamsEndpoint(unittest.TestCase):
    """Test cases for the /namespaces/{namespace}/teams endpoint."""
    
    def setUp(self):
        """Set up test client."""
        from ark_api.main import app
        self.client = TestClient(app)
    
    @patch('ark_api.api.v1.teams.with_ark_client')
    def test_list_teams_success(self, mock_ark_client):
        """Test successful team listing."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock team objects
        mock_team1 = Mock()
        mock_team1.to_dict.return_value = {
            "metadata": {"name": "dev-team", "namespace": "default"},
            "spec": {
                "description": "Development team",
                "strategy": "sequential",
                "members": [
                    {"name": "frontend-dev", "type": "agent"},
                    {"name": "backend-dev", "type": "agent"}
                ]
            },
            "status": {"phase": "Ready"}
        }
        
        mock_team2 = Mock()
        mock_team2.to_dict.return_value = {
            "metadata": {"name": "research-team", "namespace": "default"},
            "spec": {
                "strategy": "parallel",
                "members": [{"name": "researcher", "type": "agent"}]
            },
            "status": {"phase": "pending"}
        }
        
        # Mock the API response
        mock_client.teams.a_list = AsyncMock(return_value=[mock_team1, mock_team2])
        
        # Make the request
        response = self.client.get("/v1/teams?namespace=default")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 2)
        self.assertEqual(len(data["items"]), 2)
        
        # Check first team
        self.assertEqual(data["items"][0]["name"], "dev-team")
        self.assertEqual(data["items"][0]["description"], "Development team")
        self.assertEqual(data["items"][0]["strategy"], "sequential")
        self.assertEqual(data["items"][0]["members_count"], 2)
        self.assertEqual(data["items"][0]["status"], "Ready")
        
        # Check second team
        self.assertEqual(data["items"][1]["name"], "research-team")
        self.assertEqual(data["items"][1]["strategy"], "parallel")
        self.assertEqual(data["items"][1]["members_count"], 1)
        self.assertEqual(data["items"][1]["status"], "pending")
    
    @patch('ark_api.api.v1.teams.with_ark_client')
    def test_list_teams_empty(self, mock_ark_client):
        """Test listing teams when none exist in the namespace."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock empty response
        mock_client.teams.a_list = AsyncMock(return_value=[])
        
        # Make the request
        response = self.client.get("/v1/teams?namespace=test-namespace")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 0)
        self.assertEqual(data["items"], [])
    
    @patch('ark_api.api.v1.teams.with_ark_client')
    def test_create_team_simple(self, mock_ark_client):
        """Test creating a simple team."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock the created team response
        mock_team = Mock()
        mock_team.to_dict.return_value = {
            "metadata": {"name": "simple-team", "namespace": "default"},
            "spec": {
                "members": [
                    {"name": "agent1", "type": "agent"},
                    {"name": "agent2", "type": "agent"}
                ],
                "strategy": "sequential"
            },
            "status": {"phase": "pending"}
        }
        
        mock_client.teams.a_create = AsyncMock(return_value=mock_team)
        
        # Make the request
        request_data = {
            "name": "simple-team",
            "members": [
                {"name": "agent1", "type": "agent"},
                {"name": "agent2", "type": "agent"}
            ],
            "strategy": "sequential"
        }
        response = self.client.post("/v1/teams?namespace=default", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "simple-team")
        self.assertEqual(len(data["members"]), 2)
        self.assertEqual(data["strategy"], "sequential")
    
    @unittest.skip("Skip due to SDK model issue with 'from' field aliasing")
    @patch('ark_api.api.v1.teams.with_ark_client')
    def test_create_team_with_graph(self, mock_ark_client):
        """Test creating a team with graph workflow."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock the created team response
        mock_team = Mock()
        mock_team.to_dict.return_value = {
            "metadata": {"name": "graph-team", "namespace": "default"},
            "spec": {
                "description": "Team with custom workflow",
                "members": [
                    {"name": "planner", "type": "agent"},
                    {"name": "executor", "type": "agent"},
                    {"name": "reviewer", "type": "agent"}
                ],
                "strategy": "graph",
                "graph": {
                    "edges": [
                        {"from": "planner", "to": "executor"},
                        {"from": "executor", "to": "reviewer"}
                    ]
                }
            },
            "status": {"phase": "pending"}
        }
        
        mock_client.teams.a_create = AsyncMock(return_value=mock_team)
        
        # Make the request
        request_data = {
            "name": "graph-team",
            "description": "Team with custom workflow",
            "members": [
                {"name": "planner", "type": "agent"},
                {"name": "executor", "type": "agent"},
                {"name": "reviewer", "type": "agent"}
            ],
            "strategy": "graph",
            "graph": {
                "edges": [
                    {"from": "planner", "to": "executor"},
                    {"from": "executor", "to": "reviewer"}
                ]
            }
        }
        response = self.client.post("/v1/teams?namespace=default", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "graph-team")
        self.assertEqual(data["strategy"], "graph")
        self.assertEqual(len(data["graph"]["edges"]), 2)
        self.assertEqual(data["graph"]["edges"][0]["from"], "planner")
        self.assertEqual(data["graph"]["edges"][0]["to"], "executor")
    
    @patch('ark_api.api.v1.teams.with_ark_client')
    def test_create_team_with_all_fields(self, mock_ark_client):
        """Test creating a team with all optional fields."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock the created team response
        mock_team = Mock()
        mock_team.to_dict.return_value = {
            "metadata": {"name": "full-team", "namespace": "default"},
            "spec": {
                "description": "Complete team configuration",
                "members": [{"name": "agent1", "type": "agent"}],
                "strategy": "selector",
                "maxTurns": 10,
                "selector": {
                    "agent": "selector-agent",
                    "selectorPrompt": "Choose the best agent for the task"
                }
            },
            "status": {"phase": "pending"}
        }

        mock_client.teams.a_create = AsyncMock(return_value=mock_team)

        # Make the request
        request_data = {
            "name": "full-team",
            "description": "Complete team configuration",
            "members": [{"name": "agent1", "type": "agent"}],
            "strategy": "selector",
            "maxTurns": 10,
            "selector": {
                "agent": "selector-agent",
                "selectorPrompt": "Choose the best agent for the task"
            }
        }
        response = self.client.post("/v1/teams?namespace=default", json=request_data)

        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "full-team")
        self.assertEqual(data["maxTurns"], 10)
        self.assertEqual(data["selector"]["agent"], "selector-agent")
        self.assertEqual(data["selector"]["selectorPrompt"], "Choose the best agent for the task")
    
    @patch('ark_api.api.v1.teams.with_ark_client')
    def test_create_team_with_selector_and_graph(self, mock_ark_client):
        """Test creating a team with selector strategy and graph constraints."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock the created team response
        mock_team = Mock()
        mock_team.to_dict.return_value = {
            "metadata": {"name": "graph-selector-team", "namespace": "default"},
            "spec": {
                "description": "Team with selector and graph constraints",
                "members": [
                    {"name": "researcher", "type": "agent"},
                    {"name": "analyzer", "type": "agent"},
                    {"name": "writer", "type": "agent"}
                ],
                "strategy": "selector",
                "selector": {
                    "agent": "coordinator",
                    "selectorPrompt": "Choose the next team member"
                },
                "graph": {
                    "edges": [
                        {"from": "researcher", "to": "analyzer"},
                        {"from": "analyzer", "to": "writer"}
                    ]
                },
                "maxTurns": 10
            },
            "status": {"phase": "pending"}
        }
        
        mock_client.teams.a_create = AsyncMock(return_value=mock_team)
        
        # Make the request
        request_data = {
            "name": "graph-selector-team",
            "description": "Team with selector and graph constraints",
            "members": [
                {"name": "researcher", "type": "agent"},
                {"name": "analyzer", "type": "agent"},
                {"name": "writer", "type": "agent"}
            ],
            "strategy": "selector",
            "selector": {
                "agent": "coordinator",
                "selectorPrompt": "Choose the next team member"
            },
            "graph": {
                "edges": [
                    {"from": "researcher", "to": "analyzer"},
                    {"from": "analyzer", "to": "writer"}
                ]
            },
            "maxTurns": 10
        }
        response = self.client.post("/v1/teams?namespace=default", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "graph-selector-team")
        self.assertEqual(data["strategy"], "selector")
        self.assertEqual(data["selector"]["agent"], "coordinator")
        self.assertEqual(len(data["graph"]["edges"]), 2)
        self.assertEqual(data["graph"]["edges"][0]["from"], "researcher")
        self.assertEqual(data["graph"]["edges"][0]["to"], "analyzer")
        self.assertEqual(data["maxTurns"], 10)
    
    @patch('ark_api.api.v1.teams.with_ark_client')
    def test_get_team_success(self, mock_ark_client):
        """Test successfully retrieving a team."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock the team response
        mock_team = Mock()
        mock_team.to_dict.return_value = {
            "metadata": {"name": "dev-team", "namespace": "default"},
            "spec": {
                "description": "Development team",
                "members": [
                    {"name": "frontend", "type": "agent"},
                    {"name": "backend", "type": "agent"}
                ],
                "strategy": "parallel"
            },
            "status": {
                "phase": "Ready",
                "conditions": [{"type": "Ready", "status": "True"}]
            }
        }
        
        mock_client.teams.a_get = AsyncMock(return_value=mock_team)
        
        # Make the request
        response = self.client.get("/v1/teams/dev-team?namespace=default")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "dev-team")
        self.assertEqual(data["description"], "Development team")
        self.assertEqual(len(data["members"]), 2)
        self.assertEqual(data["strategy"], "parallel")
        self.assertEqual(data["status"]["phase"], "Ready")
    
    @patch('ark_api.api.v1.teams.with_ark_client')
    def test_update_team_success(self, mock_ark_client):
        """Test successful team update."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock existing team
        existing_team = Mock()
        existing_team.to_dict.return_value = {
            "metadata": {"name": "test-team", "namespace": "default"},
            "spec": {
                "description": "Old description",
                "members": [{"name": "agent1", "type": "agent"}],
                "strategy": "sequential"
            },
            "status": {"phase": "Ready"}
        }
        
        # Mock updated team
        updated_team = Mock()
        updated_team.to_dict.return_value = {
            "metadata": {"name": "test-team", "namespace": "default"},
            "spec": {
                "description": "Updated description",
                "members": [
                    {"name": "agent1", "type": "agent"},
                    {"name": "agent2", "type": "agent"}
                ],
                "strategy": "parallel"
            },
            "status": {"phase": "Ready"}
        }
        
        mock_client.teams.a_get = AsyncMock(return_value=existing_team)
        mock_client.teams.a_update = AsyncMock(return_value=updated_team)
        
        # Make the request
        request_data = {
            "description": "Updated description",
            "members": [
                {"name": "agent1", "type": "agent"},
                {"name": "agent2", "type": "agent"}
            ],
            "strategy": "parallel"
        }
        response = self.client.put("/v1/teams/test-team?namespace=default", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "test-team")
        self.assertEqual(data["description"], "Updated description")
        self.assertEqual(len(data["members"]), 2)
        self.assertEqual(data["strategy"], "parallel")
    
    @patch('ark_api.api.v1.teams.with_ark_client')
    def test_update_team_partial(self, mock_ark_client):
        """Test partial team update."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock existing team
        existing_team = Mock()
        existing_team.to_dict.return_value = {
            "metadata": {"name": "test-team", "namespace": "default"},
            "spec": {
                "description": "Original description",
                "members": [{"name": "agent1", "type": "agent"}],
                "strategy": "sequential",
                "maxTurns": 5
            },
            "status": {"phase": "Ready"}
        }
        
        # Mock updated team
        updated_team = Mock()
        updated_team.to_dict.return_value = {
            "metadata": {"name": "test-team", "namespace": "default"},
            "spec": {
                "description": "Original description",
                "members": [{"name": "agent1", "type": "agent"}],
                "strategy": "sequential",
                "maxTurns": 10
            },
            "status": {"phase": "Ready"}
        }
        
        mock_client.teams.a_get = AsyncMock(return_value=existing_team)
        mock_client.teams.a_update = AsyncMock(return_value=updated_team)
        
        # Make the request - only update maxTurns
        request_data = {"maxTurns": 10}
        response = self.client.put("/v1/teams/test-team?namespace=default", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["description"], "Original description")  # Unchanged
        self.assertEqual(data["strategy"], "sequential")  # Unchanged
        self.assertEqual(data["maxTurns"], 10)  # Updated
    
    @patch('ark_api.api.v1.teams.with_ark_client')
    def test_delete_team_success(self, mock_ark_client):
        """Test successful team deletion."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock successful deletion (no return value)
        mock_client.teams.a_delete = AsyncMock(return_value=None)
        
        # Make the request
        response = self.client.delete("/v1/teams/test-team?namespace=default")
        
        # Assert response
        self.assertEqual(response.status_code, 204)
        
        # Verify the delete was called correctly
        mock_client.teams.a_delete.assert_called_once_with("test-team")
    
    @patch('ark_api.api.v1.teams.with_ark_client')
    def test_create_team_validation_error_from_webhook(self, mock_ark_client):
        """Test that admission webhook validation errors return 403 with proper error message."""
        from kubernetes.client.exceptions import ApiException as SyncApiException
        
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Create a realistic admission webhook error (403 from Kubernetes)
        webhook_error_body = '{"kind":"Status","apiVersion":"v1","metadata":{},"status":"Failure","message":"admission webhook \\"vteam-v1.kb.io\\" denied the request: graph strategy requires maxTurns to prevent infinite execution","reason":"Forbidden","code":403}'
        
        api_exception = SyncApiException(status=403, reason="Forbidden")
        api_exception.body = webhook_error_body
        
        # Wrap it like ark-sdk does
        wrapped_exception = Exception(f"Failed to create Team: {api_exception}")
        wrapped_exception.__cause__ = api_exception
        
        mock_client.teams.a_create = AsyncMock(side_effect=wrapped_exception)
        
        # Make the request (graph team without maxTurns)
        request_data = {
            "name": "invalid-graph-team",
            "members": [
                {"name": "agent1", "type": "agent"},
                {"name": "agent2", "type": "agent"}
            ],
            "strategy": "graph",
            "graph": {
                "edges": [{"from": "agent1", "to": "agent2"}]
            }
        }
        response = self.client.post("/v1/teams?namespace=default", json=request_data)
        
        # Assert that we get 403 (not 500) with the proper validation message
        self.assertEqual(response.status_code, 403)
        data = response.json()
        self.assertIn("graph strategy requires maxTurns", data["detail"])
        self.assertIn("admission webhook", data["detail"])