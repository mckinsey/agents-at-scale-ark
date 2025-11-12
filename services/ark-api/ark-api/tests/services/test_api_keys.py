"""Test cases for API key service."""

import unittest
from unittest.mock import Mock, patch, AsyncMock
from datetime import datetime, timezone, timedelta
import base64
import json

from ark_api.services.api_keys import APIKeyService, API_KEY_TYPE, API_KEY_ANNOTATION
from ark_api.models.auth import APIKeyCreateRequest


class TestAPIKeyService(unittest.TestCase):
    """Test API key service functionality."""
    
    @patch('ark_api.services.api_keys.get_context')
    def setUp(self, mock_get_context):
        """Set up test fixtures."""
        mock_get_context.return_value = {"namespace": "test-namespace", "cluster": "test"}
        self.service = APIKeyService()
    
    def test_generate_key_pair(self):
        """Test API key pair generation."""
        public_key, secret_key = self.service._generate_key_pair()
        
        self.assertTrue(public_key.startswith("pk-ark-"))
        self.assertTrue(secret_key.startswith("sk-ark-"))
        self.assertGreater(len(public_key), 10)
        self.assertGreater(len(secret_key), 10)
        self.assertNotEqual(public_key, secret_key)
    
    def test_hash_and_verify_secret_key(self):
        """Test secret key hashing and verification."""
        secret_key = "sk-ark-test-secret-key"
        
        # Hash the secret key
        hashed = self.service._hash_secret_key(secret_key)
        self.assertIsInstance(hashed, str)
        self.assertNotEqual(hashed, secret_key)
        
        # Verify the secret key
        self.assertTrue(self.service._verify_secret_key(secret_key, hashed))
        self.assertFalse(self.service._verify_secret_key("wrong-key", hashed))
    
    def test_secret_name_from_public_key(self):
        """Test generation of Kubernetes secret name from public key."""
        public_key = "pk-ark-abcd1234efgh5678"
        
        secret_name = self.service._secret_name_from_public_key(public_key)
        self.assertEqual(secret_name, "api-key-abcd1234efgh5678")
        
        # Test with uppercase characters (should be converted to lowercase)
        public_key_upper = "pk-ark-AbCd1234EfGh5678"
        secret_name_upper = self.service._secret_name_from_public_key(public_key_upper)
        self.assertEqual(secret_name_upper, "api-key-abcd1234efgh5678")
        
        # Test with underscores and multiple hyphens (should be sanitized)
        public_key_with_underscores = "pk-ark-test_key--with_underscores"
        secret_name_sanitized = self.service._secret_name_from_public_key(public_key_with_underscores)
        self.assertEqual(secret_name_sanitized, "api-key-test-key-with-underscores")
        
        # Test edge case with leading/trailing hyphens
        public_key_edge = "pk-ark--test-key-"
        secret_name_edge = self.service._secret_name_from_public_key(public_key_edge)
        self.assertEqual(secret_name_edge, "api-key-test-key")
        
        # Ensure it's a valid Kubernetes name (RFC 1123 compliant)
        # Must be lowercase, alphanumeric with hyphens, start/end with alphanumeric
        self.assertTrue(secret_name.islower())
        self.assertTrue(secret_name.replace("-", "").isalnum())
        self.assertTrue(secret_name[0].isalnum())
        self.assertTrue(secret_name[-1].isalnum())
        
        # Test all sanitized names are RFC 1123 compliant
        for name in [secret_name_sanitized, secret_name_edge]:
            self.assertTrue(name.islower())
            self.assertTrue(name[0].isalnum())
            self.assertTrue(name[-1].isalnum())
            # Should not contain underscores or multiple consecutive hyphens
            self.assertNotIn("_", name)
            self.assertNotIn("--", name)
    
    def test_datetime_formatting(self):
        """Test datetime parsing and formatting for annotations."""
        # Test formatting
        now = datetime.now(timezone.utc)
        formatted = self.service._format_datetime(now)
        self.assertIsInstance(formatted, str)
        self.assertIn("T", formatted)  # ISO format
        
        # Test parsing
        parsed = self.service._parse_datetime(formatted)
        self.assertIsInstance(parsed, datetime)
        self.assertLess(abs((parsed - now).total_seconds()), 1)  # Should be very close
        
        # Test None handling
        self.assertIsNone(self.service._format_datetime(None))
        self.assertIsNone(self.service._parse_datetime(None))
        self.assertIsNone(self.service._parse_datetime(""))
        self.assertIsNone(self.service._parse_datetime("invalid"))


class TestAPIKeyServiceIntegration(unittest.TestCase):
    """Integration tests for API key service with mocked Kubernetes client."""
    
    @patch('ark_api.services.api_keys.get_context')
    def setUp(self, mock_get_context):
        """Set up test fixtures."""
        mock_get_context.return_value = {"namespace": "test-namespace", "cluster": "test"}
        self.service = APIKeyService()
    
    @patch('ark_api.services.api_keys.ApiClient')
    @patch('ark_api.services.api_keys.client.CoreV1Api')
    async def test_create_api_key(self, mock_v1_api, mock_api_client):
        """Test API key creation."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Mock secret creation response
        mock_secret = Mock()
        mock_secret.metadata.uid = "test-uid-123"
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.create_namespaced_secret = AsyncMock(return_value=mock_secret)
        
        # Test API key creation
        request = APIKeyCreateRequest(
            name="Test API Key",
            expires_at=datetime.now(timezone.utc) + timedelta(days=30)
        )
        
        result = await self.service.create_api_key(request)
        
        # Verify response
        self.assertEqual(result.id, "test-uid-123")
        self.assertEqual(result.name, "Test API Key")
        self.assertTrue(result.public_key.startswith("pk-ark-"))
        self.assertTrue(result.secret_key.startswith("sk-ark-"))
        self.assertEqual(result.expires_at, request.expires_at)
        
        # Verify Kubernetes secret was created
        mock_api_instance.create_namespaced_secret.assert_called_once()
        call_args = mock_api_instance.create_namespaced_secret.call_args
        self.assertEqual(call_args[1]["namespace"], "test-namespace")
        
        secret_body = call_args[1]["body"]
        self.assertEqual(secret_body.type, "ark.mckinsey.com/api-key")
        self.assertIn("public_key", secret_body.string_data)
        self.assertIn("secret_key_hash", secret_body.string_data)
        self.assertIn("is_active", secret_body.string_data)
    
    @patch('ark_api.services.api_keys.ApiClient')
    @patch('ark_api.services.api_keys.client.CoreV1Api')
    async def test_list_api_keys(self, mock_v1_api, mock_api_client):
        """Test API key listing."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Mock secret list response with JSON annotation
        mock_secret = Mock()
        mock_secret.metadata.uid = "test-uid-123"
        mock_secret.metadata.annotations = {
            API_KEY_ANNOTATION: json.dumps({
                "name": "Test Key",
                "createdAt": "2024-01-01T00:00:00+00:00"
            })
        }
        mock_secret.data = {
            "public_key": base64.b64encode(b"pk-ark-test").decode(),
            "is_active": base64.b64encode(b"true").decode()
        }
        
        mock_response = Mock()
        mock_response.items = [mock_secret]
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.list_namespaced_secret = AsyncMock(return_value=mock_response)
        
        # Test listing
        result = await self.service.list_api_keys()
        
        # Verify response
        self.assertEqual(result.count, 1)
        self.assertEqual(len(result.items), 1)
        self.assertEqual(result.items[0].id, "test-uid-123")
        self.assertEqual(result.items[0].name, "Test Key")
        self.assertEqual(result.items[0].public_key, "pk-ark-test")
        self.assertTrue(result.items[0].is_active)
        
        # Verify Kubernetes API was called correctly
        mock_api_instance.list_namespaced_secret.assert_called_once_with(
            namespace="test-namespace",
            label_selector=f"{API_KEY_TYPE}=true"
        )
    
    @patch('ark_api.services.api_keys.ApiClient')
    @patch('ark_api.services.api_keys.client.CoreV1Api')
    async def test_delete_api_key(self, mock_v1_api, mock_api_client):
        """Test API key soft deletion."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Mock get secret response
        mock_secret = Mock()
        mock_secret.metadata.annotations = {}
        mock_secret.string_data = {}
        
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.read_namespaced_secret = AsyncMock(return_value=mock_secret)
        mock_api_instance.patch_namespaced_secret = AsyncMock(return_value=mock_secret)
        
        # Test deletion
        result = await self.service.delete_api_key("pk-ark-test")
        
        # Verify result
        self.assertTrue(result)
        
        # Verify soft delete was performed
        mock_api_instance.read_namespaced_secret.assert_called_once()
        mock_api_instance.patch_namespaced_secret.assert_called_once()
        
        # Check that the secret was marked as deleted
        patch_call_args = mock_api_instance.patch_namespaced_secret.call_args
        patched_secret = patch_call_args[1]["body"]
        self.assertIn(API_KEY_ANNOTATION, patched_secret.metadata.annotations)
        annotation_data = json.loads(patched_secret.metadata.annotations[API_KEY_ANNOTATION])
        self.assertIn("deletedAt", annotation_data)
        self.assertEqual(patched_secret.string_data["is_active"], "false")
    
    @patch('ark_api.services.api_keys.ApiClient')
    @patch('ark_api.services.api_keys.client.CoreV1Api')
    async def test_verify_api_key_success(self, mock_v1_api, mock_api_client):
        """Test successful API key verification."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Create a real hash for testing
        secret_key = "sk-ark-test-secret"
        hashed = self.service._hash_secret_key(secret_key)
        
        # Mock secret response with JSON annotation
        mock_secret = Mock()
        mock_secret.type = "ark.mckinsey.com/api-key"
        mock_secret.metadata.uid = "test-uid-123"
        mock_secret.metadata.annotations = {
            API_KEY_ANNOTATION: json.dumps({
                "name": "Test Key",
                "createdAt": "2024-01-01T00:00:00+00:00"
            })
        }
        mock_secret.data = {
            "public_key": base64.b64encode(b"pk-ark-test").decode(),
            "secret_key_hash": base64.b64encode(hashed.encode()).decode(),
            "is_active": base64.b64encode(b"true").decode()
        }
        
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.read_namespaced_secret = AsyncMock(return_value=mock_secret)
        mock_api_instance.patch_namespaced_secret = AsyncMock(return_value=mock_secret)
        
        # Test verification
        result = await self.service.verify_api_key("pk-ark-test", secret_key)
        
        # Verify result
        self.assertIsNotNone(result)
        self.assertEqual(result["public_key"], "pk-ark-test")
        self.assertEqual(result["name"], "Test Key")
        self.assertTrue(result["is_active"])
        
        # Verify last used timestamp was updated
        mock_api_instance.patch_namespaced_secret.assert_called_once()
    
    @patch('ark_api.services.api_keys.ApiClient')
    @patch('ark_api.services.api_keys.client.CoreV1Api')
    async def test_verify_api_key_invalid_secret(self, mock_v1_api, mock_api_client):
        """Test API key verification with invalid secret."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Create a hash for different secret
        different_secret = "sk-ark-different-secret"
        hashed = self.service._hash_secret_key(different_secret)
        
        # Mock secret response
        mock_secret = Mock()
        mock_secret.type = "ark.mckinsey.com/api-key"
        mock_secret.metadata.annotations = {}
        mock_secret.data = {
            "public_key": base64.b64encode(b"pk-ark-test").decode(),
            "secret_key_hash": base64.b64encode(hashed.encode()).decode(),
            "is_active": base64.b64encode(b"true").decode()
        }
        
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.read_namespaced_secret = AsyncMock(return_value=mock_secret)
        
        # Test verification with wrong secret
        result = await self.service.verify_api_key("pk-ark-test", "sk-ark-wrong-secret")
        
        # Verify result
        self.assertIsNone(result)


class TestAPIKeyNamespaceScoping(unittest.TestCase):
    """Test namespace scoping for API keys (multi-tenant isolation)."""
    
    @patch('ark_api.services.api_keys.get_context')
    def test_default_namespace_from_context(self, mock_get_context):
        """Test that APIKeyService uses current context namespace by default."""
        mock_get_context.return_value = {"namespace": "team-a", "cluster": "test-cluster"}
        
        # Create service without specifying namespace
        service = APIKeyService()
        
        # Verify it uses the context namespace
        self.assertEqual(service.namespace, "team-a")
        mock_get_context.assert_called_once()
    
    @patch('ark_api.services.api_keys.get_context')
    def test_namespace_always_from_context(self, mock_get_context):
        """Test that namespace always comes from context (no override possible)."""
        mock_get_context.return_value = {"namespace": "team-a", "cluster": "test-cluster"}
        
        # Create service - it must use context namespace
        service = APIKeyService()
        
        # Verify it uses the context namespace
        self.assertEqual(service.namespace, "team-a")
        mock_get_context.assert_called_once()
    
    @patch('ark_api.services.api_keys.get_context')
    @patch('ark_api.services.api_keys.ApiClient')
    @patch('ark_api.services.api_keys.client.CoreV1Api')
    async def test_api_keys_isolated_by_namespace(self, mock_v1_api, mock_api_client, mock_get_context):
        """Test that API keys in different namespaces are isolated."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Create services for two different namespaces by mocking context
        mock_get_context.return_value = {"namespace": "team-a", "cluster": "test"}
        service_team_a = APIKeyService()
        
        mock_get_context.return_value = {"namespace": "team-b", "cluster": "test"}
        service_team_b = APIKeyService()
        
        # Mock secret creation response
        mock_secret = Mock()
        mock_secret.metadata.uid = "test-uid"
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.create_namespaced_secret = AsyncMock(return_value=mock_secret)
        
        # Create API keys in both namespaces
        request = APIKeyCreateRequest(name="Test Key")
        
        await service_team_a.create_api_key(request)
        await service_team_b.create_api_key(request)
        
        # Verify keys were created in correct namespaces
        calls = mock_api_instance.create_namespaced_secret.call_args_list
        self.assertEqual(len(calls), 2)
        
        # First call should be to team-a
        self.assertEqual(calls[0][1]["namespace"], "team-a")
        
        # Second call should be to team-b
        self.assertEqual(calls[1][1]["namespace"], "team-b")
    
    @patch('ark_api.services.api_keys.get_context')
    @patch('ark_api.services.api_keys.ApiClient')
    @patch('ark_api.services.api_keys.client.CoreV1Api')
    async def test_list_api_keys_namespace_scoped(self, mock_v1_api, mock_api_client, mock_get_context):
        """Test that listing API keys only returns keys from the service's namespace."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Create service for team-a
        mock_get_context.return_value = {"namespace": "team-a", "cluster": "test"}
        service = APIKeyService()
        
        # Mock secret list response
        mock_response = Mock()
        mock_response.items = []
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.list_namespaced_secret = AsyncMock(return_value=mock_response)
        
        # List API keys
        await service.list_api_keys()
        
        # Verify list was called with correct namespace
        mock_api_instance.list_namespaced_secret.assert_called_once_with(
            namespace="team-a",
            label_selector=f"{API_KEY_TYPE}=true"
        )
    
    @patch('ark_api.services.api_keys.get_context')
    @patch('ark_api.services.api_keys.ApiClient')
    @patch('ark_api.services.api_keys.client.CoreV1Api')
    async def test_verify_api_key_namespace_scoped(self, mock_v1_api, mock_api_client, mock_get_context):
        """Test that API key verification is namespace-scoped."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Create services for two namespaces by mocking context
        mock_get_context.return_value = {"namespace": "team-a", "cluster": "test"}
        service_team_a = APIKeyService()
        
        mock_get_context.return_value = {"namespace": "team-b", "cluster": "test"}
        service_team_b = APIKeyService()
        
        # Mock API response - key exists in team-a but not in team-b
        mock_secret = Mock()
        mock_secret.type = "ark.mckinsey.com/api-key"
        mock_secret.metadata.uid = "test-uid"
        mock_secret.metadata.annotations = {
            API_KEY_ANNOTATION: json.dumps({"name": "Test Key", "createdAt": "2024-01-01T00:00:00+00:00"})
        }
        mock_secret.data = {
            "public_key": base64.b64encode(b"pk-ark-test").decode(),
            "secret_key_hash": base64.b64encode(b"hash").decode(),
            "is_active": base64.b64encode(b"true").decode()
        }
        
        mock_api_instance = mock_v1_api.return_value
        
        # For team-a: return the secret
        # For team-b: raise 404 (not found)
        def read_namespaced_secret_side_effect(*args, **kwargs):
            namespace = kwargs.get("namespace")
            if namespace == "team-a":
                return mock_secret
            else:
                from kubernetes_asyncio.client.rest import ApiException
                raise ApiException(status=404)
        
        mock_api_instance.read_namespaced_secret = AsyncMock(side_effect=read_namespaced_secret_side_effect)
        mock_api_instance.patch_namespaced_secret = AsyncMock(return_value=mock_secret)
        
        # Verify in team-a should find the key
        result_a = await service_team_a.get_api_key_by_public_key("pk-ark-test")
        self.assertIsNotNone(result_a)
        self.assertEqual(result_a["public_key"], "pk-ark-test")
        
        # Verify in team-b should NOT find the key (namespace isolation)
        result_b = await service_team_b.get_api_key_by_public_key("pk-ark-test")
        self.assertIsNone(result_b)


if __name__ == '__main__':
    unittest.main()
