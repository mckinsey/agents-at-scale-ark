"""Tests for API routes."""
import unittest
import unittest.mock
from unittest.mock import Mock, patch, AsyncMock
from fastapi.testclient import TestClient
from kubernetes_asyncio.client.rest import ApiException

from ark_api.main import app


class TestNamespacesEndpoint(unittest.TestCase):
    """Test cases for the /namespaces endpoint."""
    
    def setUp(self):
        """Set up test client."""
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
    

class TestSecretsEndpoint(unittest.TestCase):
    """Test cases for the /namespaces/{namespace}/secrets endpoint."""
    
    def setUp(self):
        """Set up test client."""
        self.client = TestClient(app)
    
    @patch('ark_api.api.v1.secrets.ApiClient')
    @patch('ark_api.api.v1.secrets.client.CoreV1Api')
    def test_list_secrets_success(self, mock_v1_api, mock_api_client):
        """Test successful secret listing."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Mock secret objects
        mock_secret1 = Mock()
        mock_secret1.metadata.name = "my-secret"
        mock_secret1.metadata.uid = "uuid-1234-5678"
        mock_secret1.metadata.annotations = {}
        
        mock_secret2 = Mock()
        mock_secret2.metadata.name = "app-config"
        mock_secret2.metadata.uid = "uuid-abcd-efgh"
        mock_secret2.metadata.annotations = {}
        
        # Mock the API response
        mock_api_instance = mock_v1_api.return_value
        mock_response = Mock()
        mock_response.items = [mock_secret1, mock_secret2]
        mock_api_instance.list_namespaced_secret = AsyncMock(return_value=mock_response)
        
        # Make the request
        response = self.client.get("/v1/namespaces/default/secrets")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 2)
        self.assertEqual(len(data["items"]), 2)
        
        # Check first secret
        self.assertEqual(data["items"][0]["name"], "my-secret")
        self.assertEqual(data["items"][0]["id"], "uuid-1234-5678")
        
        # Check second secret
        self.assertEqual(data["items"][1]["name"], "app-config")
        self.assertEqual(data["items"][1]["id"], "uuid-abcd-efgh")
        
        # Verify namespace parameter was passed correctly
        mock_api_instance.list_namespaced_secret.assert_called_once_with("default")
    
    @patch('ark_api.api.v1.secrets.ApiClient')
    @patch('ark_api.api.v1.secrets.client.CoreV1Api')
    def test_list_secrets_empty(self, mock_v1_api, mock_api_client):
        """Test listing secrets when none exist in the namespace."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Mock empty response
        mock_api_instance = mock_v1_api.return_value
        mock_response = Mock()
        mock_response.items = []
        mock_api_instance.list_namespaced_secret = AsyncMock(return_value=mock_response)
        
        # Make the request
        response = self.client.get("/v1/namespaces/empty-namespace/secrets")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 0)
        self.assertEqual(data["items"], [])
        
        # Verify namespace parameter was passed correctly
        mock_api_instance.list_namespaced_secret.assert_called_once_with("empty-namespace")
    
    @patch('ark_api.api.v1.secrets.ApiClient')
    @patch('ark_api.api.v1.secrets.client.CoreV1Api')
    def test_list_secrets_kubernetes_api_error(self, mock_v1_api, mock_api_client):
        """Test handling of Kubernetes API errors."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Mock API exception for namespace not found
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.list_namespaced_secret = AsyncMock(side_effect=ApiException(
            status=404,
            reason="Not Found"
        ))
        
        # Make the request
        response = self.client.get("/v1/namespaces/nonexistent/secrets")
        
        # Assert response
        self.assertEqual(response.status_code, 404)
        data = response.json()
        self.assertIn("Kubernetes API error", data["detail"])
        self.assertIn("Not Found", data["detail"])
    
    @patch('ark_api.api.v1.secrets.ApiClient')
    @patch('ark_api.api.v1.secrets.client.CoreV1Api')
    def test_list_secrets_forbidden_error(self, mock_v1_api, mock_api_client):
        """Test handling of forbidden access errors."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Mock API exception for forbidden access
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.list_namespaced_secret = AsyncMock(side_effect=ApiException(
            status=403,
            reason="Forbidden"
        ))
        
        # Make the request
        response = self.client.get("/v1/namespaces/restricted-namespace/secrets")
        
        # Assert response
        self.assertEqual(response.status_code, 403)
        data = response.json()
        self.assertIn("Kubernetes API error", data["detail"])
        self.assertIn("Forbidden", data["detail"])
    
    @patch('ark_api.api.v1.secrets.ApiClient')
    @patch('ark_api.api.v1.secrets.client.CoreV1Api')
    def test_list_secrets_with_special_characters_in_namespace(self, mock_v1_api, mock_api_client):
        """Test listing secrets with special characters in namespace name."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Mock response with secrets
        mock_secret = Mock()
        mock_secret.metadata.name = "secret-in-special-namespace"
        mock_secret.metadata.uid = "uuid-special"
        mock_secret.metadata.annotations = {}
        
        mock_api_instance = mock_v1_api.return_value
        mock_response = Mock()
        mock_response.items = [mock_secret]
        mock_api_instance.list_namespaced_secret = AsyncMock(return_value=mock_response)
        
        # Make the request with special characters in namespace
        response = self.client.get("/v1/namespaces/test-namespace-123_prod/secrets")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["items"][0]["name"], "secret-in-special-namespace")
        
        # Verify namespace parameter was passed correctly
        mock_api_instance.list_namespaced_secret.assert_called_once_with("test-namespace-123_prod")


class TestSecretGetEndpoint(unittest.TestCase):
    """Test cases for the GET /namespaces/{namespace}/secrets/{secret_name} endpoint."""
    
    def setUp(self):
        """Set up test client."""
        self.client = TestClient(app)
    
    @patch('ark_api.api.v1.secrets.ApiClient')
    @patch('ark_api.api.v1.secrets.client.CoreV1Api')
    def test_get_secret_success(self, mock_v1_api, mock_api_client):
        """Test successfully retrieving a secret."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Mock the secret response
        mock_secret = Mock()
        mock_secret.metadata.name = "test-secret"
        mock_secret.metadata.uid = "uuid-12345"
        mock_secret.metadata.annotations = {}
        mock_secret.type = "Opaque"
        mock_secret.data = {"token": "dGVzdC10b2tlbg=="}  # base64 encoded "test-token"
        
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.read_namespaced_secret = AsyncMock(return_value=mock_secret)
        
        # Make the request
        response = self.client.get("/v1/namespaces/default/secrets/test-secret")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "test-secret")
        self.assertEqual(data["id"], "uuid-12345")
        self.assertEqual(data["type"], "Opaque")
        self.assertEqual(data["secret_length"], 10)  # length of "test-token"


class TestSecretCreateEndpoint(unittest.TestCase):
    """Test cases for the POST /namespaces/{namespace}/secrets endpoint."""
    
    def setUp(self):
        """Set up test client."""
        self.client = TestClient(app)
    
    @patch('ark_api.api.v1.secrets.ApiClient')
    @patch('ark_api.api.v1.secrets.client.CoreV1Api')
    def test_create_secret_success(self, mock_v1_api, mock_api_client):
        """Test successful secret creation with token."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Mock the created secret response
        mock_secret = Mock()
        mock_secret.metadata.name = "test-secret"
        mock_secret.metadata.uid = "uuid-12345"
        mock_secret.metadata.annotations = {"ark.mckinsey.com/dashboard-icon": "icons/gemini.png"}
        mock_secret.type = "Opaque"
        mock_secret.data = {"token": "dGVzdC10b2tlbg=="}  # base64 encoded "test-token"
        
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.create_namespaced_secret = AsyncMock(return_value=mock_secret)
        
        # Make the request
        request_data = {
            "name": "test-secret",
            "string_data": {"token": "test-token"}
        }
        response = self.client.post("/v1/namespaces/default/secrets", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "test-secret")
        self.assertEqual(data["id"], "uuid-12345")
        self.assertEqual(data["type"], "Opaque")
        self.assertEqual(data["secret_length"], 10)  # length of "test-token"
        self.assertEqual(data["annotations"], {"ark.mckinsey.com/dashboard-icon": "icons/gemini.png"})
        
        # Verify the secret was created with base64 encoded token
        create_call = mock_api_instance.create_namespaced_secret.call_args
        created_secret = create_call[1]['body']
        self.assertEqual(created_secret.string_data["token"], "test-token")
    
    @patch('ark_api.api.v1.secrets.ApiClient')
    @patch('ark_api.api.v1.secrets.client.CoreV1Api')
    def test_create_secret_with_already_base64_token(self, mock_v1_api, mock_api_client):
        """Test creating secret with already base64 encoded token."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Mock the created secret response
        mock_secret = Mock()
        mock_secret.metadata.name = "test-secret"
        mock_secret.metadata.uid = "uuid-12345"
        mock_secret.metadata.annotations = {}
        mock_secret.type = "Opaque"
        mock_secret.data = {"token": "YWxyZWFkeS1lbmNvZGVk"}  # already base64
        
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.create_namespaced_secret = AsyncMock(return_value=mock_secret)
        
        # Make the request with already base64 encoded token
        request_data = {
            "name": "test-secret",
            "string_data": {"token": "YWxyZWFkeS1lbmNvZGVk"}  # already base64
        }
        response = self.client.post("/v1/namespaces/default/secrets", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        
        # Verify the token was not double-encoded
        create_call = mock_api_instance.create_namespaced_secret.call_args
        created_secret = create_call[1]['body']
        self.assertEqual(created_secret.string_data["token"], "already-encoded")
    
    def test_create_secret_invalid_fields(self):
        """Test creating secret with invalid fields."""
        # Make the request with additional fields
        request_data = {
            "name": "test-secret",
            "string_data": {
                "token": "test-token",
                "password": "should-not-be-allowed"
            }
        }
        response = self.client.post("/v1/namespaces/default/secrets", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn("Only 'token' field is allowed", data["detail"])
        self.assertIn("password", data["detail"])
    
    def test_create_secret_empty_data(self):
        """Test creating secret with empty string_data."""
        # Make the request with empty data
        request_data = {
            "name": "test-secret",
            "string_data": {}
        }
        response = self.client.post("/v1/namespaces/default/secrets", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertEqual(data["detail"], "Secret data cannot be empty")
    
    @patch('ark_api.api.v1.secrets.ApiClient')
    @patch('ark_api.api.v1.secrets.client.CoreV1Api')
    def test_create_secret_kubernetes_conflict(self, mock_v1_api, mock_api_client):
        """Test handling of Kubernetes conflict error."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Mock API exception
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.create_namespaced_secret = AsyncMock(side_effect=ApiException(
            status=409,
            reason="Conflict"
        ))
        
        # Make the request
        request_data = {
            "name": "existing-secret",
            "string_data": {"token": "test-token"}
        }
        response = self.client.post("/v1/namespaces/default/secrets", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 409)
        data = response.json()
        self.assertIn("already exists", data["detail"])


class TestSecretUpdateEndpoint(unittest.TestCase):
    """Test cases for the PUT /namespaces/{namespace}/secrets/{secret_name} endpoint."""
    
    def setUp(self):
        """Set up test client."""
        self.client = TestClient(app)
    
    @patch('ark_api.api.v1.secrets.ApiClient')
    @patch('ark_api.api.v1.secrets.client.CoreV1Api')
    def test_update_secret_success(self, mock_v1_api, mock_api_client):
        """Test successful secret update with token."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Mock the updated secret response
        mock_secret = Mock()
        mock_secret.metadata.name = "test-secret"
        mock_secret.metadata.uid = "uuid-12345"
        mock_secret.metadata.annotations = {}
        mock_secret.type = "Opaque"
        mock_secret.data = {"token": "bmV3LXRva2Vu"}  # base64 encoded "new-token"
        
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.patch_namespaced_secret = AsyncMock(return_value=mock_secret)
        
        # Make the request
        request_data = {
            "string_data": {"token": "new-token"}
        }
        response = self.client.put("/v1/namespaces/default/secrets/test-secret", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "test-secret")
        self.assertEqual(data["id"], "uuid-12345")
        self.assertEqual(data["type"], "Opaque")
        self.assertEqual(data["secret_length"], 9)  # length of "new-token"
        
        # Verify the secret was updated with base64 encoded token
        patch_call = mock_api_instance.patch_namespaced_secret.call_args
        self.assertEqual(patch_call[1]['name'], "test-secret")
        self.assertEqual(patch_call[1]['namespace'], "default")
        patched_secret = patch_call[1]['body']
        self.assertEqual(patched_secret.string_data["token"], "new-token")
    
    def test_update_secret_invalid_fields(self):
        """Test updating secret with invalid fields."""
        # Make the request with additional fields
        request_data = {
            "string_data": {
                "token": "new-token",
                "apiKey": "should-not-be-allowed"
            }
        }
        response = self.client.put("/v1/namespaces/default/secrets/test-secret", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn("Only 'token' field is allowed", data["detail"])
        self.assertIn("apiKey", data["detail"])
    
    @patch('ark_api.api.v1.secrets.ApiClient')
    @patch('ark_api.api.v1.secrets.client.CoreV1Api')
    def test_update_secret_not_found(self, mock_v1_api, mock_api_client):
        """Test updating non-existent secret."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Mock API exception
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.patch_namespaced_secret = AsyncMock(side_effect=ApiException(
            status=404,
            reason="Not Found"
        ))
        
        # Make the request
        request_data = {
            "string_data": {"token": "new-token"}
        }
        response = self.client.put("/v1/namespaces/default/secrets/nonexistent", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 404)
        data = response.json()
        self.assertIn("not found", data["detail"])


class TestSecretDeleteEndpoint(unittest.TestCase):
    """Test cases for the DELETE /namespaces/{namespace}/secrets/{secret_name} endpoint."""
    
    def setUp(self):
        """Set up test client."""
        self.client = TestClient(app)
    
    @patch('ark_api.api.v1.secrets.ApiClient')
    @patch('ark_api.api.v1.secrets.client.CoreV1Api')
    def test_delete_secret_success(self, mock_v1_api, mock_api_client):
        """Test successful secret deletion."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Mock successful deletion (no return value)
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.delete_namespaced_secret = AsyncMock(return_value=None)
        
        # Make the request
        response = self.client.delete("/v1/namespaces/default/secrets/test-secret")
        
        # Assert response
        self.assertEqual(response.status_code, 204)
        
        # Verify the delete was called correctly
        mock_api_instance.delete_namespaced_secret.assert_called_once()
        delete_call = mock_api_instance.delete_namespaced_secret.call_args
        self.assertEqual(delete_call[1]['name'], "test-secret")
        self.assertEqual(delete_call[1]['namespace'], "default")
    
    @patch('ark_api.api.v1.secrets.ApiClient')
    @patch('ark_api.api.v1.secrets.client.CoreV1Api')
    def test_delete_secret_not_found(self, mock_v1_api, mock_api_client):
        """Test deleting non-existent secret."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Mock API exception
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.delete_namespaced_secret = AsyncMock(side_effect=ApiException(
            status=404,
            reason="Not Found"
        ))
        
        # Make the request
        response = self.client.delete("/v1/namespaces/default/secrets/nonexistent")
        
        # Assert response
        self.assertEqual(response.status_code, 404)
        data = response.json()
        self.assertIn("not found", data["detail"])
    
    @patch('ark_api.api.v1.secrets.ApiClient')
    @patch('ark_api.api.v1.secrets.client.CoreV1Api')
    def test_delete_secret_forbidden(self, mock_v1_api, mock_api_client):
        """Test deleting secret without permissions."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Mock API exception
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.delete_namespaced_secret = AsyncMock(side_effect=ApiException(
            status=403,
            reason="Forbidden"
        ))
        
        # Make the request
        response = self.client.delete("/v1/namespaces/restricted/secrets/protected-secret")
        
        # Assert response
        self.assertEqual(response.status_code, 403)
        data = response.json()
        self.assertIn("Kubernetes API error", data["detail"])
        self.assertIn("Forbidden", data["detail"])


class TestAgentsEndpoint(unittest.TestCase):
    """Test cases for the /namespaces/{namespace}/agents endpoint."""
    
    def setUp(self):
        """Set up test client."""
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
            "status": {"phase": "Ready"}
        }
        
        mock_agent2 = Mock()
        mock_agent2.to_dict.return_value = {
            "metadata": {"name": "another-agent", "namespace": "default"},
            "spec": {
                "description": "Another test agent",
                "prompt": "You are another assistant"
            },
            "status": {"phase": "pending"}
        }
        
        # Mock the API response
        mock_client.agents.a_list = AsyncMock(return_value=[mock_agent1, mock_agent2])
        
        # Make the request
        response = self.client.get("/v1/namespaces/default/agents")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 2)
        self.assertEqual(len(data["items"]), 2)
        
        # Check first agent
        self.assertEqual(data["items"][0]["name"], "test-agent")
        self.assertEqual(data["items"][0]["description"], "Test agent")
        self.assertEqual(data["items"][0]["model_ref"], "gpt-4")
        self.assertEqual(data["items"][0]["status"], "Ready")
        
        # Check second agent
        self.assertEqual(data["items"][1]["name"], "another-agent")
        self.assertEqual(data["items"][1]["description"], "Another test agent")
        self.assertIsNone(data["items"][1]["model_ref"])
        self.assertEqual(data["items"][1]["status"], "pending")
    
    @patch('ark_api.api.v1.agents.with_ark_client')
    def test_list_agents_empty(self, mock_ark_client):
        """Test listing agents when none exist in the namespace."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock empty response
        mock_client.agents.a_list = AsyncMock(return_value=[])
        
        # Make the request
        response = self.client.get("/v1/namespaces/test-namespace/agents")
        
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
        response = self.client.post("/v1/namespaces/default/agents", json=request_data)
        
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
        response = self.client.post("/v1/namespaces/default/agents", json=request_data)
        
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
        response = self.client.get("/v1/namespaces/default/agents/test-agent")
        
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
        response = self.client.put("/v1/namespaces/default/agents/test-agent", json=request_data)
        
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
        response = self.client.put("/v1/namespaces/default/agents/test-agent", json=request_data)
        
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
        response = self.client.delete("/v1/namespaces/default/agents/test-agent")
        
        # Assert response
        self.assertEqual(response.status_code, 204)
        
        # Verify the delete was called correctly
        mock_client.agents.a_delete.assert_called_once_with("test-agent")


class TestModelsEndpoint(unittest.TestCase):
    """Test cases for the /namespaces/{namespace}/models endpoint."""
    
    def setUp(self):
        """Set up test client."""
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
            "status": {"phase": "Ready"}
        }
        
        mock_model2 = Mock()
        mock_model2.to_dict.return_value = {
            "metadata": {"name": "claude-model", "namespace": "default"},
            "spec": {
                "type": "bedrock",
                "model": {"value": "anthropic.claude-v2"}
            },
            "status": {"phase": "pending"}
        }
        
        # Mock the API response
        mock_client.models.a_list = AsyncMock(return_value=[mock_model1, mock_model2])
        
        # Make the request
        response = self.client.get("/v1/namespaces/default/models")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 2)
        self.assertEqual(len(data["items"]), 2)
        
        # Check first model
        self.assertEqual(data["items"][0]["name"], "gpt-4-model")
        self.assertEqual(data["items"][0]["type"], "openai")
        self.assertEqual(data["items"][0]["model"], "gpt-4")
        self.assertEqual(data["items"][0]["status"], "Ready")
        
        # Check second model
        self.assertEqual(data["items"][1]["name"], "claude-model")
        self.assertEqual(data["items"][1]["type"], "bedrock")
        self.assertEqual(data["items"][1]["model"], "anthropic.claude-v2")
        self.assertEqual(data["items"][1]["status"], "pending")
    
    @patch('ark_api.api.v1.models.with_ark_client')
    def test_list_models_empty(self, mock_ark_client):
        """Test listing models when none exist in the namespace."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock empty response
        mock_client.models.a_list = AsyncMock(return_value=[])
        
        # Make the request
        response = self.client.get("/v1/namespaces/test-namespace/models")
        
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
                "type": "openai",
                "model": {"value": "gpt-4"},
                "config": {
                    "openai": {
                        "apiKey": {"value": "sk-test"},
                        "baseUrl": {"value": "https://api.openai.com/v1"}
                    }
                }
            },
            "status": {"phase": "pending"}
        }
        
        mock_client.models.a_create = AsyncMock(return_value=mock_model)
        
        # Make the request
        request_data = {
            "name": "gpt-4-model",
            "type": "openai",
            "model": "gpt-4",
            "config": {
                "openai": {
                    "apiKey": "sk-test",
                    "baseUrl": "https://api.openai.com/v1"
                }
            }
        }
        response = self.client.post("/v1/namespaces/default/models", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "gpt-4-model")
        self.assertEqual(data["type"], "openai")
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
                "type": "azure",
                "model": {"value": "gpt-35-turbo"},
                "config": {
                    "azure": {
                        "apiKey": {"value": "test-key"},
                        "baseUrl": {"value": "https://test.openai.azure.com"},
                        "apiVersion": {"value": "2023-05-15"}
                    }
                }
            },
            "status": {"phase": "pending"}
        }
        
        mock_client.models.a_create = AsyncMock(return_value=mock_model)
        
        # Make the request
        request_data = {
            "name": "azure-gpt",
            "type": "azure",
            "model": "gpt-35-turbo",
            "config": {
                "azure": {
                    "apiKey": "test-key",
                    "baseUrl": "https://test.openai.azure.com",
                    "apiVersion": "2023-05-15"
                }
            }
        }
        response = self.client.post("/v1/namespaces/default/models", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "azure-gpt")
        self.assertEqual(data["type"], "azure")
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
                "type": "bedrock",
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
            },
            "status": {"phase": "pending"}
        }
        
        mock_client.models.a_create = AsyncMock(return_value=mock_model)
        
        # Make the request
        request_data = {
            "name": "claude-bedrock",
            "type": "bedrock",
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
        response = self.client.post("/v1/namespaces/default/models", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "claude-bedrock")
        self.assertEqual(data["type"], "bedrock")
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
                "type": "openai",
                "model": {"value": "gpt-4"},
                "config": {
                    "openai": {
                        "apiKey": {"valueFrom": {"secretKeyRef": {"name": "openai-secret", "key": "api-key"}}},
                        "baseUrl": {"value": "https://api.openai.com/v1"}
                    }
                }
            },
            "status": {
                "phase": "Ready",
                "resolvedAddress": "https://api.openai.com/v1"
            }
        }
        
        mock_client.models.a_get = AsyncMock(return_value=mock_model)
        
        # Make the request
        response = self.client.get("/v1/namespaces/default/models/gpt-4-model")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "gpt-4-model")
        self.assertEqual(data["type"], "openai")
        self.assertEqual(data["model"], "gpt-4")
        self.assertEqual(data["status"], "Ready")
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
                "type": "openai",
                "model": {"value": "gpt-3.5-turbo"},
                "config": {
                    "openai": {
                        "apiKey": {"value": "old-key"},
                        "baseUrl": {"value": "https://api.openai.com/v1"}
                    }
                }
            },
            "status": {"phase": "Ready"}
        }
        
        # Mock updated model
        updated_model = Mock()
        updated_model.to_dict.return_value = {
            "metadata": {"name": "gpt-model", "namespace": "default"},
            "spec": {
                "type": "openai",
                "model": {"value": "gpt-4"},
                "config": {
                    "openai": {
                        "apiKey": {"value": "new-key"},
                        "baseUrl": {"value": "https://api.openai.com/v1"}
                    }
                }
            },
            "status": {"phase": "Ready"}
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
        response = self.client.put("/v1/namespaces/default/models/gpt-model", json=request_data)
        
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
                "type": "openai",
                "model": {"value": "gpt-3.5-turbo"},
                "config": {
                    "openai": {
                        "apiKey": {"value": "test-key"},
                        "baseUrl": {"value": "https://api.openai.com/v1"}
                    }
                }
            },
            "status": {"phase": "Ready"}
        }
        
        # Mock updated model
        updated_model = Mock()
        updated_model.to_dict.return_value = {
            "metadata": {"name": "gpt-model", "namespace": "default"},
            "spec": {
                "type": "openai",
                "model": {"value": "gpt-4"},
                "config": {
                    "openai": {
                        "apiKey": {"value": "test-key"},
                        "baseUrl": {"value": "https://api.openai.com/v1"}
                    }
                }
            },
            "status": {"phase": "Ready"}
        }
        
        mock_client.models.a_get = AsyncMock(return_value=existing_model)
        mock_client.models.a_update = AsyncMock(return_value=updated_model)
        
        # Make the request - only update model
        request_data = {"model": "gpt-4"}
        response = self.client.put("/v1/namespaces/default/models/gpt-model", json=request_data)
        
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
        response = self.client.delete("/v1/namespaces/default/models/gpt-model")
        
        # Assert response
        self.assertEqual(response.status_code, 204)
        
        # Verify the delete was called correctly
        mock_client.models.a_delete.assert_called_once_with("gpt-model")


class TestQueriesEndpoint(unittest.TestCase):
    """Test cases for the /namespaces/{namespace}/queries endpoint."""
    
    def setUp(self):
        """Set up test client."""
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
            "status": {"phase": "done", "response": "It's sunny and 72°F"}
        }
        
        mock_query2 = Mock()
        mock_query2.to_dict.return_value = {
            "metadata": {"name": "another-query", "namespace": "default"},
            "spec": {
                "input": "Tell me a joke"
            },
            "status": {"phase": "running"}
        }
        
        # Mock the API response
        mock_client.queries.a_list = AsyncMock(return_value=[mock_query1, mock_query2])
        
        # Make the request
        response = self.client.get("/v1/namespaces/default/queries")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 2)
        self.assertEqual(len(data["items"]), 2)
        
        # Check first query
        self.assertEqual(data["items"][0]["name"], "test-query")
        self.assertEqual(data["items"][0]["input"], "What is the weather today?")
        self.assertEqual(data["items"][0]["status"]["phase"], "done")
        
        # Check second query
        self.assertEqual(data["items"][1]["name"], "another-query")
        self.assertEqual(data["items"][1]["input"], "Tell me a joke")
        self.assertEqual(data["items"][1]["status"]["phase"], "running")
    
    @patch('ark_api.api.v1.queries.with_ark_client')
    def test_list_queries_empty(self, mock_ark_client):
        """Test listing queries when none exist in the namespace."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock empty response
        mock_client.queries.a_list = AsyncMock(return_value=[])
        
        # Make the request
        response = self.client.get("/v1/namespaces/test-namespace/queries")
        
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
        response = self.client.post("/v1/namespaces/default/queries", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "simple-query")
        self.assertEqual(data["input"], "What is 2+2?")
    
    @patch('ark_api.api.v1.queries.with_ark_client')
    def test_create_query_with_targets(self, mock_ark_client):
        """Test creating a query with targets."""
        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        # Mock the created query response
        mock_query = Mock()
        mock_query.to_dict.return_value = {
            "metadata": {"name": "targeted-query", "namespace": "default"},
            "spec": {
                "input": "Analyze this code",
                "targets": [
                    {"name": "code-analyzer", "type": "agent"},
                    {"name": "gpt-4", "type": "model"}
                ]
            },
            "status": {"phase": "pending"}
        }
        
        mock_client.queries.a_create = AsyncMock(return_value=mock_query)
        
        # Make the request
        request_data = {
            "name": "targeted-query",
            "input": "Analyze this code",
            "targets": [
                {"name": "code-analyzer", "type": "agent"},
                {"name": "gpt-4", "type": "model"}
            ]
        }
        response = self.client.post("/v1/namespaces/default/queries", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "targeted-query")
        self.assertEqual(len(data["targets"]), 2)
        self.assertEqual(data["targets"][0]["name"], "code-analyzer")
        self.assertEqual(data["targets"][0]["type"], "agent")
    
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
                "targets": [{"name": "assistant", "type": "agent"}]
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
            "targets": [{"name": "assistant", "type": "agent"}]
        }
        response = self.client.post("/v1/namespaces/default/queries", json=request_data)
        
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
                "targets": [{"name": "philosopher", "type": "agent"}]
            },
            "status": {
                "phase": "done",
                "response": "42"
            }
        }
        
        mock_client.queries.a_get = AsyncMock(return_value=mock_query)
        
        # Make the request
        response = self.client.get("/v1/namespaces/default/queries/test-query")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "test-query")
        self.assertEqual(data["input"], "What is the meaning of life?")
        self.assertEqual(data["status"]["phase"], "done")
        self.assertEqual(data["status"]["response"], "42")
    
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
        response = self.client.put("/v1/namespaces/default/queries/test-query", json=request_data)
        
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
        response = self.client.put("/v1/namespaces/default/queries/test-query", json=request_data)
        
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
        response = self.client.delete("/v1/namespaces/default/queries/test-query")
        
        # Assert response
        self.assertEqual(response.status_code, 204)
        
        # Verify the delete was called correctly
        mock_client.queries.a_delete.assert_called_once_with("test-query")


class TestTeamsEndpoint(unittest.TestCase):
    """Test cases for the /namespaces/{namespace}/teams endpoint."""
    
    def setUp(self):
        """Set up test client."""
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
        response = self.client.get("/v1/namespaces/default/teams")
        
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
        response = self.client.get("/v1/namespaces/test-namespace/teams")
        
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
        response = self.client.post("/v1/namespaces/default/teams", json=request_data)
        
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
        response = self.client.post("/v1/namespaces/default/teams", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "graph-team")
        self.assertEqual(data["strategy"], "graph")
        self.assertEqual(len(data["graph"]["edges"]), 2)
        self.assertEqual(data["graph"]["edges"][0]["from_"], "planner")
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
                    "model": "gpt-4",
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
                "model": "gpt-4",
                "selectorPrompt": "Choose the best agent for the task"
            }
        }
        response = self.client.post("/v1/namespaces/default/teams", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "full-team")
        self.assertEqual(data["maxTurns"], 10)
        self.assertEqual(data["selector"]["model"], "gpt-4")
        self.assertEqual(data["selector"]["selectorPrompt"], "Choose the best agent for the task")
    
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
        response = self.client.get("/v1/namespaces/default/teams/dev-team")
        
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
        response = self.client.put("/v1/namespaces/default/teams/test-team", json=request_data)
        
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
        response = self.client.put("/v1/namespaces/default/teams/test-team", json=request_data)
        
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
        response = self.client.delete("/v1/namespaces/default/teams/test-team")
        
        # Assert response
        self.assertEqual(response.status_code, 204)
        
        # Verify the delete was called correctly
        mock_client.teams.a_delete.assert_called_once_with("test-team")