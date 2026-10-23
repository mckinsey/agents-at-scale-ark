"""Test cases for API key service."""

import asyncio
import unittest
from unittest.mock import Mock, patch, AsyncMock
from datetime import datetime, timezone, timedelta
import base64
import json

from kubernetes_asyncio.client.rest import ApiException

from ark_api.services.api_keys import (
    APIKeyService,
    API_KEY_TYPE,
    API_KEY_ANNOTATION,
    BCRYPT_MAX_INPUT_BYTES,
    DEFAULT_API_KEY_RETENTION_SECONDS,
    DEFAULT_API_KEY_REAPER_INTERVAL_SECONDS,
    run_api_key_reaper,
    start_api_key_reaper,
)
from ark_api.utils.helpers import parse_iso_timestamp
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
    
    def test_secret_key_fits_bcrypt_input_limit(self):
        _, secret_key = self.service._generate_key_pair()
        
        self.assertLessEqual(len(secret_key.encode('utf-8')), BCRYPT_MAX_INPUT_BYTES)
    
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
        parsed = parse_iso_timestamp(formatted)
        self.assertIsInstance(parsed, datetime)
        self.assertLess(abs((parsed - now).total_seconds()), 1)  # Should be very close
        
        # Test None handling
        self.assertIsNone(self.service._format_datetime(None))
        self.assertIsNone(parse_iso_timestamp(None))
        self.assertIsNone(parse_iso_timestamp(""))
        self.assertIsNone(parse_iso_timestamp("invalid"))


class TestAPIKeyServiceIntegration(unittest.IsolatedAsyncioTestCase):
    """Integration tests for API key service with mocked Kubernetes client."""
    
    @patch('ark_api.services.api_keys.get_context')
    def setUp(self, mock_get_context):
        """Set up test fixtures."""
        mock_get_context.return_value = {"namespace": "test-namespace", "cluster": "test"}
        self.service = APIKeyService()
    
    @patch('ark_api.services.api_keys.create_api_client')
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
    
    @patch('ark_api.services.api_keys.create_api_client')
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
    
    @patch('ark_api.services.api_keys.create_api_client')
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
    
    @patch('ark_api.services.api_keys.create_api_client')
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
        patched_secret = mock_api_instance.patch_namespaced_secret.call_args[1]["body"]
        annotation_data = json.loads(patched_secret.metadata.annotations[API_KEY_ANNOTATION])
        self.assertIn("lastUsedAt", annotation_data)
        self.assertIsNotNone(parse_iso_timestamp(annotation_data["lastUsedAt"]))
    
    @patch('ark_api.services.api_keys.create_api_client')
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
        mock_api_instance.patch_namespaced_secret = AsyncMock()
        
        # Test verification with wrong secret
        result = await self.service.verify_api_key("pk-ark-test", "sk-ark-wrong-secret")
        
        # Verify result
        self.assertIsNone(result)
        mock_api_instance.patch_namespaced_secret.assert_not_called()


class TestAPIKeyNamespaceScoping(unittest.IsolatedAsyncioTestCase):
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
    @patch('ark_api.services.api_keys.create_api_client')
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
    @patch('ark_api.services.api_keys.create_api_client')
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
    @patch('ark_api.services.api_keys.create_api_client')
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


class TestAPIKeyOwnershipScoping(unittest.IsolatedAsyncioTestCase):
    """Test that created_by is recorded and used to scope list/get/delete."""

    @patch('ark_api.services.api_keys.get_context')
    def setUp(self, mock_get_context):
        mock_get_context.return_value = {"namespace": "test-namespace", "cluster": "test"}
        self.service = APIKeyService()

    @patch('ark_api.services.api_keys.create_api_client')
    @patch('ark_api.services.api_keys.client.CoreV1Api')
    async def test_create_api_key_records_created_by(self, mock_v1_api, mock_api_client):
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_secret = Mock()
        mock_secret.metadata.uid = "test-uid-123"
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.create_namespaced_secret = AsyncMock(return_value=mock_secret)

        request = APIKeyCreateRequest(name="Test API Key")
        await self.service.create_api_key(request, created_by="alice@example.com")

        secret_body = mock_api_instance.create_namespaced_secret.call_args[1]["body"]
        annotation_data = json.loads(secret_body.metadata.annotations[API_KEY_ANNOTATION])
        self.assertEqual(annotation_data["createdBy"], "alice@example.com")

    @patch('ark_api.services.api_keys.create_api_client')
    @patch('ark_api.services.api_keys.client.CoreV1Api')
    async def test_last_used_update_preserves_created_by(self, mock_v1_api, mock_api_client):
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        secret_key = "sk-ark-test-secret"
        hashed = self.service._hash_secret_key(secret_key)

        mock_secret = Mock()
        mock_secret.type = "ark.mckinsey.com/api-key"
        mock_secret.metadata.uid = "test-uid-123"
        mock_secret.metadata.annotations = {
            API_KEY_ANNOTATION: json.dumps({
                "name": "Test Key",
                "createdAt": "2024-01-01T00:00:00+00:00",
                "createdBy": "alice@example.com"
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

        await self.service.verify_api_key("pk-ark-test", secret_key)

        patched_secret = mock_api_instance.patch_namespaced_secret.call_args[1]["body"]
        annotation_data = json.loads(patched_secret.metadata.annotations[API_KEY_ANNOTATION])
        self.assertEqual(annotation_data["createdBy"], "alice@example.com")

    @patch('ark_api.services.api_keys.create_api_client')
    @patch('ark_api.services.api_keys.client.CoreV1Api')
    async def test_list_api_keys_scoped_to_creator(self, mock_v1_api, mock_api_client):
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        def make_secret(uid, name, created_by):
            secret = Mock()
            secret.metadata.uid = uid
            secret.metadata.annotations = {
                API_KEY_ANNOTATION: json.dumps({
                    "name": name,
                    "createdAt": "2024-01-01T00:00:00+00:00",
                    "createdBy": created_by
                })
            }
            secret.data = {
                "public_key": base64.b64encode(f"pk-ark-{uid}".encode()).decode(),
                "is_active": base64.b64encode(b"true").decode()
            }
            return secret

        mock_response = Mock()
        mock_response.items = [
            make_secret("alice-key", "Alice Key", "alice@example.com"),
            make_secret("bob-key", "Bob Key", "bob@example.com"),
        ]
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.list_namespaced_secret = AsyncMock(return_value=mock_response)

        result = await self.service.list_api_keys(created_by="alice@example.com")

        self.assertEqual(result.count, 1)
        self.assertEqual(result.items[0].name, "Alice Key")

    @patch('ark_api.services.api_keys.create_api_client')
    @patch('ark_api.services.api_keys.client.CoreV1Api')
    async def test_get_api_key_by_public_key_denies_other_creator(self, mock_v1_api, mock_api_client):
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_secret = Mock()
        mock_secret.type = "ark.mckinsey.com/api-key"
        mock_secret.metadata.uid = "test-uid"
        mock_secret.metadata.annotations = {
            API_KEY_ANNOTATION: json.dumps({
                "name": "Test Key",
                "createdAt": "2024-01-01T00:00:00+00:00",
                "createdBy": "alice@example.com"
            })
        }
        mock_secret.data = {
            "public_key": base64.b64encode(b"pk-ark-test").decode(),
            "secret_key_hash": base64.b64encode(b"hash").decode(),
            "is_active": base64.b64encode(b"true").decode()
        }
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.read_namespaced_secret = AsyncMock(return_value=mock_secret)

        owned = await self.service.get_api_key_by_public_key("pk-ark-test", created_by="alice@example.com")
        self.assertIsNotNone(owned)

        not_owned = await self.service.get_api_key_by_public_key("pk-ark-test", created_by="bob@example.com")
        self.assertIsNone(not_owned)

    @patch('ark_api.services.api_keys.create_api_client')
    @patch('ark_api.services.api_keys.client.CoreV1Api')
    async def test_delete_api_key_denies_other_creator(self, mock_v1_api, mock_api_client):
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_secret = Mock()
        mock_secret.metadata.annotations = {
            API_KEY_ANNOTATION: json.dumps({
                "name": "Test Key",
                "createdAt": "2024-01-01T00:00:00+00:00",
                "createdBy": "alice@example.com"
            })
        }
        mock_secret.string_data = {}
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.read_namespaced_secret = AsyncMock(return_value=mock_secret)
        mock_api_instance.patch_namespaced_secret = AsyncMock(return_value=mock_secret)

        result = await self.service.delete_api_key("pk-ark-test", created_by="bob@example.com")

        self.assertFalse(result)
        mock_api_instance.patch_namespaced_secret.assert_not_called()

        result = await self.service.delete_api_key("pk-ark-test", created_by="alice@example.com")
        self.assertTrue(result)
        mock_api_instance.patch_namespaced_secret.assert_called_once()

    @patch('ark_api.services.api_keys.create_api_client')
    @patch('ark_api.services.api_keys.client.CoreV1Api')
    async def test_get_api_key_by_public_key_reports_created_by(self, mock_v1_api, mock_api_client):
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_secret = Mock()
        mock_secret.type = "ark.mckinsey.com/api-key"
        mock_secret.metadata.uid = "test-uid"
        mock_secret.metadata.annotations = {
            API_KEY_ANNOTATION: json.dumps({
                "name": "Test Key",
                "createdAt": "2024-01-01T00:00:00+00:00",
                "createdBy": "alice@example.com"
            })
        }
        mock_secret.data = {
            "public_key": base64.b64encode(b"pk-ark-test").decode(),
            "secret_key_hash": base64.b64encode(b"hash").decode(),
            "is_active": base64.b64encode(b"true").decode()
        }
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.read_namespaced_secret = AsyncMock(return_value=mock_secret)

        result = await self.service.get_api_key_by_public_key("pk-ark-test")
        self.assertEqual(result["created_by"], "alice@example.com")

    @patch('ark_api.services.api_keys.create_api_client')
    @patch('ark_api.services.api_keys.client.CoreV1Api')
    async def test_get_api_key_by_public_key_reports_no_creator_for_legacy_key(self, mock_v1_api, mock_api_client):
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_secret = Mock()
        mock_secret.type = "ark.mckinsey.com/api-key"
        mock_secret.metadata.uid = "test-uid"
        mock_secret.metadata.annotations = {
            API_KEY_ANNOTATION: json.dumps({
                "name": "Test Key",
                "createdAt": "2024-01-01T00:00:00+00:00"
            })
        }
        mock_secret.data = {
            "public_key": base64.b64encode(b"pk-ark-test").decode(),
            "secret_key_hash": base64.b64encode(b"hash").decode(),
            "is_active": base64.b64encode(b"true").decode()
        }
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.read_namespaced_secret = AsyncMock(return_value=mock_secret)

        result = await self.service.get_api_key_by_public_key("pk-ark-test")
        self.assertIsNone(result["created_by"])



def _api_key_secret(name, deleted_at=None, expires_at=None, is_active="true", secret_type=API_KEY_TYPE, created_at=None):
    created_at = created_at or datetime(2026, 1, 1, tzinfo=timezone.utc)
    metadata = {"name": name, "createdAt": created_at.isoformat()}
    if deleted_at is not None:
        metadata["deletedAt"] = deleted_at.isoformat()
    if expires_at is not None:
        metadata["expiresAt"] = expires_at.isoformat()
    secret = Mock()
    secret.type = secret_type
    secret.metadata.name = name
    secret.metadata.uid = f"uid-{name}"
    secret.metadata.resource_version = f"rv-{name}"
    secret.metadata.annotations = {API_KEY_ANNOTATION: json.dumps(metadata)}
    secret.data = {
        "public_key": base64.b64encode(f"pk-ark-{name}".encode()).decode(),
        "secret_key_hash": base64.b64encode(b"hash").decode(),
        "is_active": base64.b64encode(is_active.encode()).decode(),
    }
    return secret


class TestAPIKeyRetention(unittest.IsolatedAsyncioTestCase):

    @patch('ark_api.services.api_keys.get_context')
    def setUp(self, mock_get_context):
        mock_get_context.return_value = {"namespace": "test-namespace", "cluster": "test"}
        self.service = APIKeyService()
        self.now = datetime.now(timezone.utc)

        client_patch = patch('ark_api.services.api_keys.create_api_client')
        v1_patch = patch('ark_api.services.api_keys.client.CoreV1Api')
        mock_api_client = client_patch.start()
        mock_v1_api = v1_patch.start()
        self.addCleanup(client_patch.stop)
        self.addCleanup(v1_patch.stop)
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        self.v1 = mock_v1_api.return_value
        self.v1.delete_namespaced_secret = AsyncMock()

    def _list(self, *secrets):
        self.v1.list_namespaced_secret = AsyncMock(return_value=Mock(items=list(secrets)))

    def _deleted_names(self):
        return [c.kwargs["name"] for c in self.v1.delete_namespaced_secret.call_args_list]

    async def test_purges_keys_revoked_outside_retention_window(self):
        self._list(_api_key_secret("old", deleted_at=self.now - timedelta(days=91), is_active="false"))

        purged = await self.service.purge_inactive_api_keys(DEFAULT_API_KEY_RETENTION_SECONDS)

        self.assertEqual(purged, 1)
        self.assertEqual(self._deleted_names(), ["old"])

    async def test_keeps_keys_revoked_inside_retention_window(self):
        self._list(_api_key_secret("recent", deleted_at=self.now - timedelta(days=89), is_active="false"))

        purged = await self.service.purge_inactive_api_keys(DEFAULT_API_KEY_RETENTION_SECONDS)

        self.assertEqual(purged, 0)
        self.v1.delete_namespaced_secret.assert_not_awaited()

    async def test_never_purges_active_keys(self):
        self._list(_api_key_secret("active"))

        purged = await self.service.purge_inactive_api_keys(0)

        self.assertEqual(purged, 0)
        self.v1.delete_namespaced_secret.assert_not_awaited()

    async def test_purges_keys_expired_outside_retention_window(self):
        self._list(_api_key_secret("expired", expires_at=self.now - timedelta(days=91)))

        purged = await self.service.purge_inactive_api_keys(DEFAULT_API_KEY_RETENTION_SECONDS)

        self.assertEqual(purged, 1)
        self.assertEqual(self._deleted_names(), ["expired"])

    async def test_keeps_keys_expired_inside_retention_window(self):
        self._list(_api_key_secret("expired", expires_at=self.now - timedelta(days=89)))

        purged = await self.service.purge_inactive_api_keys(DEFAULT_API_KEY_RETENTION_SECONDS)

        self.assertEqual(purged, 0)
        self.v1.delete_namespaced_secret.assert_not_awaited()

    async def test_never_purges_active_keys_with_future_expiry(self):
        self._list(_api_key_secret("active", expires_at=self.now + timedelta(days=30)))

        purged = await self.service.purge_inactive_api_keys(0)

        self.assertEqual(purged, 0)
        self.v1.delete_namespaced_secret.assert_not_awaited()

    async def test_retention_counts_from_whichever_end_came_first(self):
        self._list(_api_key_secret(
            "both",
            deleted_at=self.now - timedelta(days=1),
            expires_at=self.now - timedelta(days=120),
            is_active="false",
        ))

        purged = await self.service.purge_inactive_api_keys(DEFAULT_API_KEY_RETENTION_SECONDS)

        self.assertEqual(purged, 1)

    @patch('ark_api.services.api_keys.logger')
    async def test_inactive_key_without_revocation_time_is_kept_with_warning(self, mock_logger):
        self._list(_api_key_secret("orphan", is_active="false"))

        purged = await self.service.purge_inactive_api_keys(0)

        self.assertEqual(purged, 0)
        self.v1.delete_namespaced_secret.assert_not_awaited()
        mock_logger.warning.assert_called_once()
        self.assertIn("orphan", mock_logger.warning.call_args.args[0])

    @patch('ark_api.services.api_keys.logger')
    async def test_active_key_without_expiry_is_kept_without_warning(self, mock_logger):
        self._list(_api_key_secret("active"))

        await self.service.purge_inactive_api_keys(0)

        mock_logger.warning.assert_not_called()

    async def test_lists_only_api_key_secrets_from_the_server(self):
        self._list()

        await self.service.purge_inactive_api_keys(DEFAULT_API_KEY_RETENTION_SECONDS)

        self.v1.list_namespaced_secret.assert_awaited_once_with(
            namespace="test-namespace",
            label_selector=f"{API_KEY_TYPE}=true",
            field_selector=f"type={API_KEY_TYPE}",
        )

    async def test_purges_keys_with_naive_timestamps(self):
        naive = (self.now - timedelta(days=91)).replace(tzinfo=None)
        self._list(_api_key_secret("naive", deleted_at=naive, is_active="false"))

        purged = await self.service.purge_inactive_api_keys(DEFAULT_API_KEY_RETENTION_SECONDS)

        self.assertEqual(purged, 1)

    async def test_purges_only_expired_revocations_in_mixed_list(self):
        self._list(
            _api_key_secret("active"),
            _api_key_secret("recent", deleted_at=self.now - timedelta(days=1), is_active="false"),
            _api_key_secret("old", deleted_at=self.now - timedelta(days=120), is_active="false"),
            _api_key_secret("expiring", expires_at=self.now + timedelta(days=1)),
            _api_key_secret("expired", expires_at=self.now - timedelta(days=100)),
        )

        purged = await self.service.purge_inactive_api_keys(DEFAULT_API_KEY_RETENTION_SECONDS)

        self.assertEqual(purged, 2)
        self.assertEqual(self._deleted_names(), ["old", "expired"])

    async def test_treats_already_deleted_secret_as_done(self):
        self._list(_api_key_secret("old", deleted_at=self.now - timedelta(days=91), is_active="false"))
        self.v1.delete_namespaced_secret.side_effect = ApiException(status=404)

        purged = await self.service.purge_inactive_api_keys(DEFAULT_API_KEY_RETENTION_SECONDS)

        self.assertEqual(purged, 0)

    async def test_delete_is_conditional_on_the_listed_version(self):
        self._list(_api_key_secret("old", deleted_at=self.now - timedelta(days=91), is_active="false"))

        await self.service.purge_inactive_api_keys(DEFAULT_API_KEY_RETENTION_SECONDS)

        preconditions = self.v1.delete_namespaced_secret.call_args.kwargs["body"].preconditions
        self.assertEqual(preconditions.uid, "uid-old")
        self.assertEqual(preconditions.resource_version, "rv-old")

    async def test_secret_changed_since_listing_is_skipped(self):
        self._list(_api_key_secret("old", deleted_at=self.now - timedelta(days=91), is_active="false"))
        self.v1.delete_namespaced_secret.side_effect = ApiException(status=409)

        purged = await self.service.purge_inactive_api_keys(DEFAULT_API_KEY_RETENTION_SECONDS)

        self.assertEqual(purged, 0)

    async def test_raises_on_other_delete_errors(self):
        self._list(_api_key_secret("old", deleted_at=self.now - timedelta(days=91), is_active="false"))
        self.v1.delete_namespaced_secret.side_effect = ApiException(status=403)

        with self.assertRaises(RuntimeError) as raised:
            await self.service.purge_inactive_api_keys(DEFAULT_API_KEY_RETENTION_SECONDS)

        self.assertIn("old", str(raised.exception))
        self.assertIsInstance(raised.exception.__cause__, ApiException)

    async def test_one_failed_delete_does_not_block_the_rest(self):
        self._list(
            _api_key_secret("stuck", deleted_at=self.now - timedelta(days=91), is_active="false"),
            _api_key_secret("next", deleted_at=self.now - timedelta(days=91), is_active="false"),
        )
        self.v1.delete_namespaced_secret.side_effect = [ApiException(status=403), None]

        with self.assertRaises(RuntimeError) as raised:
            await self.service.purge_inactive_api_keys(DEFAULT_API_KEY_RETENTION_SECONDS)

        self.assertEqual(self._deleted_names(), ["stuck", "next"])
        self.assertIn("stuck", str(raised.exception))
        self.assertNotIn("next", str(raised.exception))

    async def test_malformed_secret_does_not_block_the_rest(self):
        bad = _api_key_secret("bad", is_active="false")
        bad.data["is_active"] = base64.b64encode(b"\xff\xfe").decode()
        self._list(bad, _api_key_secret("next", deleted_at=self.now - timedelta(days=91), is_active="false"))

        with self.assertRaises(RuntimeError) as raised:
            await self.service.purge_inactive_api_keys(DEFAULT_API_KEY_RETENTION_SECONDS)

        self.assertEqual(self._deleted_names(), ["next"])
        self.assertIn("bad", str(raised.exception))

    async def test_key_created_already_expired_is_kept_from_creation(self):
        self._list(_api_key_secret(
            "born-expired",
            created_at=self.now - timedelta(days=1),
            expires_at=self.now - timedelta(days=100),
        ))

        purged = await self.service.purge_inactive_api_keys(DEFAULT_API_KEY_RETENTION_SECONDS)

        self.assertEqual(purged, 0)
        self.v1.delete_namespaced_secret.assert_not_awaited()

    async def test_revoked_key_fails_authentication_before_and_after_purge(self):
        revoked = _api_key_secret("old", deleted_at=self.now - timedelta(days=91), is_active="false")
        self.v1.read_namespaced_secret = AsyncMock(return_value=revoked)

        self.assertIsNone(await self.service.get_api_key_by_public_key("pk-ark-old"))

        self._list(revoked)
        await self.service.purge_inactive_api_keys(DEFAULT_API_KEY_RETENTION_SECONDS)
        self.v1.read_namespaced_secret = AsyncMock(side_effect=ApiException(status=404))

        self.assertIsNone(await self.service.get_api_key_by_public_key("pk-ark-old"))


class TestAPIKeyReaperStartup(unittest.IsolatedAsyncioTestCase):

    @patch.dict('os.environ', {"API_KEY_RETENTION_SECONDS": "0"})
    async def test_disabled_when_retention_is_zero(self):
        self.assertIsNone(start_api_key_reaper())

    @patch.dict('os.environ', {"READ_ONLY_MODE": "true"}, clear=True)
    async def test_disabled_in_read_only_mode(self):
        self.assertIsNone(start_api_key_reaper())

    @patch.dict('os.environ', {"API_KEY_REAPER_INTERVAL_SECONDS": "1h"})
    async def test_non_numeric_setting_names_the_variable(self):
        with self.assertRaises(ValueError) as raised:
            start_api_key_reaper()

        self.assertIn("API_KEY_REAPER_INTERVAL_SECONDS", str(raised.exception))
        self.assertIn("1h", str(raised.exception))

    @patch.dict('os.environ', {"API_KEY_RETENTION_SECONDS": "-1"})
    async def test_rejects_negative_retention(self):
        with self.assertRaises(ValueError):
            start_api_key_reaper()

    @patch.dict('os.environ', {"API_KEY_RETENTION_SECONDS": "60", "API_KEY_REAPER_INTERVAL_SECONDS": "0"})
    async def test_rejects_non_positive_interval(self):
        with self.assertRaises(ValueError):
            start_api_key_reaper()

    @patch('ark_api.services.api_keys.run_api_key_reaper', new_callable=Mock)
    @patch('ark_api.services.api_keys.asyncio.create_task')
    @patch.dict('os.environ', {}, clear=True)
    async def test_defaults_to_ninety_day_retention(self, mock_create_task, mock_run):
        task = start_api_key_reaper()

        mock_run.assert_called_once_with(DEFAULT_API_KEY_RETENTION_SECONDS, DEFAULT_API_KEY_REAPER_INTERVAL_SECONDS)
        self.assertIs(task, mock_create_task.return_value)
        self.assertEqual(DEFAULT_API_KEY_RETENTION_SECONDS, 90 * 24 * 60 * 60)

    @patch('ark_api.services.api_keys.asyncio.sleep', new_callable=AsyncMock)
    @patch('ark_api.services.api_keys.get_context')
    async def test_reaper_keeps_running_when_context_is_unavailable(self, mock_get_context, mock_sleep):
        mock_get_context.side_effect = [RuntimeError("no namespace"), {"namespace": "test-namespace", "cluster": "test"}]
        mock_sleep.side_effect = [None, asyncio.CancelledError()]

        with patch.object(APIKeyService, 'purge_inactive_api_keys', new_callable=AsyncMock) as mock_purge:
            with self.assertRaises(asyncio.CancelledError):
                await run_api_key_reaper(60, 3600)

        mock_purge.assert_awaited_once_with(60)

    @patch('ark_api.services.api_keys.asyncio.sleep', new_callable=AsyncMock)
    @patch('ark_api.services.api_keys.get_context')
    async def test_reaper_keeps_running_after_a_failed_run(self, mock_get_context, mock_sleep):
        mock_get_context.return_value = {"namespace": "test-namespace", "cluster": "test"}
        mock_sleep.side_effect = [None, asyncio.CancelledError()]

        with patch.object(APIKeyService, 'purge_inactive_api_keys', new_callable=AsyncMock) as mock_purge:
            mock_purge.side_effect = [RuntimeError("boom"), 0]
            with self.assertRaises(asyncio.CancelledError):
                await run_api_key_reaper(60, 3600)

        self.assertEqual(mock_purge.await_count, 2)
        mock_sleep.assert_awaited_with(3600)



class TestAPIKeyRevocationAndVerification(unittest.IsolatedAsyncioTestCase):

    @patch('ark_api.services.api_keys.get_context')
    def setUp(self, mock_get_context):
        mock_get_context.return_value = {"namespace": "test-namespace", "cluster": "test"}
        self.service = APIKeyService()
        self.now = datetime.now(timezone.utc)

        client_patch = patch('ark_api.services.api_keys.create_api_client')
        v1_patch = patch('ark_api.services.api_keys.client.CoreV1Api')
        mock_api_client = client_patch.start()
        mock_v1_api = v1_patch.start()
        self.addCleanup(client_patch.stop)
        self.addCleanup(v1_patch.stop)
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        self.v1 = mock_v1_api.return_value
        self.v1.patch_namespaced_secret = AsyncMock()

    async def test_revoking_again_keeps_the_original_revocation_time(self):
        revoked_at = self.now - timedelta(days=89)
        secret = _api_key_secret("old", deleted_at=revoked_at, is_active="false")
        secret.string_data = {}
        self.v1.read_namespaced_secret = AsyncMock(return_value=secret)

        self.assertTrue(await self.service.delete_api_key("pk-ark-old"))

        patched = self.v1.patch_namespaced_secret.call_args.kwargs["body"]
        annotation = json.loads(patched.metadata.annotations[API_KEY_ANNOTATION])
        self.assertEqual(parse_iso_timestamp(annotation["deletedAt"]), revoked_at)

    def test_naive_timestamps_are_stored_as_utc(self):
        stored = self.service._format_datetime(datetime(2026, 12, 1))

        self.assertEqual(stored, "2026-12-01T00:00:00+00:00")

    async def test_naive_future_expiry_still_authenticates(self):
        naive_future = (self.now + timedelta(days=30)).replace(tzinfo=None)
        self.v1.read_namespaced_secret = AsyncMock(return_value=_api_key_secret("naive", expires_at=naive_future))

        result = await self.service.get_api_key_by_public_key("pk-ark-naive")

        self.assertIsNotNone(result)

    async def test_naive_past_expiry_is_rejected(self):
        naive_past = (self.now - timedelta(days=1)).replace(tzinfo=None)
        self.v1.read_namespaced_secret = AsyncMock(return_value=_api_key_secret("naive", expires_at=naive_past))

        self.assertIsNone(await self.service.get_api_key_by_public_key("pk-ark-naive"))

    @patch('ark_api.services.api_keys.bcrypt.checkpw')
    @patch('ark_api.services.api_keys.logger')
    async def test_overlong_secret_is_rejected_without_bcrypt_or_error_log(self, mock_logger, mock_checkpw):
        hashed = self.service._hash_secret_key("sk-ark-test-secret")

        result = self.service._verify_secret_key("x" * (BCRYPT_MAX_INPUT_BYTES + 1), hashed)

        self.assertFalse(result)
        mock_checkpw.assert_not_called()
        mock_logger.error.assert_not_called()


if __name__ == '__main__':
    unittest.main()
