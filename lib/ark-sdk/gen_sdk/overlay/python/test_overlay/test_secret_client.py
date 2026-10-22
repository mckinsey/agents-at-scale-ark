"""Tests for SecretClient Kubernetes secret management - adapted from ark-api tests."""
import unittest
import base64
import json
from unittest.mock import Mock, AsyncMock, MagicMock, patch, call
from kubernetes_asyncio.client.rest import ApiException

from ark_sdk.k8s import SecretClient, _build_labels_and_annotations
from ark_sdk.secret_scope import SecretScope

SYSTEM_LABELS = {
    "ark.mckinsey.com/resource-type": "secret",
    "ark.mckinsey.com/scope": "shared",
}

_LEAKED_PASSWORD = "sup3rs3cret"
_LEAKED_TOKEN_B64 = base64.b64encode(b"sk-FAKE-token").decode()

# An annotation set mirroring a secret that has passed through `kubectl apply`:
# last-applied-configuration carries the whole manifest, values included, next
# to a Helm ownership annotation and an Ark-owned one. Only the last should
# survive SecretClient's response.
NON_ARK_ANNOTATIONS = {
    "kubectl.kubernetes.io/last-applied-configuration": json.dumps({
        "apiVersion": "v1",
        "kind": "Secret",
        "metadata": {"name": "test-secret"},
        "stringData": {"password": _LEAKED_PASSWORD},
        "data": {"token": _LEAKED_TOKEN_B64},
        "type": "Opaque",
    }),
    "meta.helm.sh/release-name": "my-release",
    "ark.mckinsey.com/dashboard-icon": "icons/gemini.png",
}


def _assert_no_leaked_annotations(test_case, result):
    test_case.assertEqual(result["annotations"], {"ark.mckinsey.com/dashboard-icon": "icons/gemini.png"})
    serialized = json.dumps(result)
    test_case.assertNotIn(_LEAKED_PASSWORD, serialized)
    test_case.assertNotIn(_LEAKED_TOKEN_B64, serialized)
    test_case.assertNotIn("kubectl.kubernetes.io/last-applied-configuration", serialized)
    test_case.assertNotIn("meta.helm.sh/release-name", serialized)


class TestSecretClient(unittest.IsolatedAsyncioTestCase):
    """Test cases for SecretClient class - adapted from ark-api secret tests."""

    def setUp(self):
        """Set up test client."""
        self.client = SecretClient(namespace="test-namespace")
        patcher = patch('ark_sdk.k8s.init_k8s', new=AsyncMock())
        self.mock_init_k8s = patcher.start()
        self.addCleanup(patcher.stop)

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
        mock_secret1.metadata.labels = {}

        mock_secret2 = Mock()
        mock_secret2.metadata.name = "app-config"
        mock_secret2.metadata.uid = "uuid-abcd-efgh"
        mock_secret2.metadata.annotations = {}
        mock_secret2.metadata.labels = {}
        
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
            label_selector="ark.mckinsey.com/resource-type=secret,ark.mckinsey.com/scope in (shared)"
        )

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_list_secrets_filters_non_ark_annotations(self, mock_v1_api, mock_api_client):
        """A secret carrying last-applied-configuration must not expose its values."""
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_secret = Mock()
        mock_secret.metadata.name = "test-secret"
        mock_secret.metadata.uid = "uuid-12345"
        mock_secret.metadata.annotations = NON_ARK_ANNOTATIONS
        mock_secret.metadata.labels = {}

        mock_api_instance = mock_v1_api.return_value
        mock_response = Mock()
        mock_response.items = [mock_secret]
        mock_api_instance.list_namespaced_secret = AsyncMock(return_value=mock_response)

        result = await self.client.list_secrets()

        _assert_no_leaked_annotations(self, result["items"][0])

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
        mock_secret.metadata.labels = dict(SYSTEM_LABELS)
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
    async def test_get_secret_filters_non_ark_annotations(self, mock_v1_api, mock_api_client):
        """A secret carrying last-applied-configuration must not expose its values."""
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_secret = Mock()
        mock_secret.metadata.name = "test-secret"
        mock_secret.metadata.uid = "uuid-12345"
        mock_secret.metadata.annotations = NON_ARK_ANNOTATIONS
        mock_secret.metadata.labels = dict(SYSTEM_LABELS)
        mock_secret.type = "Opaque"
        mock_secret.data = {"token": "placeholder"}

        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.read_namespaced_secret = AsyncMock(return_value=mock_secret)

        result = await self.client.get_secret("test-secret")

        _assert_no_leaked_annotations(self, result)

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
        mock_secret.metadata.labels = {}
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
        # base64 length, consistent with get_secret/update_secret
        self.assertEqual(result["secret_length"], len("dGVzdC10b2tlbg=="))
        self.assertEqual(result["annotations"], {"ark.mckinsey.com/dashboard-icon": "icons/gemini.png"})

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_create_secret_filters_non_ark_annotations(self, mock_v1_api, mock_api_client):
        """A secret carrying last-applied-configuration must not expose its values."""
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_secret = Mock()
        mock_secret.metadata.name = "test-secret"
        mock_secret.metadata.uid = "uuid-12345"
        mock_secret.metadata.annotations = NON_ARK_ANNOTATIONS
        mock_secret.metadata.labels = {}
        mock_secret.type = "Opaque"
        mock_secret.data = {"token": "dGVzdC10b2tlbg=="}

        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.create_namespaced_secret = AsyncMock(return_value=mock_secret)

        result = await self.client.create_secret(
            name="test-secret",
            string_data={"token": "test-token"}
        )

        _assert_no_leaked_annotations(self, result)

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
    async def test_create_secret_rejects_invalid_label(self, mock_v1_api, mock_api_client):
        """A direct SDK caller (bypassing the FastAPI model) still gets a clear error."""
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        with self.assertRaises(ValueError):
            await self.client.create_secret(
                name="test-secret",
                string_data={"token": "test-token"},
                labels=["has space"],
            )

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_create_secret_writes_description_alias_and_labels(self, mock_v1_api, mock_api_client):
        """Create stamps description/alias annotations, tag labels and the system labels, never the resource-type annotation."""
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_secret = Mock()
        mock_secret.metadata.name = "test-secret"
        mock_secret.metadata.uid = "uuid-12345"
        mock_secret.metadata.annotations = {
            "ark.mckinsey.com/description": "API token",
            "ark.mckinsey.com/alias": "my-token",
        }
        mock_secret.metadata.labels = {"ark.mckinsey.com/label.prod": "true"}
        mock_secret.type = "Opaque"
        mock_secret.data = {"token": "dGVzdC10b2tlbg=="}

        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.create_namespaced_secret = AsyncMock(return_value=mock_secret)

        result = await self.client.create_secret(
            name="test-secret",
            string_data={"token": "test-token"},
            description="API token",
            alias="my-token",
            labels=["prod"],
        )

        body = mock_api_instance.create_namespaced_secret.call_args.kwargs["body"]
        self.assertEqual(body.metadata.annotations, {
            "ark.mckinsey.com/description": "API token",
            "ark.mckinsey.com/alias": "my-token",
        })
        self.assertEqual(body.metadata.labels, {"ark.mckinsey.com/label.prod": "true", **SYSTEM_LABELS})
        self.assertNotIn("ark.mckinsey.com/resource-type", body.metadata.annotations)

        self.assertEqual(result["description"], "API token")
        self.assertEqual(result["alias"], "my-token")
        self.assertEqual(result["labels"], ["prod"])

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_create_secret_rejects_reserved_user_prefix(self, mock_v1_api, mock_api_client):
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.create_namespaced_secret = AsyncMock()

        with self.assertRaises(ValueError):
            await self.client.create_secret("u-0123456789abcdef-x", {"token": "test-token"})

        mock_api_instance.create_namespaced_secret.assert_not_called()

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
        mock_secret.metadata.labels = dict(SYSTEM_LABELS)
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
        self.assertEqual(result["secret_length"], len("bmV3LXRva2Vu"))  # length of base64-encoded "new-token"

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_update_secret_filters_non_ark_annotations(self, mock_v1_api, mock_api_client):
        """A secret carrying last-applied-configuration must not expose its values."""
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_secret = Mock()
        mock_secret.metadata.name = "test-secret"
        mock_secret.metadata.uid = "uuid-12345"
        mock_secret.metadata.annotations = NON_ARK_ANNOTATIONS
        mock_secret.metadata.labels = dict(SYSTEM_LABELS)
        mock_secret.type = "Opaque"
        mock_secret.data = {"token": "bmV3LXRva2Vu"}

        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.read_namespaced_secret = AsyncMock(return_value=mock_secret)
        mock_api_instance.replace_namespaced_secret = AsyncMock(return_value=mock_secret)

        result = await self.client.update_secret(
            name="test-secret",
            string_data={"token": "new-token"}
        )

        _assert_no_leaked_annotations(self, result)

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_update_secret_without_string_data_leaves_value_unchanged(self, mock_v1_api, mock_api_client):
        """Omitting string_data on update patches only metadata, not the secret value."""
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        existing_secret = Mock()
        existing_secret.metadata.name = "test-secret"
        existing_secret.metadata.uid = "uuid-12345"
        existing_secret.metadata.labels = dict(SYSTEM_LABELS)
        existing_secret.metadata.annotations = {}
        existing_secret.type = "Opaque"
        existing_secret.data = {"token": "b2xkLXRva2Vu"}

        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.read_namespaced_secret = AsyncMock(return_value=existing_secret)
        mock_api_instance.replace_namespaced_secret = AsyncMock(return_value=existing_secret)

        with patch.object(self.client, "validate_and_encode_token") as mock_validate:
            result = await self.client.update_secret(
                name="test-secret",
                description="updated description",
            )
            mock_validate.assert_not_called()

        body = mock_api_instance.replace_namespaced_secret.call_args.kwargs["body"]
        self.assertEqual(body.metadata.annotations, {"ark.mckinsey.com/description": "updated description"})
        self.assertEqual(result["description"], "updated description")

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_update_secret_keeps_legacy_label(self, mock_v1_api, mock_api_client):
        """A label pre-dating the alphanumeric-only rule stays updatable if sent back unchanged."""
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        existing_secret = Mock()
        existing_secret.metadata.name = "test-secret"
        existing_secret.metadata.uid = "uuid-12345"
        existing_secret.metadata.labels = {**SYSTEM_LABELS, "ark.mckinsey.com/label.my-key": "true"}
        existing_secret.metadata.annotations = {}
        existing_secret.type = "Opaque"
        existing_secret.data = {"token": "b2xkLXRva2Vu"}

        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.read_namespaced_secret = AsyncMock(return_value=existing_secret)
        mock_api_instance.replace_namespaced_secret = AsyncMock(return_value=existing_secret)

        result = await self.client.update_secret(name="test-secret", labels=["my-key"])

        self.assertEqual(result["labels"], ["my-key"])

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_update_secret_rejects_new_non_alphanumeric_label(self, mock_v1_api, mock_api_client):
        """A brand-new label must still satisfy the alphanumeric-only rule."""
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        existing_secret = Mock()
        existing_secret.metadata.name = "test-secret"
        existing_secret.metadata.uid = "uuid-12345"
        existing_secret.metadata.labels = dict(SYSTEM_LABELS)
        existing_secret.metadata.annotations = {}
        existing_secret.type = "Opaque"
        existing_secret.data = {"token": "b2xkLXRva2Vu"}

        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.read_namespaced_secret = AsyncMock(return_value=existing_secret)

        with self.assertRaises(ValueError):
            await self.client.update_secret(name="test-secret", labels=["my-key"])

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_update_secret_keeps_system_labels(self, mock_v1_api, mock_api_client):
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()

        existing_secret = Mock()
        existing_secret.metadata.labels = {**SYSTEM_LABELS, "ark.mckinsey.com/label.old": "true"}
        existing_secret.metadata.annotations = {}
        existing_secret.data = {}

        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.read_namespaced_secret = AsyncMock(return_value=existing_secret)
        mock_api_instance.replace_namespaced_secret = AsyncMock(return_value=existing_secret)

        await self.client.update_secret(name="test-secret", labels=["new"])

        body = mock_api_instance.replace_namespaced_secret.call_args.kwargs["body"]
        self.assertEqual(body.metadata.labels, {**SYSTEM_LABELS, "ark.mckinsey.com/label.new": "true"})

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_update_secret_keeps_system_labels_when_tags_are_cleared(self, mock_v1_api, mock_api_client):
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()

        existing_secret = Mock()
        existing_secret.metadata.labels = {**SYSTEM_LABELS, "ark.mckinsey.com/label.old": "true"}
        existing_secret.metadata.annotations = {}
        existing_secret.data = {}

        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.read_namespaced_secret = AsyncMock(return_value=existing_secret)
        mock_api_instance.replace_namespaced_secret = AsyncMock(return_value=existing_secret)

        await self.client.update_secret(name="test-secret", labels=[])

        body = mock_api_instance.replace_namespaced_secret.call_args.kwargs["body"]
        self.assertIs(body, existing_secret)
        self.assertEqual(body.metadata.labels, SYSTEM_LABELS)

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
        
        existing_secret = Mock()
        existing_secret.metadata.uid = "uuid-12345"
        existing_secret.metadata.resource_version = "42"
        existing_secret.metadata.labels = dict(SYSTEM_LABELS)

        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.read_namespaced_secret = AsyncMock(return_value=existing_secret)
        mock_api_instance.delete_namespaced_secret = AsyncMock(return_value=None)

        result = await self.client.delete_secret("test-secret")

        self.assertTrue(result)
        kwargs = mock_api_instance.delete_namespaced_secret.call_args.kwargs
        self.assertEqual(kwargs["name"], "test-secret")
        self.assertEqual(kwargs["namespace"], "test-namespace")
        self.assertEqual(kwargs["body"].preconditions.uid, "uuid-12345")
        self.assertEqual(kwargs["body"].preconditions.resource_version, "42")

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_delete_secret_not_found(self, mock_v1_api, mock_api_client):
        """Test deleting non-existent secret - adapted from ark-api test."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.read_namespaced_secret = AsyncMock(side_effect=ApiException(
            status=404,
            reason="Not Found"
        ))
        mock_api_instance.delete_namespaced_secret = AsyncMock()

        with self.assertRaises(ApiException):
            await self.client.delete_secret("nonexistent")
        mock_api_instance.delete_namespaced_secret.assert_not_called()

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_delete_secret_forbidden(self, mock_v1_api, mock_api_client):
        """Test deleting secret without permissions - adapted from ark-api test."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.read_namespaced_secret = AsyncMock(return_value=Mock(
            metadata=Mock(uid="uuid-12345", labels=dict(SYSTEM_LABELS))
        ))
        mock_api_instance.delete_namespaced_secret = AsyncMock(side_effect=ApiException(
            status=403,
            reason="Forbidden"
        ))
        
        # Test that exception is propagated
        with self.assertRaises(ApiException):
            await self.client.delete_secret("protected-secret")


OUT_OF_SCOPE_LABELS = [
    None,
    {},
    {"app": "legacy"},
    {"ark.mckinsey.com/resource-type": "secret"},
    {"ark.mckinsey.com/scope": "shared"},
    {"ark.mckinsey.com/resource-type": "secret", "ark.mckinsey.com/scope": "user-abc"},
]


@patch('ark_sdk.k8s.ApiClient')
class TestSecretClientScope(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        patcher = patch('ark_sdk.k8s.init_k8s', new=AsyncMock())
        patcher.start()
        self.addCleanup(patcher.stop)
        v1_patcher = patch('ark_sdk.k8s.client.CoreV1Api')
        self.v1 = v1_patcher.start().return_value
        self.addCleanup(v1_patcher.stop)
        self.v1.list_namespaced_secret = AsyncMock(return_value=Mock(items=[]))
        self.v1.replace_namespaced_secret = AsyncMock()
        self.v1.delete_namespaced_secret = AsyncMock()

    def _stored(self, labels):
        secret = Mock()
        secret.metadata.name = "legacy-token"
        secret.metadata.uid = "uuid-legacy"
        secret.metadata.labels = labels
        secret.metadata.annotations = {}
        secret.type = "Opaque"
        secret.data = {"token": "dGVzdC10b2tlbg=="}
        self.v1.read_namespaced_secret = AsyncMock(return_value=secret)
        return secret

    async def test_list_combines_scope_with_caller_selector(self, _):
        await SecretClient(namespace="ns").list_secrets(label_selector="ark.mckinsey.com/label.prod=true")

        self.v1.list_namespaced_secret.assert_called_once_with(
            namespace="ns",
            label_selector="ark.mckinsey.com/resource-type=secret,ark.mckinsey.com/scope in (shared),ark.mckinsey.com/label.prod=true",
        )

    async def test_list_uses_every_scope_value(self, _):
        await SecretClient(namespace="ns", scope=SecretScope(("shared", "user-0123456789abcdef"))).list_secrets()

        self.assertEqual(
            self.v1.list_namespaced_secret.call_args.kwargs["label_selector"],
            "ark.mckinsey.com/resource-type=secret,ark.mckinsey.com/scope in (shared,user-0123456789abcdef)",
        )

    async def test_out_of_scope_secret_is_not_found(self, _):
        client = SecretClient(namespace="ns")
        operations = {
            "get": lambda: client.get_secret("legacy-token"),
            "update": lambda: client.update_secret("legacy-token", string_data={"token": "new-token"}),
            "delete": lambda: client.delete_secret("legacy-token"),
        }
        for labels in OUT_OF_SCOPE_LABELS:
            for operation, call_operation in operations.items():
                with self.subTest(labels=labels, operation=operation):
                    self._stored(labels)
                    with self.assertRaises(ApiException) as raised:
                        await call_operation()
                    self.assertEqual(raised.exception.status, 404)
                    self.assertEqual(raised.exception.reason, "Secret 'legacy-token' not found")

        self.v1.replace_namespaced_secret.assert_not_called()
        self.v1.delete_namespaced_secret.assert_not_called()

    async def test_user_scope_reaches_its_own_secret(self, _):
        self._stored({"ark.mckinsey.com/resource-type": "secret", "ark.mckinsey.com/scope": "user-0123456789abcdef"})

        result = await SecretClient(namespace="ns", scope=SecretScope(("shared", "user-0123456789abcdef"))).get_secret("legacy-token")

        self.assertEqual(result["name"], "legacy-token")

    async def test_get_secret_value_reads_unlabelled_secret(self, _):
        self._stored({})

        result = await SecretClient(namespace="ns").get_secret_value("legacy-token", "token")

        self.assertEqual(result["value"], "dGVzdC10b2tlbg==")


class TestBuildLabelsAndAnnotations(unittest.TestCase):
    def test_configurations_get_no_system_labels(self):
        labels, annotations = _build_labels_and_annotations(
            None, None, ["prod"], resource_type="configuration"
        )

        self.assertEqual(labels, {"ark.mckinsey.com/label.prod": "true"})
        self.assertEqual(annotations, {"ark.mckinsey.com/resource-type": "configuration"})

    def test_system_labels_win_over_existing_values(self):
        labels, _ = _build_labels_and_annotations(
            None,
            None,
            [],
            existing_labels={"ark.mckinsey.com/scope": "other"},
            system_labels=SYSTEM_LABELS,
        )

        self.assertEqual(labels, SYSTEM_LABELS)


class TestInitK8sCalledBeforeApiClient(unittest.IsolatedAsyncioTestCase):
    """Verify init_k8s is called before create_api_client in every SecretClient method."""

    def setUp(self):
        self.client = SecretClient(namespace="test-namespace")

    async def _assert_init_k8s_called_first(self, coro):
        mock_manager = Mock()
        mock_init_k8s = AsyncMock()
        mock_create_api_client = Mock()
        mock_api = AsyncMock()
        mock_api.__aenter__ = AsyncMock(return_value=mock_api)
        mock_api.__aexit__ = AsyncMock(return_value=False)
        mock_create_api_client.return_value = mock_api

        mock_manager.attach_mock(mock_init_k8s, "init_k8s")
        mock_manager.attach_mock(mock_create_api_client, "create_api_client")

        v1_mock = Mock()
        v1_mock.list_namespaced_secret = AsyncMock(return_value=Mock(items=[]))
        v1_mock.read_namespaced_secret = AsyncMock(return_value=Mock(
            metadata=Mock(name='s', uid='u', annotations={}),
            type='Opaque', data={'token': 'val'}
        ))
        v1_mock.create_namespaced_secret = AsyncMock(return_value=Mock(
            metadata=Mock(name='s', uid='u', annotations={}), type='Opaque'
        ))
        v1_mock.replace_namespaced_secret = AsyncMock(return_value=Mock(
            metadata=Mock(name='s', uid='u', annotations={}), type='Opaque'
        ))
        v1_mock.delete_namespaced_secret = AsyncMock(return_value=None)

        with patch('ark_sdk.k8s.init_k8s', mock_init_k8s), \
             patch('ark_sdk.k8s.create_api_client', mock_create_api_client), \
             patch('ark_sdk.k8s.client.CoreV1Api', return_value=v1_mock):
            try:
                await coro()
            except Exception:
                pass

        mock_manager.assert_has_calls([call.init_k8s(), call.create_api_client()])

    async def test_list_secrets_calls_init_k8s_first(self):
        await self._assert_init_k8s_called_first(self.client.list_secrets)

    async def test_get_secret_calls_init_k8s_first(self):
        await self._assert_init_k8s_called_first(lambda: self.client.get_secret('s'))

    async def test_get_secret_value_calls_init_k8s_first(self):
        await self._assert_init_k8s_called_first(lambda: self.client.get_secret_value('s', 'token'))

    async def test_create_secret_calls_init_k8s_first(self):
        await self._assert_init_k8s_called_first(lambda: self.client.create_secret('s', {'token': 'v'}))

    async def test_update_secret_calls_init_k8s_first(self):
        await self._assert_init_k8s_called_first(lambda: self.client.update_secret('s', {'token': 'v'}))

    async def test_delete_secret_calls_init_k8s_first(self):
        await self._assert_init_k8s_called_first(lambda: self.client.delete_secret('s'))


class TestSecretClientDefaultHeaders(unittest.TestCase):
    """SecretClient must apply default_headers so versioned-client secret access impersonates."""

    def test_default_headers_applied_to_api_client(self):
        secret_client = SecretClient(
            namespace="ns",
            default_headers={
                "Impersonate-User": "user@example.com",
                "Impersonate-Group": "team-a,team-b",
            },
        )
        api = Mock()
        secret_client._get_api_client(api)
        api.set_default_header.assert_any_call("Impersonate-User", "user@example.com")
        api.set_default_header.assert_any_call("Impersonate-Group", "team-a,team-b")

    def test_no_headers_is_noop(self):
        api = Mock()
        SecretClient(namespace="ns")._get_api_client(api)
        api.set_default_header.assert_not_called()


if __name__ == '__main__':
    unittest.main()
