"""Tests for SecretClient Kubernetes secret management - adapted from ark-api tests."""
import unittest
import base64
from unittest.mock import Mock, AsyncMock, patch
from kubernetes_asyncio.client.rest import ApiException

from ark_sdk.k8s import SecretClient


class TestSecretClient(unittest.IsolatedAsyncioTestCase):
    """Test cases for SecretClient class - adapted from ark-api secret tests."""

    def setUp(self):
        """Set up test client."""
        self.client = SecretClient(namespace="test-namespace")

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_list_secrets_success(self, mock_v1_api, mock_api_client):
        """Test successful secret listing - adapted from ark-api test."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Mock secret objects (same as original ark-api test)
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
        
        # Test the method (adapted from API call to direct method call)
        result = await self.client.list_secrets()
        
        # Assert response (same assertions as original)
        self.assertEqual(result["count"], 2)
        self.assertEqual(len(result["items"]), 2)
        
        # Check first secret
        self.assertEqual(result["items"][0]["name"], "my-secret")
        self.assertEqual(result["items"][0]["id"], "uuid-1234-5678")
        
        # Check second secret
        self.assertEqual(result["items"][1]["name"], "app-config")
        self.assertEqual(result["items"][1]["id"], "uuid-abcd-efgh")
        
        # Verify namespace parameter was passed correctly
        mock_api_instance.list_namespaced_secret.assert_called_once_with(
            namespace="test-namespace",
            label_selector=None
        )

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_list_secrets_empty(self, mock_v1_api, mock_api_client):
        """Test listing secrets when none exist - adapted from ark-api test."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Mock empty response
        mock_api_instance = mock_v1_api.return_value
        mock_response = Mock()
        mock_response.items = []
        mock_api_instance.list_namespaced_secret = AsyncMock(return_value=mock_response)
        
        # Test the method
        result = await self.client.list_secrets()
        
        # Assert response
        self.assertEqual(result["count"], 0)
        self.assertEqual(result["items"], [])

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_list_secrets_kubernetes_api_error(self, mock_v1_api, mock_api_client):
        """Test handling of Kubernetes API errors - adapted from ark-api test."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Mock API exception for namespace not found
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.list_namespaced_secret = AsyncMock(side_effect=ApiException(
            status=404,
            reason="Not Found"
        ))
        
        # Test that exception is propagated
        with self.assertRaises(ApiException):
            await self.client.list_secrets()

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_list_secrets_forbidden_error(self, mock_v1_api, mock_api_client):
        """Test handling of forbidden access errors - adapted from ark-api test."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Mock API exception for forbidden access
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.list_namespaced_secret = AsyncMock(side_effect=ApiException(
            status=403,
            reason="Forbidden"
        ))
        
        # Test that exception is propagated
        with self.assertRaises(ApiException):
            await self.client.list_secrets()

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_get_secret_success(self, mock_v1_api, mock_api_client):
        """Test successfully retrieving a secret - adapted from ark-api test."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        secret_value = "dGVzdC10b2tlbg=="
        # Mock the secret response
        mock_secret = Mock()
        mock_secret.metadata.name = "test-secret"
        mock_secret.metadata.uid = "uuid-12345"
        mock_secret.metadata.annotations = {}
        mock_secret.type = "Opaque"
        mock_secret.data = {"token": secret_value}  # base64 encoded "test-token"
        
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.read_namespaced_secret = AsyncMock(return_value=mock_secret)
        
        # Test the method
        result = await self.client.get_secret("test-secret")
        
        # Assert response
        self.assertEqual(result["name"], "test-secret")
        self.assertEqual(result["id"], "uuid-12345")
        self.assertEqual(result["type"], "Opaque")
        self.assertEqual(result["secret_length"], len(secret_value))

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_create_secret_success(self, mock_v1_api, mock_api_client):
        """Test successful secret creation with token - adapted from ark-api test."""
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
        
        # Test the method
        result = await self.client.create_secret(
            name="test-secret",
            string_data={"token": "test-token"}
        )
        
        # Assert response
        self.assertEqual(result["name"], "test-secret")
        self.assertEqual(result["id"], "uuid-12345")
        self.assertEqual(result["type"], "Opaque")
        self.assertEqual(result["secret_length"], 10)  # length of "test-token"
        self.assertEqual(result["annotations"], {"ark.mckinsey.com/dashboard-icon": "icons/gemini.png"})

    def test_create_secret_invalid_fields(self):
        """Test creating secret with invalid fields - adapted from ark-api test."""
        # Test validation directly
        with self.assertRaises(ValueError) as context:
            self.client.validate_and_encode_token({
                "token": "test-token",
                "password": "should-not-be-allowed"
            })
        
        # Assert response
        self.assertIn("Only 'token' field is allowed", str(context.exception))
        self.assertIn("password", str(context.exception))

    def test_create_secret_empty_data(self):
        """Test creating secret with empty string_data - adapted from ark-api test."""
        # Test validation directly
        with self.assertRaises(ValueError) as context:
            self.client.validate_and_encode_token({})
        
        # Assert response
        self.assertEqual(str(context.exception), "Secret data cannot be empty")

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_create_secret_kubernetes_conflict(self, mock_v1_api, mock_api_client):
        """Test handling of Kubernetes conflict error - adapted from ark-api test."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Mock API exception
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.create_namespaced_secret = AsyncMock(side_effect=ApiException(
            status=409,
            reason="Conflict"
        ))
        
        # Test that exception is propagated
        with self.assertRaises(ApiException):
            await self.client.create_secret("existing-secret", {"token": "test-token"})

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_update_secret_success(self, mock_v1_api, mock_api_client):
        """Test successful secret update with token - adapted from ark-api test."""
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
        mock_api_instance.read_namespaced_secret = AsyncMock(return_value=mock_secret)
        mock_api_instance.replace_namespaced_secret = AsyncMock(return_value=mock_secret)
        
        # Test the method
        result = await self.client.update_secret(
            name="test-secret",
            string_data={"token": "new-token"}
        )
        
        # Assert response
        self.assertEqual(result["name"], "test-secret")
        self.assertEqual(result["id"], "uuid-12345")
        self.assertEqual(result["type"], "Opaque")
        self.assertEqual(result["secret_length"], 9)  # length of "new-token"

    def test_update_secret_invalid_fields(self):
        """Test updating secret with invalid fields - adapted from ark-api test."""
        # Test validation directly
        with self.assertRaises(ValueError) as context:
            self.client.validate_and_encode_token({
                "token": "new-token",
                "apiKey": "should-not-be-allowed"
            })
        
        # Assert response
        self.assertIn("Only 'token' field is allowed", str(context.exception))
        self.assertIn("apiKey", str(context.exception))

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_update_secret_not_found(self, mock_v1_api, mock_api_client):
        """Test updating non-existent secret - adapted from ark-api test."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Mock API exception
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.read_namespaced_secret = AsyncMock(side_effect=ApiException(
            status=404,
            reason="Not Found"
        ))
        
        # Test that exception is propagated
        with self.assertRaises(ApiException):
            await self.client.update_secret("nonexistent", {"token": "new-token"})

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_get_secret_value_success(self, mock_v1_api, mock_api_client):
        """Test retrieving specific key value from an Opaque secret."""
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_secret = Mock()
        mock_secret.metadata.name = "test-secret"
        mock_secret.metadata.uid = "uuid-12345"
        mock_secret.type = "Opaque"
        mock_secret.data = {"token": "dGVzdC10b2tlbg=="}  # base64 encoded "test-token"

        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.read_namespaced_secret = AsyncMock(return_value=mock_secret)

        result = await self.client.get_secret_value("test-secret", "token")

        self.assertEqual(result["name"], "test-secret")
        self.assertEqual(result["id"], "uuid-12345")
        self.assertEqual(result["type"], "Opaque")
        self.assertEqual(result["value"], "dGVzdC10b2tlbg==")

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_get_secret_value_invalid_key(self, mock_v1_api, mock_api_client):
        """Test ValueError is raised when key does not exist in secret."""
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_secret = Mock()
        mock_secret.metadata.name = "test-secret"
        mock_secret.metadata.uid = "uuid-12345"
        mock_secret.type = "Opaque"
        mock_secret.data = {"token": "dGVzdC10b2tlbg=="}

        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.read_namespaced_secret = AsyncMock(return_value=mock_secret)

        with self.assertRaises(ValueError) as context:
            await self.client.get_secret_value("test-secret", "missing-key")

        self.assertIn("Invalid key missing-key for secret test-secret", str(context.exception))

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_get_secret_value_secret_not_found(self, mock_v1_api, mock_api_client):
        """Test exception is raised when secret does not exist."""
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.read_namespaced_secret = AsyncMock(side_effect=ApiException(
            status=404,
            reason="Not Found"
        ))

        with self.assertRaises(ApiException):
            await self.client.get_secret_value("nonexistent-secret", "token")

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_delete_secret_success(self, mock_v1_api, mock_api_client):
        """Test successful secret deletion - adapted from ark-api test."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Mock successful deletion (no return value)
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.delete_namespaced_secret = AsyncMock(return_value=None)
        
        # Test the method
        result = await self.client.delete_secret("test-secret")
        
        # Assert response
        self.assertTrue(result)
        
        # Verify the delete was called correctly
        mock_api_instance.delete_namespaced_secret.assert_called_once_with(
            name="test-secret",
            namespace="test-namespace"
        )

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_delete_secret_not_found(self, mock_v1_api, mock_api_client):
        """Test deleting non-existent secret - adapted from ark-api test."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Mock API exception
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.delete_namespaced_secret = AsyncMock(side_effect=ApiException(
            status=404,
            reason="Not Found"
        ))
        
        # Test that exception is propagated
        with self.assertRaises(ApiException):
            await self.client.delete_secret("nonexistent")

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_delete_secret_forbidden(self, mock_v1_api, mock_api_client):
        """Test deleting secret without permissions - adapted from ark-api test."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Mock API exception
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.delete_namespaced_secret = AsyncMock(side_effect=ApiException(
            status=403,
            reason="Forbidden"
        ))
        
        # Test that exception is propagated
        with self.assertRaises(ApiException):
            await self.client.delete_secret("protected-secret")


if __name__ == '__main__':
    unittest.main()
