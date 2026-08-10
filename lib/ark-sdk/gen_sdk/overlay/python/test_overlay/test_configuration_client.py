"""Tests for ConfigurationClient, the ConfigMap-backed Ark configuration store."""
import unittest
from unittest.mock import Mock, AsyncMock, patch, call
from kubernetes_asyncio.client.rest import ApiException

from ark_sdk.k8s import ConfigurationClient
from ark_sdk.labels import (
    ARK_RESOURCE_TYPE_LABEL,
    CONFIGURATION_LABEL_SELECTOR,
    labels_to_tags,
    strip_ark_labels,
    tags_to_labels,
    validate_tag,
)

MARKER_LABELS = {ARK_RESOURCE_TYPE_LABEL: "configuration"}


def _config_map(name="github-mcp-url", uid="uuid-1234", value="https://example.test/mcp/",
                labels=None, annotations=None):
    config_map = Mock()
    config_map.metadata.name = name
    config_map.metadata.uid = uid
    config_map.metadata.labels = {**MARKER_LABELS, **(labels or {})}
    config_map.metadata.annotations = annotations or {}
    config_map.data = {"value": value} if value is not None else {}
    return config_map


class TestLabelHelpers(unittest.TestCase):
    """Tags round-trip through Kubernetes labels and reject what Kubernetes would."""

    def test_tags_round_trip(self):
        labels = tags_to_labels(["mcp", "prod"])
        self.assertEqual(labels, {
            "ark.mckinsey.com/label.mcp": "true",
            "ark.mckinsey.com/label.prod": "true",
        })
        self.assertEqual(labels_to_tags(labels), ["mcp", "prod"])

    def test_labels_to_tags_ignores_other_labels(self):
        labels = {
            **MARKER_LABELS,
            "ark.mckinsey.com/label.mcp": "true",
            "app.kubernetes.io/managed-by": "Helm",
        }
        self.assertEqual(labels_to_tags(labels), ["mcp"])

    def test_strip_ark_labels_keeps_foreign_labels(self):
        labels = {**MARKER_LABELS, "app.kubernetes.io/managed-by": "Helm"}
        self.assertEqual(strip_ark_labels(labels), {"app.kubernetes.io/managed-by": "Helm"})

    def test_validate_tag_rejects_spaces(self):
        with self.assertRaises(ValueError) as context:
            validate_tag("mcp servers")
        self.assertIn("mcp servers", str(context.exception))

    def test_validate_tag_rejects_empty(self):
        with self.assertRaises(ValueError):
            validate_tag("")

    def test_validate_tag_rejects_too_long(self):
        with self.assertRaises(ValueError) as context:
            validate_tag("a" * 100)
        self.assertIn("too long", str(context.exception))


class TestConfigurationClient(unittest.IsolatedAsyncioTestCase):
    """Test cases for ConfigurationClient."""

    def setUp(self):
        self.client = ConfigurationClient(namespace="test-namespace")
        patcher = patch('ark_sdk.k8s.init_k8s', new=AsyncMock())
        patcher.start()
        self.addCleanup(patcher.stop)

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_list_filters_by_configuration_marker(self, mock_v1_api, mock_api_client):
        """Only ConfigMaps Ark marked as configurations may be listed."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()

        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.list_namespaced_config_map = AsyncMock(return_value=Mock(items=[]))

        await self.client.list_configurations()

        mock_api_instance.list_namespaced_config_map.assert_called_once_with(
            namespace="test-namespace",
            label_selector=CONFIGURATION_LABEL_SELECTOR
        )

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_list_combines_extra_label_selector(self, mock_v1_api, mock_api_client):
        """A caller-supplied selector narrows the marker selector, never replaces it."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()

        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.list_namespaced_config_map = AsyncMock(return_value=Mock(items=[]))

        await self.client.list_configurations(label_selector="ark.mckinsey.com/label.mcp=true")

        mock_api_instance.list_namespaced_config_map.assert_called_once_with(
            namespace="test-namespace",
            label_selector=f"{CONFIGURATION_LABEL_SELECTOR},ark.mckinsey.com/label.mcp=true"
        )

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_list_maps_metadata(self, mock_v1_api, mock_api_client):
        """Description and alias come from annotations, tags from labels."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()

        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.list_namespaced_config_map = AsyncMock(return_value=Mock(items=[
            _config_map(
                labels={"ark.mckinsey.com/label.mcp": "true"},
                annotations={
                    "ark.mckinsey.com/description": "GitHub remote MCP endpoint",
                    "ark.mckinsey.com/alias": "github-mcp",
                },
            )
        ]))

        result = await self.client.list_configurations()

        self.assertEqual(result["count"], 1)
        self.assertEqual(result["items"][0], {
            "name": "github-mcp-url",
            "id": "uuid-1234",
            "value": "https://example.test/mcp/",
            "description": "GitHub remote MCP endpoint",
            "alias": "github-mcp",
            "labels": ["mcp"],
        })

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_get_rejects_configmap_without_marker(self, mock_v1_api, mock_api_client):
        """A plain ConfigMap is not readable through the configuration API."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()

        plain = _config_map(name="kube-root-ca.crt")
        plain.metadata.labels = {}

        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.read_namespaced_config_map = AsyncMock(return_value=plain)

        with self.assertRaises(ApiException) as context:
            await self.client.get_configuration("kube-root-ca.crt")

        self.assertEqual(context.exception.status, 404)

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_create_writes_marker_tags_and_annotations(self, mock_v1_api, mock_api_client):
        """Create stamps the marker label, the tag labels and the value key."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()

        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.create_namespaced_config_map = AsyncMock(return_value=_config_map())

        await self.client.create_configuration(
            name="github-mcp-url",
            value="https://example.test/mcp/",
            description="GitHub remote MCP endpoint",
            alias="github-mcp",
            labels=["mcp"],
        )

        body = mock_api_instance.create_namespaced_config_map.call_args.kwargs["body"]
        self.assertEqual(body.data, {"value": "https://example.test/mcp/"})
        self.assertEqual(body.metadata.labels, {
            ARK_RESOURCE_TYPE_LABEL: "configuration",
            "ark.mckinsey.com/label.mcp": "true",
        })
        self.assertEqual(body.metadata.annotations, {
            "ark.mckinsey.com/description": "GitHub remote MCP endpoint",
            "ark.mckinsey.com/alias": "github-mcp",
        })

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_update_drops_removed_tags_and_keeps_foreign_labels(self, mock_v1_api, mock_api_client):
        """Removing a tag removes its label; labels Ark does not own survive."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()

        existing = _config_map(
            labels={
                "ark.mckinsey.com/label.mcp": "true",
                "ark.mckinsey.com/label.stale": "true",
                "app.kubernetes.io/managed-by": "Helm",
            },
            annotations={
                "ark.mckinsey.com/description": "old",
                "kubectl.kubernetes.io/last-applied-configuration": "{}",
            },
        )

        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.read_namespaced_config_map = AsyncMock(return_value=existing)
        mock_api_instance.replace_namespaced_config_map = AsyncMock(return_value=_config_map())

        await self.client.update_configuration(
            name="github-mcp-url",
            value="https://new.test/mcp/",
            description="new",
            labels=["mcp"],
        )

        body = mock_api_instance.replace_namespaced_config_map.call_args.kwargs["body"]
        self.assertEqual(body.metadata.labels, {
            ARK_RESOURCE_TYPE_LABEL: "configuration",
            "ark.mckinsey.com/label.mcp": "true",
            "app.kubernetes.io/managed-by": "Helm",
        })
        self.assertEqual(body.metadata.annotations, {
            "ark.mckinsey.com/description": "new",
            "kubectl.kubernetes.io/last-applied-configuration": "{}",
        })
        self.assertEqual(body.data["value"], "https://new.test/mcp/")

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_update_clears_alias_when_omitted(self, mock_v1_api, mock_api_client):
        """An alias the user cleared must not linger as a stale annotation."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()

        existing = _config_map(annotations={"ark.mckinsey.com/alias": "github-mcp"})

        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.read_namespaced_config_map = AsyncMock(return_value=existing)
        mock_api_instance.replace_namespaced_config_map = AsyncMock(return_value=_config_map())

        await self.client.update_configuration(name="github-mcp-url", value="v")

        body = mock_api_instance.replace_namespaced_config_map.call_args.kwargs["body"]
        self.assertNotIn("ark.mckinsey.com/alias", body.metadata.annotations)

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_delete_rejects_configmap_without_marker(self, mock_v1_api, mock_api_client):
        """The configuration API must not delete ConfigMaps it does not own."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()

        plain = _config_map(name="kube-root-ca.crt")
        plain.metadata.labels = {}

        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.read_namespaced_config_map = AsyncMock(return_value=plain)
        mock_api_instance.delete_namespaced_config_map = AsyncMock(return_value=None)

        with self.assertRaises(ApiException):
            await self.client.delete_configuration("kube-root-ca.crt")

        mock_api_instance.delete_namespaced_config_map.assert_not_called()

    @patch('ark_sdk.k8s.ApiClient')
    @patch('ark_sdk.k8s.client.CoreV1Api')
    async def test_delete_success(self, mock_v1_api, mock_api_client):
        """Deleting a marked configuration deletes the underlying ConfigMap."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()

        mock_api_instance = mock_v1_api.return_value
        mock_api_instance.read_namespaced_config_map = AsyncMock(return_value=_config_map())
        mock_api_instance.delete_namespaced_config_map = AsyncMock(return_value=None)

        self.assertTrue(await self.client.delete_configuration("github-mcp-url"))

        mock_api_instance.delete_namespaced_config_map.assert_called_once_with(
            name="github-mcp-url",
            namespace="test-namespace"
        )


class TestConfigurationInitK8sOrdering(unittest.IsolatedAsyncioTestCase):
    """Verify init_k8s runs before create_api_client in every ConfigurationClient method."""

    def setUp(self):
        self.client = ConfigurationClient(namespace="test-namespace")

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
        v1_mock.list_namespaced_config_map = AsyncMock(return_value=Mock(items=[]))
        v1_mock.read_namespaced_config_map = AsyncMock(return_value=_config_map())
        v1_mock.create_namespaced_config_map = AsyncMock(return_value=_config_map())
        v1_mock.replace_namespaced_config_map = AsyncMock(return_value=_config_map())
        v1_mock.delete_namespaced_config_map = AsyncMock(return_value=None)

        with patch('ark_sdk.k8s.init_k8s', mock_init_k8s), \
             patch('ark_sdk.k8s.create_api_client', mock_create_api_client), \
             patch('ark_sdk.k8s.client.CoreV1Api', return_value=v1_mock):
            try:
                await coro()
            except Exception:
                pass

        mock_manager.assert_has_calls([call.init_k8s(), call.create_api_client()])

    async def test_list_calls_init_k8s_first(self):
        await self._assert_init_k8s_called_first(self.client.list_configurations)

    async def test_get_calls_init_k8s_first(self):
        await self._assert_init_k8s_called_first(lambda: self.client.get_configuration('c'))

    async def test_create_calls_init_k8s_first(self):
        await self._assert_init_k8s_called_first(lambda: self.client.create_configuration('c', 'v'))

    async def test_update_calls_init_k8s_first(self):
        await self._assert_init_k8s_called_first(lambda: self.client.update_configuration('c', 'v'))

    async def test_delete_calls_init_k8s_first(self):
        await self._assert_init_k8s_called_first(lambda: self.client.delete_configuration('c'))


if __name__ == '__main__':
    unittest.main()
