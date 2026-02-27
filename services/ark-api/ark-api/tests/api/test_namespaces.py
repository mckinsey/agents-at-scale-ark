import os
import unittest
from unittest.mock import patch, AsyncMock, MagicMock

os.environ["AUTH_MODE"] = "open"

with patch('importlib.metadata.version', return_value="0.1.0-test"):
    from ark_api.main import app

from fastapi.testclient import TestClient

test_client = TestClient(app)


class TestNamespacesAPI(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.client = test_client

    @patch('ark_api.api.v1.namespaces.ApiClient')
    def test_list_namespaces_success(self, mock_api_client):
        mock_ns1 = MagicMock()
        mock_ns1.metadata.name = "default"
        mock_ns2 = MagicMock()
        mock_ns2.metadata.name = "kube-system"

        mock_namespace_list = MagicMock()
        mock_namespace_list.items = [mock_ns1, mock_ns2]

        mock_v1 = AsyncMock()
        mock_v1.list_namespace = AsyncMock(return_value=mock_namespace_list)

        mock_api_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_instance

        with patch('ark_api.api.v1.namespaces.client.CoreV1Api', return_value=mock_v1):
            response = self.client.get("/v1/namespaces")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 2)
        self.assertEqual(len(data["items"]), 2)
        self.assertEqual(data["items"][0]["name"], "default")
        self.assertEqual(data["items"][1]["name"], "kube-system")

    @patch('ark_api.api.v1.namespaces.ApiClient')
    def test_create_namespace_success(self, mock_api_client):
        mock_created_ns = MagicMock()
        mock_created_ns.metadata.name = "test-namespace"

        mock_v1 = AsyncMock()
        mock_v1.create_namespace = AsyncMock(return_value=mock_created_ns)

        mock_api_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_instance

        with patch('ark_api.api.v1.namespaces.client.CoreV1Api', return_value=mock_v1):
            response = self.client.post("/v1/namespaces", json={"name": "test-namespace"})

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "test-namespace")

    @patch('ark_api.api.v1.namespaces.get_current_context')
    @patch('ark_api.api.v1.namespaces.ApiClient')
    def test_get_context_without_namespace_param(self, mock_api_client, mock_get_context):
        mock_get_context.return_value = {
            "namespace": "default",
            "cluster": "test-cluster"
        }

        mock_ns = MagicMock()
        mock_ns.metadata.labels = None

        mock_v1 = AsyncMock()
        mock_v1.read_namespace = AsyncMock(return_value=mock_ns)

        mock_api_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_instance

        with patch('ark_api.api.v1.namespaces.client.CoreV1Api', return_value=mock_v1):
            response = self.client.get("/v1/context")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["namespace"], "default")
        self.assertEqual(data["cluster"], "test-cluster")
        self.assertEqual(data["read_only_mode"], False)

    @patch('ark_api.api.v1.namespaces.get_current_context')
    @patch('ark_api.api.v1.namespaces.ApiClient')
    def test_get_context_with_namespace_param(self, mock_api_client, mock_get_context):
        mock_get_context.return_value = {
            "namespace": "default",
            "cluster": "test-cluster"
        }

        mock_ns = MagicMock()
        mock_ns.metadata.labels = None

        mock_v1 = AsyncMock()
        mock_v1.read_namespace = AsyncMock(return_value=mock_ns)

        mock_api_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_instance

        with patch('ark_api.api.v1.namespaces.client.CoreV1Api', return_value=mock_v1):
            response = self.client.get("/v1/context?namespace=custom-ns")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["namespace"], "custom-ns")
        self.assertEqual(data["cluster"], "test-cluster")
        self.assertEqual(data["read_only_mode"], False)

    @patch('ark_api.api.v1.namespaces.get_current_context')
    @patch('ark_api.api.v1.namespaces.ApiClient')
    def test_get_context_with_demo_label(self, mock_api_client, mock_get_context):
        mock_get_context.return_value = {
            "namespace": "demo-ns",
            "cluster": "test-cluster"
        }

        mock_ns = MagicMock()
        mock_ns.metadata.labels = {"ark.mckinsey.com/demo": "true"}

        mock_v1 = AsyncMock()
        mock_v1.read_namespace = AsyncMock(return_value=mock_ns)

        mock_api_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_instance

        with patch('ark_api.api.v1.namespaces.client.CoreV1Api', return_value=mock_v1):
            response = self.client.get("/v1/context")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["namespace"], "demo-ns")
        self.assertEqual(data["read_only_mode"], True)

    @patch('ark_api.api.v1.namespaces.get_current_context')
    @patch('ark_api.api.v1.namespaces.ApiClient')
    def test_get_context_with_labels_but_no_demo(self, mock_api_client, mock_get_context):
        mock_get_context.return_value = {
            "namespace": "default",
            "cluster": "test-cluster"
        }

        mock_ns = MagicMock()
        mock_ns.metadata.labels = {"some-label": "value"}

        mock_v1 = AsyncMock()
        mock_v1.read_namespace = AsyncMock(return_value=mock_ns)

        mock_api_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_instance

        with patch('ark_api.api.v1.namespaces.client.CoreV1Api', return_value=mock_v1):
            response = self.client.get("/v1/context")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["read_only_mode"], False)

    @patch.dict(os.environ, {"READ_ONLY_MODE": "false"}, clear=False)
    @patch('ark_api.api.v1.namespaces.get_current_context')
    @patch('ark_api.api.v1.namespaces.ApiClient')
    def test_get_context_exception_fallback_to_env_false(self, mock_api_client, mock_get_context):
        mock_get_context.return_value = {
            "namespace": "default",
            "cluster": "test-cluster"
        }

        mock_api_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_instance

        mock_v1 = AsyncMock()
        mock_v1.read_namespace = AsyncMock(side_effect=Exception("API error"))

        with patch('ark_api.api.v1.namespaces.client.CoreV1Api', return_value=mock_v1):
            response = self.client.get("/v1/context")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["namespace"], "default")
        self.assertEqual(data["read_only_mode"], False)

    @patch.dict(os.environ, {"READ_ONLY_MODE": "true"}, clear=False)
    @patch('ark_api.api.v1.namespaces.get_current_context')
    @patch('ark_api.api.v1.namespaces.ApiClient')
    def test_get_context_exception_fallback_to_env_true(self, mock_api_client, mock_get_context):
        mock_get_context.return_value = {
            "namespace": "default",
            "cluster": "test-cluster"
        }

        mock_api_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_instance

        mock_v1 = AsyncMock()
        mock_v1.read_namespace = AsyncMock(side_effect=Exception("API error"))

        with patch('ark_api.api.v1.namespaces.client.CoreV1Api', return_value=mock_v1):
            response = self.client.get("/v1/context")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["namespace"], "default")
        self.assertEqual(data["read_only_mode"], True)
