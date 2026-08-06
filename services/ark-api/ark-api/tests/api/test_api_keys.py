"""Test cases for API key endpoints."""

import os
import unittest
from contextlib import ExitStack, asynccontextmanager
from types import SimpleNamespace
from unittest.mock import Mock, patch, AsyncMock, MagicMock
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException
from fastapi.testclient import TestClient

# Set environment variable to skip authentication before importing the app
from ark_api.auth.constants import AuthMode
os.environ["AUTH_MODE"] = AuthMode.OPEN

from ark_api.auth.dependencies import require_api_key_owner
from ark_api.api.v1.api_keys import authorize_api_key_creation
from ark_api.models.auth import UserIdentity


@asynccontextmanager
async def _fake_api_client(impersonation=None):
    yield MagicMock()


def _patch_ssar(can_create):
    stack = ExitStack()
    stack.enter_context(
        patch("ark_api.api.v1.api_keys.get_impersonating_api_client", _fake_api_client)
    )
    mock_auth = MagicMock()
    mock_auth.create_self_subject_access_review = AsyncMock(
        return_value=SimpleNamespace(status=SimpleNamespace(allowed=can_create))
    )
    stack.enter_context(
        patch("ark_api.api.v1.api_keys.client.AuthorizationV1Api", return_value=mock_auth)
    )
    return stack


def _raise_no_identity():
    raise HTTPException(status_code=403, detail="API key management requires an authenticated user identity")


class TestAPIKeyEndpoints(unittest.TestCase):
    """Test cases for API key management endpoints."""
    
    def setUp(self):
        """Set up test client."""
        from ark_api.main import app
        self.client = TestClient(app)
    
    @patch('ark_api.api.v1.api_keys.APIKeyService')
    def test_create_api_key_success(self, mock_service_class):
        """Test successful API key creation."""
        # Mock service instance
        mock_service = Mock()
        mock_service_class.return_value = mock_service
        
        # Mock response data
        now = datetime.now(timezone.utc)
        mock_response = Mock()
        mock_response.id = "test-id-123"
        mock_response.name = "Test API Key"
        mock_response.public_key = "pk-ark-test123"
        mock_response.secret_key = "sk-ark-secret123"
        mock_response.created_at = now
        mock_response.expires_at = None
        
        # Configure mock to return our response
        mock_service.create_api_key = AsyncMock(return_value=mock_response)
        
        # Make request
        request_data = {
            "name": "Test API Key",
            "expires_at": None
        }
        response = self.client.post("/v1/api-keys", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["id"], "test-id-123")
        self.assertEqual(data["name"], "Test API Key")
        self.assertEqual(data["public_key"], "pk-ark-test123")
        self.assertEqual(data["secret_key"], "sk-ark-secret123")
        
        # Verify service was called correctly
        mock_service.create_api_key.assert_called_once()
        call_args = mock_service.create_api_key.call_args[0]
        self.assertEqual(call_args[0].name, "Test API Key")
        self.assertIsNone(call_args[0].expires_at)
    
    @patch('ark_api.api.v1.api_keys.APIKeyService')
    def test_create_api_key_with_expiration(self, mock_service_class):
        """Test API key creation with expiration date."""
        # Mock service instance
        mock_service = Mock()
        mock_service_class.return_value = mock_service
        
        # Mock response data
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(days=30)
        mock_response = Mock()
        mock_response.id = "test-id-123"
        mock_response.name = "Test API Key"
        mock_response.public_key = "pk-ark-test123"
        mock_response.secret_key = "sk-ark-secret123"
        mock_response.created_at = now
        mock_response.expires_at = expires_at
        
        # Configure mock to return our response
        mock_service.create_api_key = AsyncMock(return_value=mock_response)
        
        # Make request with expiration
        request_data = {
            "name": "Test API Key",
            "expires_at": expires_at.isoformat()
        }
        response = self.client.post("/v1/api-keys", json=request_data)
        
        # Assert response
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["name"], "Test API Key")
        self.assertIsNotNone(data["expires_at"])
    
    @patch('ark_api.api.v1.api_keys.APIKeyService')
    def test_create_api_key_service_error(self, mock_service_class):
        """Test API key creation with service error."""
        # Mock service instance to raise exception
        mock_service = Mock()
        mock_service_class.return_value = mock_service
        mock_service.create_api_key = AsyncMock(side_effect=Exception("Database error"))
        
        # Make request
        request_data = {
            "name": "Test API Key"
        }
        response = self.client.post("/v1/api-keys", json=request_data)
        
        # Assert error response
        self.assertEqual(response.status_code, 500)
        data = response.json()
        self.assertIn("Failed to create API key", data["detail"])
    
    @patch('ark_api.api.v1.api_keys.APIKeyService')
    def test_list_api_keys_success(self, mock_service_class):
        """Test successful API key listing."""
        # Mock service instance
        mock_service = Mock()
        mock_service_class.return_value = mock_service
        
        # Mock API key responses
        mock_key1 = Mock()
        mock_key1.id = "key-1"
        mock_key1.name = "Production Key"
        mock_key1.public_key = "pk-ark-prod123"
        mock_key1.created_at = datetime.now(timezone.utc)
        mock_key1.last_used_at = None
        mock_key1.expires_at = None
        mock_key1.is_active = True
        
        mock_key2 = Mock()
        mock_key2.id = "key-2"
        mock_key2.name = "Development Key"
        mock_key2.public_key = "pk-ark-dev456"
        mock_key2.created_at = datetime.now(timezone.utc)
        mock_key2.last_used_at = datetime.now(timezone.utc)
        mock_key2.expires_at = datetime.now(timezone.utc) + timedelta(days=30)
        mock_key2.is_active = True
        
        # Mock list response
        mock_list_response = Mock()
        mock_list_response.items = [mock_key1, mock_key2]
        mock_list_response.count = 2
        
        # Configure mock to return our response
        mock_service.list_api_keys = AsyncMock(return_value=mock_list_response)
        
        # Make request
        response = self.client.get("/v1/api-keys")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 2)
        self.assertEqual(len(data["items"]), 2)
        
        # Check first key
        key1 = data["items"][0]
        self.assertEqual(key1["id"], "key-1")
        self.assertEqual(key1["name"], "Production Key")
        self.assertEqual(key1["public_key"], "pk-ark-prod123")
        self.assertTrue(key1["is_active"])
        self.assertIsNone(key1["last_used_at"])
        
        # Check second key
        key2 = data["items"][1]
        self.assertEqual(key2["id"], "key-2")
        self.assertEqual(key2["name"], "Development Key")
        self.assertEqual(key2["public_key"], "pk-ark-dev456")
        self.assertTrue(key2["is_active"])
        self.assertIsNotNone(key2["last_used_at"])
        self.assertIsNotNone(key2["expires_at"])
        
        # Verify service was called
        mock_service.list_api_keys.assert_called_once()
    
    @patch('ark_api.api.v1.api_keys.APIKeyService')
    def test_list_api_keys_empty(self, mock_service_class):
        """Test API key listing with no keys."""
        # Mock service instance
        mock_service = Mock()
        mock_service_class.return_value = mock_service
        
        # Mock empty list response
        mock_list_response = Mock()
        mock_list_response.items = []
        mock_list_response.count = 0
        
        # Configure mock to return our response
        mock_service.list_api_keys = AsyncMock(return_value=mock_list_response)
        
        # Make request
        response = self.client.get("/v1/api-keys")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 0)
        self.assertEqual(len(data["items"]), 0)
    
    @patch('ark_api.api.v1.api_keys.APIKeyService')
    def test_list_api_keys_service_error(self, mock_service_class):
        """Test API key listing with service error."""
        # Mock service instance to raise exception
        mock_service = Mock()
        mock_service_class.return_value = mock_service
        mock_service.list_api_keys = AsyncMock(side_effect=Exception("Database error"))
        
        # Make request
        response = self.client.get("/v1/api-keys")
        
        # Assert error response
        self.assertEqual(response.status_code, 500)
        data = response.json()
        self.assertIn("Failed to list API keys", data["detail"])
    
    @patch('ark_api.api.v1.api_keys.APIKeyService')
    def test_delete_api_key_success(self, mock_service_class):
        """Test successful API key deletion."""
        # Mock service instance
        mock_service = Mock()
        mock_service_class.return_value = mock_service
        
        # Configure mock to return success
        mock_service.delete_api_key = AsyncMock(return_value=True)
        
        # Make request
        public_key = "pk-ark-test123"
        response = self.client.delete(f"/v1/api-keys/{public_key}")
        
        # Assert response
        self.assertEqual(response.status_code, 204)
        
        # Verify service was called correctly
        mock_service.delete_api_key.assert_called_once_with(public_key, created_by=None)
    
    @patch('ark_api.api.v1.api_keys.APIKeyService')
    def test_delete_api_key_not_found(self, mock_service_class):
        """Test API key deletion when key not found."""
        # Mock service instance
        mock_service = Mock()
        mock_service_class.return_value = mock_service
        
        # Configure mock to return False (not found)
        mock_service.delete_api_key = AsyncMock(return_value=False)
        
        # Make request
        public_key = "pk-ark-nonexistent"
        response = self.client.delete(f"/v1/api-keys/{public_key}")
        
        # Assert error response
        self.assertEqual(response.status_code, 404)
        data = response.json()
        self.assertIn("not found", data["detail"])
        self.assertIn(public_key, data["detail"])
    
    @patch('ark_api.api.v1.api_keys.APIKeyService')
    def test_delete_api_key_service_error(self, mock_service_class):
        """Test API key deletion with service error."""
        # Mock service instance to raise exception
        mock_service = Mock()
        mock_service_class.return_value = mock_service
        mock_service.delete_api_key = AsyncMock(side_effect=Exception("Database error"))
        
        # Make request
        public_key = "pk-ark-test123"
        response = self.client.delete(f"/v1/api-keys/{public_key}")
        
        # Assert error response
        self.assertEqual(response.status_code, 500)
        data = response.json()
        self.assertIn("Failed to delete API key", data["detail"])
    
    def test_create_api_key_invalid_data(self):
        """Test API key creation with invalid request data."""
        # Test missing name
        response = self.client.post("/v1/api-keys", json={})
        self.assertEqual(response.status_code, 422)  # Validation error
        
        # Test invalid expiration format
        request_data = {
            "name": "Test Key",
            "expires_at": "invalid-date"
        }
        response = self.client.post("/v1/api-keys", json=request_data)
        self.assertEqual(response.status_code, 422)  # Validation error
    
    def test_delete_api_key_invalid_public_key(self):
        """Test API key deletion with invalid public key format."""
        # Test with various invalid public key formats
        invalid_keys = ["", "invalid", "not-a-public-key", "pk-ark-"]
        
        for invalid_key in invalid_keys:
            with self.subTest(invalid_key=invalid_key):
                response = self.client.delete(f"/v1/api-keys/{invalid_key}")
                
                if invalid_key == "":
                    # Empty string matches list endpoint which doesn't support DELETE
                    self.assertEqual(response.status_code, 405)  # Method Not Allowed
                else:
                    # Other invalid keys should reach the service layer and return 404
                    # The actual validation happens in the service layer
                    self.assertIn(response.status_code, [404, 500])


class TestAPIKeyCreationAuthorization(unittest.TestCase):
    """Test cases for the create_api_key authorization gate and ownership scoping."""

    def setUp(self):
        from ark_api.main import app
        self.app = app
        self.client = TestClient(app)

    def tearDown(self):
        self.app.dependency_overrides.clear()

    @patch('ark_api.api.v1.api_keys.APIKeyService')
    def test_gate_inactive_allows_creation(self, mock_service_class):
        self.app.dependency_overrides[require_api_key_owner] = lambda: None

        mock_service = Mock()
        mock_service_class.return_value = mock_service
        now = datetime.now(timezone.utc)
        mock_response = Mock(
            id="test-id", public_key="pk-ark-test",
            secret_key="sk-ark-test", created_at=now, expires_at=None
        )
        mock_response.name = "Test Key"
        mock_service.create_api_key = AsyncMock(return_value=mock_response)

        response = self.client.post("/v1/api-keys", json={"name": "Test Key"})

        self.assertEqual(response.status_code, 201)
        mock_service.create_api_key.assert_called_once()
        self.assertIsNone(mock_service.create_api_key.call_args[1]["created_by"])

    def test_gate_active_no_identity_denies_before_route_body(self):
        self.app.dependency_overrides[require_api_key_owner] = _raise_no_identity

        response = self.client.post("/v1/api-keys", json={"name": "Test Key"})

        self.assertEqual(response.status_code, 403)

    @patch('ark_api.api.v1.api_keys.APIKeyService')
    def test_gate_active_authorized_owner_allows_creation(self, mock_service_class):
        self.app.dependency_overrides[require_api_key_owner] = (
            lambda: UserIdentity(username="alice@example.com", groups=["viewers"])
        )

        mock_service = Mock()
        mock_service_class.return_value = mock_service
        now = datetime.now(timezone.utc)
        mock_response = Mock(
            id="test-id", public_key="pk-ark-test",
            secret_key="sk-ark-test", created_at=now, expires_at=None
        )
        mock_response.name = "Test Key"
        mock_service.create_api_key = AsyncMock(return_value=mock_response)

        with _patch_ssar(can_create=True):
            response = self.client.post("/v1/api-keys", json={"name": "Test Key"})

        self.assertEqual(response.status_code, 201)
        mock_service.create_api_key.assert_called_once()
        self.assertEqual(mock_service.create_api_key.call_args[1]["created_by"], "alice@example.com")

    @patch('ark_api.api.v1.api_keys.APIKeyService')
    def test_gate_active_unauthorized_owner_denies_creation(self, mock_service_class):
        """The identity denied `secrets:create` cannot obtain that access by minting a key."""
        self.app.dependency_overrides[require_api_key_owner] = (
            lambda: UserIdentity(username="alice@example.com", groups=["viewers"])
        )

        mock_service = Mock()
        mock_service_class.return_value = mock_service
        mock_service.create_api_key = AsyncMock()

        with _patch_ssar(can_create=False):
            response = self.client.post("/v1/api-keys", json={"name": "Test Key"})

        self.assertEqual(response.status_code, 403)
        mock_service.create_api_key.assert_not_called()


class TestAPIKeyListDeleteScoping(unittest.TestCase):
    """Test cases for creator-scoped list/delete."""

    def setUp(self):
        from ark_api.main import app
        self.app = app
        self.client = TestClient(app)

    def tearDown(self):
        self.app.dependency_overrides.clear()

    @patch('ark_api.api.v1.api_keys.APIKeyService')
    def test_list_scoped_to_owner_when_gate_active(self, mock_service_class):
        self.app.dependency_overrides[require_api_key_owner] = (
            lambda: UserIdentity(username="alice@example.com", groups=[])
        )

        mock_service = Mock()
        mock_service_class.return_value = mock_service
        mock_list_response = Mock(items=[], count=0)
        mock_service.list_api_keys = AsyncMock(return_value=mock_list_response)

        response = self.client.get("/v1/api-keys")

        self.assertEqual(response.status_code, 200)
        mock_service.list_api_keys.assert_called_once_with(created_by="alice@example.com")

    @patch('ark_api.api.v1.api_keys.APIKeyService')
    def test_list_unscoped_when_gate_inactive(self, mock_service_class):
        self.app.dependency_overrides[require_api_key_owner] = lambda: None

        mock_service = Mock()
        mock_service_class.return_value = mock_service
        mock_list_response = Mock(items=[], count=0)
        mock_service.list_api_keys = AsyncMock(return_value=mock_list_response)

        response = self.client.get("/v1/api-keys")

        self.assertEqual(response.status_code, 200)
        mock_service.list_api_keys.assert_called_once_with(created_by=None)

    @patch('ark_api.api.v1.api_keys.APIKeyService')
    def test_delete_scoped_to_owner_when_gate_active(self, mock_service_class):
        self.app.dependency_overrides[require_api_key_owner] = (
            lambda: UserIdentity(username="bob@example.com", groups=[])
        )

        mock_service = Mock()
        mock_service_class.return_value = mock_service
        mock_service.delete_api_key = AsyncMock(return_value=False)

        response = self.client.delete("/v1/api-keys/pk-ark-someone-elses-key")

        self.assertEqual(response.status_code, 404)
        mock_service.delete_api_key.assert_called_once_with(
            "pk-ark-someone-elses-key", created_by="bob@example.com"
        )


if __name__ == '__main__':
    unittest.main()
