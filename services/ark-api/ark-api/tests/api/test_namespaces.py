"""Tests for namespaces and context API endpoints."""
import os
import unittest
from unittest.mock import patch, AsyncMock, Mock

os.environ["AUTH_MODE"] = "open"

from fastapi.testclient import TestClient
from kubernetes_asyncio.client.rest import ApiException


class TestListNamespaces(unittest.TestCase):

    def setUp(self):
        from ark_api.main import app
        self.client = TestClient(app)

    @patch('ark_api.api.v1.namespaces.ApiClient')
    @patch('ark_api.api.v1.namespaces.client')
    def test_list_namespaces_success(self, mock_k8s_client, mock_api_client):
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_v1 = AsyncMock()
        mock_k8s_client.CoreV1Api.return_value = mock_v1

        mock_ns1 = Mock()
        mock_ns1.metadata.name = "default"
        mock_ns2 = Mock()
        mock_ns2.metadata.name = "ark-system"

        mock_response = Mock()
        mock_response.items = [mock_ns1, mock_ns2]
        mock_v1.list_namespace = AsyncMock(return_value=mock_response)

        response = self.client.get("/v1/namespaces")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 2)
        self.assertEqual(data["items"][0]["name"], "default")
        self.assertEqual(data["items"][1]["name"], "ark-system")

    @patch('ark_api.api.v1.namespaces.get_current_context')
    @patch('ark_api.api.v1.namespaces.ApiClient')
    @patch('ark_api.api.v1.namespaces.client')
    def test_list_namespaces_403_fallback(self, mock_k8s_client, mock_api_client, mock_get_context):
        mock_get_context.return_value = {"namespace": "my-namespace", "cluster": "my-cluster"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_v1 = AsyncMock()
        mock_k8s_client.CoreV1Api.return_value = mock_v1
        mock_v1.list_namespace = AsyncMock(side_effect=ApiException(status=403, reason="Forbidden"))

        response = self.client.get("/v1/namespaces")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["items"][0]["name"], "my-namespace")


class TestContextEndpoint(unittest.TestCase):

    def setUp(self):
        from ark_api.main import app
        self.client = TestClient(app)

    @patch('ark_api.api.v1.namespaces.ApiClient')
    @patch('ark_api.api.v1.namespaces.client')
    @patch('ark_api.api.v1.namespaces.get_current_context')
    def test_context_capabilities_can_create(self, mock_get_context, mock_k8s_client, mock_api_client):
        mock_get_context.return_value = {"namespace": "default", "cluster": "test-cluster"}

        mock_api_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_instance

        mock_v1 = AsyncMock()
        mock_k8s_client.CoreV1Api.return_value = mock_v1
        mock_ns = Mock()
        mock_ns.metadata.labels = {}
        mock_v1.read_namespace = AsyncMock(return_value=mock_ns)

        mock_auth_api = AsyncMock()
        mock_k8s_client.AuthorizationV1Api.return_value = mock_auth_api
        mock_review_result = Mock()
        mock_review_result.status.allowed = True
        mock_auth_api.create_self_subject_access_review = AsyncMock(return_value=mock_review_result)

        response = self.client.get("/v1/context")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["namespace"], "default")
        self.assertTrue(data["capabilities"]["can_create_namespace"])

    @patch('ark_api.api.v1.namespaces.ApiClient')
    @patch('ark_api.api.v1.namespaces.client')
    @patch('ark_api.api.v1.namespaces.get_current_context')
    def test_context_capabilities_denied(self, mock_get_context, mock_k8s_client, mock_api_client):
        mock_get_context.return_value = {"namespace": "default", "cluster": "test-cluster"}

        mock_api_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_instance

        mock_v1 = AsyncMock()
        mock_k8s_client.CoreV1Api.return_value = mock_v1
        mock_ns = Mock()
        mock_ns.metadata.labels = {}
        mock_v1.read_namespace = AsyncMock(return_value=mock_ns)

        mock_auth_api = AsyncMock()
        mock_k8s_client.AuthorizationV1Api.return_value = mock_auth_api
        mock_review_result = Mock()
        mock_review_result.status.allowed = False
        mock_auth_api.create_self_subject_access_review = AsyncMock(return_value=mock_review_result)

        response = self.client.get("/v1/context")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data["capabilities"]["can_create_namespace"])

    @patch('ark_api.api.v1.namespaces.ApiClient')
    @patch('ark_api.api.v1.namespaces.client')
    @patch('ark_api.api.v1.namespaces.get_current_context')
    def test_context_capabilities_error_defaults_false(self, mock_get_context, mock_k8s_client, mock_api_client):
        mock_get_context.return_value = {"namespace": "default", "cluster": "test-cluster"}

        call_count = [0]
        real_async_mock = AsyncMock()

        async def api_client_aenter(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return real_async_mock
            raise Exception("API unavailable")

        mock_api_client.return_value.__aenter__ = api_client_aenter

        mock_v1 = AsyncMock()
        mock_k8s_client.CoreV1Api.return_value = mock_v1
        mock_ns = Mock()
        mock_ns.metadata.labels = {}
        mock_v1.read_namespace = AsyncMock(return_value=mock_ns)

        response = self.client.get("/v1/context")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data["capabilities"]["can_create_namespace"])
