"""Tests for SecretClient Kubernetes secret management - adapted from ark-api tests."""
import inspect
import unittest
import base64
import json
from unittest.mock import Mock, AsyncMock, MagicMock, patch, call
from kubernetes_asyncio.client.rest import ApiException

from ark_sdk.k8s import SecretClient, _build_labels_and_annotations, read_secret_labels
from ark_sdk.secret_scope import PersonalSecretError, SecretScope, SecretScopeChangeError, SecretScopeError, scope_kind

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
        existing_secret.metadata.name = "test-secret"
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
        existing_secret.metadata.name = "test-secret"
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
    {"ark.mckinsey.com/resource-type": "secret", "ark.mckinsey.com/scope": "user-0123456789abcdef"},
]

ALICE = "alice@example.com"
ALICE_SCOPE = "user-ff8d9819fc0e12bf"
ALICE_LABELS = {"ark.mckinsey.com/resource-type": "secret", "ark.mckinsey.com/scope": ALICE_SCOPE}


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

    def _stored(self, labels, name="legacy-token"):
        secret = Mock()
        secret.metadata.name = name
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
        await SecretClient(namespace="ns", scope=SecretScope.for_user(ALICE)).list_secrets()

        self.assertEqual(
            self.v1.list_namespaced_secret.call_args.kwargs["label_selector"],
            f"ark.mckinsey.com/resource-type=secret,ark.mckinsey.com/scope in (shared,{ALICE_SCOPE})",
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
        self._stored(ALICE_LABELS, name="u-ff8d9819fc0e12bf-github")

        result = await SecretClient(namespace="ns", scope=SecretScope.for_user(ALICE)).get_secret("u-ff8d9819fc0e12bf-github")

        self.assertEqual(result["name"], "u-ff8d9819fc0e12bf-github")
        self.assertEqual(result["display_name"], "github")
        self.assertEqual(result["scope"], "personal")

    async def test_another_users_personal_secret_is_not_found(self, _):
        self._stored(ALICE_LABELS, name="u-ff8d9819fc0e12bf-github")
        client = SecretClient(namespace="ns", scope=SecretScope.for_user("bob@example.com"))

        with self.assertRaises(ApiException) as raised:
            await client.update_secret("u-ff8d9819fc0e12bf-github", scope="shared")

        self.assertEqual(raised.exception.status, 404)
        self.v1.replace_namespaced_secret.assert_not_called()

    async def test_another_users_personal_secret_cannot_be_read_or_deleted(self, _):
        self._stored(ALICE_LABELS, name="u-ff8d9819fc0e12bf-github")
        bob = SecretClient(namespace="ns", scope=SecretScope.for_user("bob@example.com"))
        operations = {
            "get": lambda: bob.get_secret("u-ff8d9819fc0e12bf-github"),
            "delete": lambda: bob.delete_secret("u-ff8d9819fc0e12bf-github"),
            "invalid scope": lambda: bob.update_secret("u-ff8d9819fc0e12bf-github", scope="everyone"),
        }
        for operation, call_operation in operations.items():
            with self.subTest(operation=operation):
                with self.assertRaises(ApiException) as raised:
                    await call_operation()
                self.assertEqual(raised.exception.status, 404)

        self.v1.replace_namespaced_secret.assert_not_called()
        self.v1.delete_namespaced_secret.assert_not_called()

    async def test_list_selects_the_users_scope(self, _):
        await SecretClient(namespace="ns", scope=SecretScope.for_user(ALICE)).list_secrets()

        self.assertEqual(
            self.v1.list_namespaced_secret.call_args.kwargs["label_selector"],
            f"ark.mckinsey.com/resource-type=secret,ark.mckinsey.com/scope in (shared,{ALICE_SCOPE})",
        )

    async def test_list_reports_scope_and_display_name(self, _):
        shared = Mock()
        shared.metadata.name = "openai"
        shared.metadata.uid = "uuid-shared"
        shared.metadata.labels = dict(SYSTEM_LABELS)
        shared.metadata.annotations = {}
        personal = Mock()
        personal.metadata.name = "u-ff8d9819fc0e12bf-github"
        personal.metadata.uid = "uuid-personal"
        personal.metadata.labels = dict(ALICE_LABELS)
        personal.metadata.annotations = {}
        self.v1.list_namespaced_secret = AsyncMock(return_value=Mock(items=[shared, personal]))

        result = await SecretClient(namespace="ns", scope=SecretScope.for_user(ALICE)).list_secrets()

        self.assertEqual(
            [(item["name"], item["display_name"], item["scope"]) for item in result["items"]],
            [("openai", "openai", "shared"), ("u-ff8d9819fc0e12bf-github", "github", "personal")],
        )

    async def test_create_personal_secret_prefixes_the_name_and_labels_the_owner(self, _):
        self.v1.create_namespaced_secret = AsyncMock(side_effect=lambda namespace, body: body)

        result = await SecretClient(namespace="ns", scope=SecretScope.for_user(ALICE)).create_secret(
            "github", {"token": "ghp"}, labels=["prod"], personal=True
        )

        body = self.v1.create_namespaced_secret.call_args.kwargs["body"]
        self.assertEqual(body.metadata.name, "u-ff8d9819fc0e12bf-github")
        self.assertEqual(body.metadata.labels, {**ALICE_LABELS, "ark.mckinsey.com/label.prod": "true"})
        self.assertEqual(result["display_name"], "github")
        self.assertEqual(result["scope"], "personal")

    async def test_create_shared_secret_with_a_user_scope_stays_shared(self, _):
        self.v1.create_namespaced_secret = AsyncMock(side_effect=lambda namespace, body: body)

        result = await SecretClient(namespace="ns", scope=SecretScope.for_user(ALICE)).create_secret(
            "openai", {"token": "sk"}
        )

        body = self.v1.create_namespaced_secret.call_args.kwargs["body"]
        self.assertEqual(body.metadata.name, "openai")
        self.assertEqual(body.metadata.labels, SYSTEM_LABELS)
        self.assertEqual(result["scope"], "shared")

    async def test_create_personal_secret_needs_a_user(self, _):
        self.v1.create_namespaced_secret = AsyncMock()

        with self.assertRaises(SecretScopeError):
            await SecretClient(namespace="ns").create_secret("github", {"token": "ghp"}, personal=True)

        self.v1.create_namespaced_secret.assert_not_called()

    async def test_personal_only_scope_cannot_create_shared(self, _):
        self.v1.create_namespaced_secret = AsyncMock()

        with self.assertRaises(SecretScopeError):
            await SecretClient(namespace="ns", scope=SecretScope((ALICE_SCOPE,))).create_secret("openai", {"token": "sk"})

        self.v1.create_namespaced_secret.assert_not_called()

    async def test_create_personal_secret_rejects_a_reserved_name(self, _):
        self.v1.create_namespaced_secret = AsyncMock()

        with self.assertRaises(ValueError):
            await SecretClient(namespace="ns", scope=SecretScope.for_user(ALICE)).create_secret(
                "u-0123456789abcdef-x", {"token": "ghp"}, personal=True
            )

        self.v1.create_namespaced_secret.assert_not_called()

    async def test_promote_flips_the_scope_label_and_keeps_the_name(self, _):
        stored = self._stored(
            {**ALICE_LABELS, "ark.mckinsey.com/label.prod": "true", "app": "github"},
            name="u-ff8d9819fc0e12bf-github",
        )
        self.v1.replace_namespaced_secret = AsyncMock(side_effect=lambda name, namespace, body: body)

        result = await SecretClient(namespace="ns", scope=SecretScope.for_user(ALICE)).update_secret(
            "u-ff8d9819fc0e12bf-github", labels=["prod"], scope="shared"
        )

        kwargs = self.v1.replace_namespaced_secret.call_args.kwargs
        self.assertEqual(kwargs["name"], "u-ff8d9819fc0e12bf-github")
        self.assertEqual(
            kwargs["body"].metadata.labels,
            {**SYSTEM_LABELS, "ark.mckinsey.com/label.prod": "true", "app": "github"},
        )
        self.assertIs(kwargs["body"], stored)
        self.assertEqual(result["display_name"], "github")
        self.assertEqual(result["scope"], "shared")

    async def test_personal_only_scope_cannot_promote(self, _):
        self._stored(dict(ALICE_LABELS), name="u-ff8d9819fc0e12bf-github")

        with self.assertRaises(SecretScopeChangeError):
            await SecretClient(namespace="ns", scope=SecretScope((ALICE_SCOPE,))).update_secret(
                "u-ff8d9819fc0e12bf-github", scope="shared"
            )

        self.v1.replace_namespaced_secret.assert_not_called()

    async def test_invalid_scope_on_a_personal_secret_is_refused(self, _):
        self._stored(dict(ALICE_LABELS), name="u-ff8d9819fc0e12bf-github")

        for scope in ("everyone", ""):
            with self.subTest(scope=scope):
                with self.assertRaises(SecretScopeChangeError):
                    await SecretClient(namespace="ns", scope=SecretScope.for_user(ALICE)).update_secret(
                        "u-ff8d9819fc0e12bf-github", scope=scope
                    )

        self.v1.replace_namespaced_secret.assert_not_called()

    async def test_update_without_scope_keeps_a_personal_secret_personal(self, _):
        self._stored(dict(ALICE_LABELS), name="u-ff8d9819fc0e12bf-github")
        self.v1.replace_namespaced_secret = AsyncMock(side_effect=lambda name, namespace, body: body)

        for scope in (None, "personal"):
            with self.subTest(scope=scope):
                result = await SecretClient(namespace="ns", scope=SecretScope.for_user(ALICE)).update_secret(
                    "u-ff8d9819fc0e12bf-github", string_data={"token": "new"}, scope=scope
                )
                self.assertEqual(
                    self.v1.replace_namespaced_secret.call_args.kwargs["body"].metadata.labels, ALICE_LABELS
                )
                self.assertEqual(result["scope"], "personal")

    async def test_shared_secret_cannot_be_made_personal(self, _):
        self._stored(dict(SYSTEM_LABELS), name="openai")

        for scope in ("personal", "everyone", ""):
            with self.subTest(scope=scope):
                with self.assertRaises(SecretScopeChangeError):
                    await SecretClient(namespace="ns", scope=SecretScope.for_user(ALICE)).update_secret(
                        "openai", scope=scope
                    )

        self.v1.replace_namespaced_secret.assert_not_called()

    async def test_sharing_a_shared_secret_changes_nothing(self, _):
        self._stored(dict(SYSTEM_LABELS), name="openai")
        self.v1.replace_namespaced_secret = AsyncMock(side_effect=lambda name, namespace, body: body)

        await SecretClient(namespace="ns").update_secret("openai", scope="shared")

        self.assertEqual(self.v1.replace_namespaced_secret.call_args.kwargs["body"].metadata.labels, SYSTEM_LABELS)

    async def test_get_secret_value_reads_unlabelled_secret(self, _):
        self._stored({})

        result = await SecretClient(namespace="ns").get_secret_value("legacy-token", "token")

        self.assertEqual(result["value"], "dGVzdC10b2tlbg==")

    async def test_get_secret_value_refuses_personal_secret_by_default(self, _):
        self._stored(ALICE_LABELS, name="u-ff8d9819fc0e12bf-github")

        with self.assertRaises(PersonalSecretError) as raised:
            await SecretClient(namespace="ns").get_secret_value("u-ff8d9819fc0e12bf-github", "token")

        self.assertIn("mcpserver override", str(raised.exception))
        self.assertNotIn("dGVzdC10b2tlbg==", str(raised.exception))
        self.assertNotIn("test-token", str(raised.exception))

    async def test_get_secret_value_refuses_personal_secret_whatever_the_client_scope(self, _):
        self._stored(ALICE_LABELS, name="u-ff8d9819fc0e12bf-github")

        with self.assertRaises(PersonalSecretError):
            await SecretClient(namespace="ns", scope=SecretScope.for_user(ALICE)).get_secret_value(
                "u-ff8d9819fc0e12bf-github", "token"
            )

    async def test_get_secret_value_reads_personal_secret_when_allowed(self, _):
        self._stored(ALICE_LABELS, name="u-ff8d9819fc0e12bf-github")

        result = await SecretClient(namespace="ns").get_secret_value(
            "u-ff8d9819fc0e12bf-github", "token", allow_personal=True
        )

        self.assertEqual(result["value"], "dGVzdC10b2tlbg==")

    async def test_get_secret_value_reads_promoted_and_non_personal_secrets(self, _):
        not_personal = [labels for labels in OUT_OF_SCOPE_LABELS if scope_kind(labels) != "personal"]
        for labels in [SYSTEM_LABELS, *not_personal]:
            with self.subTest(labels=labels):
                self._stored(labels, name="u-ff8d9819fc0e12bf-promoted")

                result = await SecretClient(namespace="ns").get_secret_value("u-ff8d9819fc0e12bf-promoted", "token")

                self.assertEqual(result["value"], "dGVzdC10b2tlbg==")


@patch('ark_sdk.k8s.ApiClient')
class TestReadSecretLabels(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        patcher = patch('ark_sdk.k8s.init_k8s', new=AsyncMock())
        patcher.start()
        self.addCleanup(patcher.stop)
        v1_patcher = patch('ark_sdk.k8s.client.CoreV1Api')
        self.v1 = v1_patcher.start().return_value
        self.addCleanup(v1_patcher.stop)

    async def test_returns_the_labels_of_any_secret(self, mock_api_client):
        for labels, expected in ((ALICE_LABELS, ALICE_LABELS), ({"app": "legacy"}, {"app": "legacy"}), (None, {})):
            with self.subTest(labels=labels):
                self.v1.read_namespaced_secret = AsyncMock(return_value=Mock(metadata=Mock(labels=labels)))

                self.assertEqual(await read_secret_labels("ns", "u-ff8d9819fc0e12bf-github"), expected)

        self.v1.read_namespaced_secret.assert_called_with(name="u-ff8d9819fc0e12bf-github", namespace="ns")
        mock_api_client.return_value.set_default_header.assert_not_called()
        mock_api_client.return_value.__aenter__.return_value.set_default_header.assert_not_called()

    def test_takes_only_namespace_and_name(self, _):
        self.assertEqual(list(inspect.signature(read_secret_labels).parameters), ["namespace", "name"])

    async def test_missing_secret_is_none(self, _):
        self.v1.read_namespaced_secret = AsyncMock(side_effect=ApiException(status=404, reason="Not Found"))

        self.assertIsNone(await read_secret_labels("ns", "missing"))

    async def test_other_errors_propagate(self, _):
        self.v1.read_namespaced_secret = AsyncMock(side_effect=ApiException(status=403, reason="Forbidden"))

        with self.assertRaises(ApiException) as raised:
            await read_secret_labels("ns", "protected")

        self.assertEqual(raised.exception.status, 403)


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
