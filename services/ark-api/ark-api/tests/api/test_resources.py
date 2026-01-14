"""Tests for generic Kubernetes resources API endpoints."""
import os
import unittest
from unittest.mock import AsyncMock, Mock, patch
from fastapi.testclient import TestClient

os.environ["AUTH_MODE"] = "open"


def make_awaitable(return_value):
    """Create an awaitable that returns the given value."""
    async def _awaitable(*args, **kwargs):
        return return_value
    return _awaitable


class TestResourcesEndpoint(unittest.TestCase):
    """Test cases for the /resources endpoints."""

    def setUp(self):
        """Set up test client."""
        from ark_api.main import app
        self.client = TestClient(app)

    @patch('ark_api.api.v1.resources.ApiClient')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_get_core_resource_success(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test successful retrieval of a core Kubernetes resource."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_resource = Mock()
        mock_resource.to_dict.return_value = {
            "apiVersion": "v1",
            "kind": "Pod",
            "metadata": {"name": "test-pod", "namespace": "default"}
        }
        mock_api_resource.get = AsyncMock(return_value=mock_resource)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get("/v1/resources/api/v1/Pod/test-pod")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["kind"], "Pod")
        self.assertEqual(data["metadata"]["name"], "test-pod")

    @patch('ark_api.api.v1.resources.ApiClient')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_list_core_resources_success(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test successful listing of core Kubernetes resources."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_resources = Mock()
        mock_resources.to_dict.return_value = {
            "apiVersion": "v1",
            "kind": "PodList",
            "items": [
                {"metadata": {"name": "pod-1"}},
                {"metadata": {"name": "pod-2"}}
            ]
        }
        mock_api_resource.get = AsyncMock(return_value=mock_resources)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get("/v1/resources/api/v1/Pod")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["kind"], "PodList")
        self.assertEqual(len(data["items"]), 2)

    @patch('ark_api.api.v1.resources.ApiClient')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_get_grouped_resource_success(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test successful retrieval of a grouped Kubernetes resource."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_resource = Mock()
        mock_resource.to_dict.return_value = {
            "apiVersion": "argoproj.io/v1alpha1",
            "kind": "WorkflowTemplate",
            "metadata": {"name": "test-workflow", "namespace": "default"}
        }
        mock_api_resource.get = AsyncMock(return_value=mock_resource)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get("/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate/test-workflow")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["kind"], "WorkflowTemplate")
        self.assertEqual(data["metadata"]["name"], "test-workflow")

    @patch('ark_api.api.v1.resources.ApiClient')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_list_grouped_resources_success(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test successful listing of grouped Kubernetes resources."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_resources = Mock()
        mock_resources.to_dict.return_value = {
            "apiVersion": "argoproj.io/v1alpha1",
            "kind": "WorkflowTemplateList",
            "items": [
                {"metadata": {"name": "workflow-1"}},
                {"metadata": {"name": "workflow-2"}}
            ]
        }
        mock_api_resource.get = AsyncMock(return_value=mock_resources)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get("/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["kind"], "WorkflowTemplateList")
        self.assertEqual(len(data["items"]), 2)

    @patch('ark_api.api.v1.resources.ApiClient')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_get_resource_with_namespace_param(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test resource retrieval with explicit namespace parameter."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_resource = Mock()
        mock_resource.to_dict.return_value = {
            "apiVersion": "v1",
            "kind": "Pod",
            "metadata": {"name": "test-pod", "namespace": "custom-namespace"}
        }
        mock_api_resource.get = AsyncMock(return_value=mock_resource)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get("/v1/resources/api/v1/Pod/test-pod?namespace=custom-namespace")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["metadata"]["namespace"], "custom-namespace")
        mock_api_resource.get.assert_called_once_with(name="test-pod", namespace="custom-namespace")

    @patch('ark_api.api.v1.resources.ApiClient')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_get_resource_namespace_failure(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test resource retrieval returns error when namespace operation fails."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_api_resource.get = AsyncMock(side_effect=Exception("Namespace not applicable for cluster-scoped resource"))
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get("/v1/resources/api/v1/Node/test-node")

        self.assertEqual(response.status_code, 500)

    @patch('ark_api.api.v1.resources.ApiClient')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_get_core_resource_yaml_response(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test core resource retrieval returns YAML when requested."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_resource = Mock()
        mock_resource.to_dict.return_value = {
            "apiVersion": "v1",
            "kind": "Pod",
            "metadata": {"name": "test-pod", "namespace": "default"}
        }
        mock_api_resource.get = AsyncMock(return_value=mock_resource)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get(
            "/v1/resources/api/v1/Pod/test-pod",
            headers={"Accept": "application/yaml"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("application/yaml", response.headers["content-type"])
        self.assertIn("apiVersion: v1", response.text)
        self.assertIn("kind: Pod", response.text)
        self.assertIn("name: test-pod", response.text)

    @patch('ark_api.api.v1.resources.ApiClient')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_list_core_resources_yaml_response(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test core resource listing returns YAML when requested."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_resources = Mock()
        mock_resources.to_dict.return_value = {
            "apiVersion": "v1",
            "kind": "PodList",
            "items": [
                {"metadata": {"name": "pod-1"}},
                {"metadata": {"name": "pod-2"}}
            ]
        }
        mock_api_resource.get = AsyncMock(return_value=mock_resources)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get(
            "/v1/resources/api/v1/Pod",
            headers={"Accept": "text/yaml"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("application/yaml", response.headers["content-type"])
        self.assertIn("kind: PodList", response.text)

    @patch('ark_api.api.v1.resources.ApiClient')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_get_grouped_resource_yaml_response(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test grouped resource retrieval returns YAML when requested."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_resource = Mock()
        mock_resource.to_dict.return_value = {
            "apiVersion": "argoproj.io/v1alpha1",
            "kind": "WorkflowTemplate",
            "metadata": {"name": "test-workflow", "namespace": "default"}
        }
        mock_api_resource.get = AsyncMock(return_value=mock_resource)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate/test-workflow",
            headers={"Accept": "application/yaml"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("application/yaml", response.headers["content-type"])
        self.assertIn("kind: WorkflowTemplate", response.text)

    @patch('ark_api.api.v1.resources.ApiClient')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_list_grouped_resources_yaml_response(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test grouped resource listing returns YAML when requested."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_resources = Mock()
        mock_resources.to_dict.return_value = {
            "apiVersion": "argoproj.io/v1alpha1",
            "kind": "WorkflowTemplateList",
            "items": [
                {"metadata": {"name": "workflow-1"}},
                {"metadata": {"name": "workflow-2"}}
            ]
        }
        mock_api_resource.get = AsyncMock(return_value=mock_resources)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate",
            headers={"Accept": "application/yaml"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("application/yaml", response.headers["content-type"])
        self.assertIn("kind: WorkflowTemplateList", response.text)

    @patch('ark_api.api.v1.resources.ApiClient')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_get_core_resource_api_lookup_failure(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test error handling when API resource lookup fails."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_dynamic_client_instance.resources.get = AsyncMock(side_effect=Exception("API resource not found"))

        response = self.client.get("/v1/resources/api/v1/InvalidKind/test-resource")

        self.assertEqual(response.status_code, 500)

    @patch('ark_api.api.v1.resources.ApiClient')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_get_grouped_resource_api_lookup_failure(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test error handling when grouped API resource lookup fails."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_dynamic_client_instance.resources.get = AsyncMock(side_effect=Exception("API resource not found"))

        response = self.client.get("/v1/resources/apis/invalid.group/v1/InvalidKind/test-resource")

        self.assertEqual(response.status_code, 500)

    @patch('ark_api.api.v1.resources.ApiClient')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_get_grouped_resource_failure(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test grouped resource retrieval returns error when operation fails."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_api_resource.get = AsyncMock(side_effect=Exception("Resource not found"))
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get("/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate/nonexistent")

        self.assertEqual(response.status_code, 500)

    @patch('ark_api.api.v1.resources.ApiClient')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_list_grouped_resources_failure(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test grouped resource listing returns error when operation fails."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_api_resource.get = AsyncMock(side_effect=Exception("Failed to list resources"))
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get("/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate")

        self.assertEqual(response.status_code, 500)


if __name__ == "__main__":
    unittest.main()
