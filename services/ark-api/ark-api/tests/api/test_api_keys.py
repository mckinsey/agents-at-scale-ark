"""Test cases for API key endpoints."""

import os
import unittest
from unittest.mock import Mock, patch, AsyncMock
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient

# Set environment variable to skip authentication before importing the app
from ark_api.auth.constants import AuthMode
os.environ["AUTH_MODE"] = AuthMode.OPEN


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
        mock_service.delete_api_key.assert_called_once_with(public_key)
    
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


if __name__ == '__main__':
    unittest.main()
