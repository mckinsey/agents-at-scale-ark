"""Tests for generic Kubernetes resources API endpoints."""
import os
import unittest
from unittest.mock import AsyncMock, Mock, patch
from fastapi.testclient import TestClient
from kubernetes_asyncio.client.rest import ApiException

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

    @patch('ark_api.api.v1.client_utils.create_api_client')
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

    @patch('ark_api.api.v1.client_utils.create_api_client')
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

    @patch('ark_api.api.v1.client_utils.create_api_client')
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

    @patch('ark_api.api.v1.client_utils.create_api_client')
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

    @patch('ark_api.api.v1.client_utils.create_api_client')
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

    @patch('ark_api.api.v1.client_utils.create_api_client')
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

    @patch('ark_api.api.v1.client_utils.create_api_client')
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

    @patch('ark_api.api.v1.client_utils.create_api_client')
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

    @patch('ark_api.api.v1.client_utils.create_api_client')
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

    @patch('ark_api.api.v1.client_utils.create_api_client')
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

    @patch('ark_api.api.v1.client_utils.create_api_client')
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

    @patch('ark_api.api.v1.client_utils.create_api_client')
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

    @patch('ark_api.api.v1.client_utils.create_api_client')
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

    @patch('ark_api.api.v1.client_utils.create_api_client')
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

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_list_grouped_resources_crd_not_installed(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test grouped resource listing returns 404 when the resource type/CRD is not installed."""
        from kubernetes_asyncio.dynamic.exceptions import ResourceNotFoundError

        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_dynamic_client_instance.resources.get = AsyncMock(
            side_effect=ResourceNotFoundError("No matches found for WorkflowTemplate")
        )

        response = self.client.get("/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate")

        self.assertEqual(response.status_code, 404)
        self.assertIn("not available in the cluster", response.json()["detail"])

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_delete_core_resource_success(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test successful deletion of a core Kubernetes resource."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_api_resource.delete = AsyncMock(return_value=None)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.delete("/v1/resources/api/v1/Pod/test-pod")

        self.assertEqual(response.status_code, 204)
        mock_api_resource.delete.assert_called_once_with(name="test-pod", namespace="default")

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_delete_grouped_resource_success(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test successful deletion of a grouped Kubernetes resource."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_api_resource.delete = AsyncMock(return_value=None)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.delete("/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate/test-workflow")

        self.assertEqual(response.status_code, 204)
        mock_api_resource.delete.assert_called_once_with(name="test-workflow", namespace="default")

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_delete_core_resource_with_namespace(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test deletion of a core resource with explicit namespace parameter."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_api_resource.delete = AsyncMock(return_value=None)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.delete("/v1/resources/api/v1/Pod/test-pod?namespace=custom-namespace")

        self.assertEqual(response.status_code, 204)
        mock_api_resource.delete.assert_called_once_with(name="test-pod", namespace="custom-namespace")

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_delete_grouped_resource_with_namespace(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test deletion of a grouped resource with explicit namespace parameter."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_api_resource.delete = AsyncMock(return_value=None)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.delete("/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate/test-workflow?namespace=custom-namespace")

        self.assertEqual(response.status_code, 204)
        mock_api_resource.delete.assert_called_once_with(name="test-workflow", namespace="custom-namespace")

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_delete_core_resource_failure(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test core resource deletion returns error when operation fails."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_api_resource.delete = AsyncMock(side_effect=Exception("Resource not found"))
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.delete("/v1/resources/api/v1/Pod/nonexistent")

        self.assertEqual(response.status_code, 500)

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_delete_grouped_resource_failure(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test grouped resource deletion returns error when operation fails."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_api_resource.delete = AsyncMock(side_effect=Exception("Resource not found"))
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.delete("/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate/nonexistent")

        self.assertEqual(response.status_code, 500)

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_list_workflows_with_filters(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test listing workflows with name, template, and status filters."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_resources = Mock()
        mock_resources.to_dict.return_value = {
            "items": [
                {
                    "metadata": {"name": "test-workflow-123"},
                    "spec": {"workflowTemplateRef": {"name": "test-template"}},
                    "status": {"phase": "Running"}
                },
                {
                    "metadata": {"name": "other-workflow-456"},
                    "spec": {"workflowTemplateRef": {"name": "other-template"}},
                    "status": {"phase": "Succeeded"}
                },
                {
                    "metadata": {"name": "test-workflow-789"},
                    "spec": {"workflowTemplateRef": {"name": "test-template"}},
                    "status": {"phase": "Failed"}
                }
            ]
        }
        mock_api_resource.get = AsyncMock(return_value=mock_resources)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/Workflow"
            "?workflowName=test"
            "&workflowTemplateName=test-template"
            "&status=running"
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["items"]), 1)
        self.assertEqual(data["items"][0]["metadata"]["name"], "test-workflow-123")

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_list_workflows_filter_by_name(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test filtering workflows by name only."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_resources = Mock()
        mock_resources.to_dict.return_value = {
            "items": [
                {
                    "metadata": {"name": "my-test-workflow"},
                    "spec": {"workflowTemplateRef": {"name": "template1"}},
                    "status": {"phase": "Running"}
                },
                {
                    "metadata": {"name": "other-workflow"},
                    "spec": {"workflowTemplateRef": {"name": "template2"}},
                    "status": {"phase": "Running"}
                }
            ]
        }
        mock_api_resource.get = AsyncMock(return_value=mock_resources)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/Workflow?workflowName=test"
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["items"]), 1)
        self.assertEqual(data["items"][0]["metadata"]["name"], "my-test-workflow")

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_list_workflows_filter_by_template(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test filtering workflows by template name only."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_resources = Mock()
        mock_resources.to_dict.return_value = {
            "items": [
                {
                    "metadata": {"name": "workflow1"},
                    "spec": {"workflowTemplateRef": {"name": "prod-template"}},
                    "status": {"phase": "Running"}
                },
                {
                    "metadata": {"name": "workflow2"},
                    "spec": {"workflowTemplateRef": {"name": "dev-template"}},
                    "status": {"phase": "Running"}
                }
            ]
        }
        mock_api_resource.get = AsyncMock(return_value=mock_resources)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/Workflow?workflowTemplateName=prod"
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["items"]), 1)
        self.assertEqual(data["items"][0]["metadata"]["name"], "workflow1")

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_list_workflows_filter_by_failed_status(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test filtering workflows by failed status (includes both Failed and Error)."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_resources = Mock()
        mock_resources.to_dict.return_value = {
            "items": [
                {
                    "metadata": {"name": "workflow1"},
                    "spec": {},
                    "status": {"phase": "Failed"}
                },
                {
                    "metadata": {"name": "workflow2"},
                    "spec": {},
                    "status": {"phase": "Error"}
                },
                {
                    "metadata": {"name": "workflow3"},
                    "spec": {},
                    "status": {"phase": "Succeeded"}
                }
            ]
        }
        mock_api_resource.get = AsyncMock(return_value=mock_resources)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/Workflow?status=failed"
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["items"]), 2)
        phases = [item["status"]["phase"] for item in data["items"]]
        self.assertIn("Failed", phases)
        self.assertIn("Error", phases)

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_list_workflows_filter_by_succeeded_status(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test filtering workflows by succeeded status."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_resources = Mock()
        mock_resources.to_dict.return_value = {
            "items": [
                {
                    "metadata": {"name": "workflow1"},
                    "spec": {},
                    "status": {"phase": "Succeeded"}
                },
                {
                    "metadata": {"name": "workflow2"},
                    "spec": {},
                    "status": {"phase": "Failed"}
                }
            ]
        }
        mock_api_resource.get = AsyncMock(return_value=mock_resources)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/Workflow?status=succeeded"
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["items"]), 1)
        self.assertEqual(data["items"][0]["status"]["phase"], "Succeeded")

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_create_core_resource_success(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test successful creation of a core Kubernetes resource."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_resource = Mock()
        resource_body = {
            "apiVersion": "v1",
            "kind": "Pod",
            "metadata": {"name": "test-pod"}
        }
        mock_resource.to_dict.return_value = resource_body
        mock_api_resource.create = AsyncMock(return_value=mock_resource)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.post(
            "/v1/resources/api/v1/Pod",
            json=resource_body
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), resource_body)
        mock_api_resource.create.assert_called_once()

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_create_core_resource_with_namespace(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test creation of core resource with explicit namespace."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_resource = Mock()
        resource_body = {"apiVersion": "v1", "kind": "ConfigMap", "metadata": {"name": "test-cm"}}
        mock_resource.to_dict.return_value = resource_body
        mock_api_resource.create = AsyncMock(return_value=mock_resource)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.post(
            "/v1/resources/api/v1/ConfigMap?namespace=custom-ns",
            json=resource_body
        )

        self.assertEqual(response.status_code, 200)
        mock_api_resource.create.assert_called_once_with(body=resource_body, namespace="custom-ns")

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_create_grouped_resource_success(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test successful creation of a grouped Kubernetes resource."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_resource = Mock()
        resource_body = {
            "apiVersion": "argoproj.io/v1alpha1",
            "kind": "Workflow",
            "metadata": {"name": "test-workflow"}
        }
        mock_resource.to_dict.return_value = resource_body
        mock_api_resource.create = AsyncMock(return_value=mock_resource)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.post(
            "/v1/resources/apis/argoproj.io/v1alpha1/Workflow",
            json=resource_body
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), resource_body)
        mock_api_resource.create.assert_called_once()

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_create_grouped_resource_with_namespace(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test creation of grouped resource with explicit namespace."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_resource = Mock()
        resource_body = {
            "apiVersion": "apps/v1",
            "kind": "Deployment",
            "metadata": {"name": "test-deploy"}
        }
        mock_resource.to_dict.return_value = resource_body
        mock_api_resource.create = AsyncMock(return_value=mock_resource)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.post(
            "/v1/resources/apis/apps/v1/Deployment?namespace=prod",
            json=resource_body
        )

        self.assertEqual(response.status_code, 200)
        mock_api_resource.create.assert_called_once_with(body=resource_body, namespace="prod")

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_get_pod_logs_success(self, mock_core_v1_cls, mock_api_client):
        """Test successful retrieval of pod logs."""
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_core_v1 = AsyncMock()
        mock_core_v1.read_namespaced_pod_log = AsyncMock(return_value="Log line 1\nLog line 2\n")
        mock_core_v1_cls.return_value = mock_core_v1

        response = self.client.get("/v1/resources/api/v1/namespaces/default/pods/test-pod/log")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.text, "Log line 1\nLog line 2\n")
        mock_core_v1.read_namespaced_pod_log.assert_called_once()

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_get_pod_logs_with_params(self, mock_core_v1_cls, mock_api_client):
        """Test retrieval of pod logs with container and tail parameters."""
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_core_v1 = AsyncMock()
        mock_core_v1.read_namespaced_pod_log = AsyncMock(return_value="Recent logs\n")
        mock_core_v1_cls.return_value = mock_core_v1

        response = self.client.get(
            "/v1/resources/api/v1/namespaces/default/pods/test-pod/log"
            "?container=sidecar&tailLines=50"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.text, "Recent logs\n")
        mock_core_v1.read_namespaced_pod_log.assert_called_once_with(
            name="test-pod",
            namespace="default",
            container="sidecar",
            tail_lines=50,
            follow=False
        )

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_get_pod_logs_failure(self, mock_core_v1_cls, mock_api_client):
        """Test pod logs retrieval handles errors."""
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_core_v1 = AsyncMock()
        mock_core_v1.read_namespaced_pod_log = AsyncMock(side_effect=Exception("Pod not found"))
        mock_core_v1_cls.return_value = mock_core_v1

        response = self.client.get("/v1/resources/api/v1/namespaces/default/pods/missing-pod/log")

        self.assertEqual(response.status_code, 500)
        self.assertIn("Error fetching logs", response.text)

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_get_workflow_logs_direct_lookup(self, mock_core_v1_cls, mock_api_client):
        """Test workflow logs retrieval with direct node ID lookup."""
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_core_v1 = AsyncMock()
        mock_core_v1.read_namespaced_pod_log = AsyncMock(return_value="Workflow log output\n")
        mock_core_v1_cls.return_value = mock_core_v1

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/test-workflow/node-id-123/log"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.text, "Workflow log output\n")
        mock_core_v1.read_namespaced_pod_log.assert_called_once()

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_get_workflow_logs_fallback_lookup(self, mock_core_v1_cls, mock_api_client):
        """Test workflow logs retrieval with fallback pod search."""
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_core_v1 = AsyncMock()
        mock_core_v1.read_namespaced_pod_log = AsyncMock(
            side_effect=[
                Exception("Direct lookup failed"),
                "Fallback log output\n"
            ]
        )

        mock_pod_list = Mock()
        mock_pod_list.items = [
            Mock(metadata=Mock(name="test-workflow-step-abc")),
            Mock(metadata=Mock(name="test-workflow-other-xyz"))
        ]
        mock_core_v1.list_namespaced_pod = AsyncMock(return_value=mock_pod_list)
        mock_core_v1_cls.return_value = mock_core_v1

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/test-workflow/step-abc/log"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.text, "Fallback log output\n")
        self.assertEqual(mock_core_v1.read_namespaced_pod_log.call_count, 2)
        mock_core_v1.list_namespaced_pod.assert_called_once()

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_get_workflow_logs_no_logs_available(self, mock_core_v1_cls, mock_api_client):
        """Test workflow logs when pod has no logs."""
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_core_v1 = AsyncMock()
        mock_core_v1.read_namespaced_pod_log = AsyncMock(return_value=None)
        mock_core_v1_cls.return_value = mock_core_v1

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/test-workflow/node-id/log"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.text, "No logs available.")

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    @patch('ark_api.api.v1.resources.DynamicClient')
    def test_get_workflow_logs_pod_not_found(self, mock_dynamic_client_cls, mock_core_v1_cls, mock_api_client):
        """Test workflow logs when pod cannot be found."""
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_core_v1 = AsyncMock()
        mock_core_v1.read_namespaced_pod_log = AsyncMock(side_effect=Exception("Not found"))
        mock_pod_list = Mock()
        mock_pod_list.items = []
        mock_core_v1.list_namespaced_pod = AsyncMock(return_value=mock_pod_list)
        mock_core_v1_cls.return_value = mock_core_v1

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_workflow_resource = AsyncMock()
        mock_workflow = Mock()
        mock_workflow.to_dict.return_value = {
            "status": {
                "nodes": {
                    "node": {
                        "type": "Pod",
                        "phase": "Failed"
                    }
                }
            }
        }
        mock_workflow_resource.get = AsyncMock(return_value=mock_workflow)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_workflow_resource)

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/missing/node/log"
        )

        self.assertEqual(response.status_code, 404)
        self.assertIn("Pod has been deleted", response.text)

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    @patch('ark_api.api.v1.resources.DynamicClient')
    def test_get_workflow_logs_node_not_in_workflow(self, mock_dynamic_client_cls, mock_core_v1_cls, mock_api_client):
        """Test workflow logs when node is not found in workflow spec."""
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_core_v1 = AsyncMock()
        mock_core_v1.read_namespaced_pod_log = AsyncMock(side_effect=Exception("Not found"))
        mock_pod_list = Mock()
        mock_pod_list.items = []
        mock_core_v1.list_namespaced_pod_log = AsyncMock(return_value=mock_pod_list)
        mock_core_v1_cls.return_value = mock_core_v1

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_workflow_resource = AsyncMock()
        mock_workflow = Mock()
        mock_workflow.to_dict.return_value = {
            "status": {
                "nodes": {}
            }
        }
        mock_workflow_resource.get = AsyncMock(return_value=mock_workflow)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_workflow_resource)

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/test-wf/missing-node/log"
        )

        self.assertEqual(response.status_code, 404)
        self.assertIn("Node missing-node not found", response.text)

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    @patch('ark_api.api.v1.resources.DynamicClient')
    def test_get_workflow_logs_workflow_query_fails(self, mock_dynamic_client_cls, mock_core_v1_cls, mock_api_client):
        """Test workflow logs when workflow query fails in error handler."""
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_core_v1 = AsyncMock()
        mock_core_v1.read_namespaced_pod_log = AsyncMock(side_effect=Exception("Pod not found"))
        mock_pod_list = Mock()
        mock_pod_list.items = []
        mock_core_v1.list_namespaced_pod = AsyncMock(return_value=mock_pod_list)
        mock_core_v1_cls.return_value = mock_core_v1

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_workflow_resource = AsyncMock()
        mock_workflow_resource.get = AsyncMock(side_effect=Exception("Workflow not found"))
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_workflow_resource)

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/test-wf/node-id/log"
        )

        self.assertEqual(response.status_code, 500)
        self.assertIn("Failed to fetch logs", response.text)

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_list_core_resources_with_label_selector(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test listing core resources with label selector parameter."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_resources = Mock()
        mock_resources.to_dict.return_value = {
            "apiVersion": "v1",
            "kind": "ServiceList",
            "items": [
                {
                    "metadata": {
                        "name": "phoenix-svc",
                        "labels": {"app.kubernetes.io/instance": "phoenix"}
                    }
                }
            ]
        }
        mock_api_resource.get = AsyncMock(return_value=mock_resources)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get(
            "/v1/resources/api/v1/Service?labelSelector=app.kubernetes.io/instance=phoenix"
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["kind"], "ServiceList")
        self.assertEqual(len(data["items"]), 1)
        self.assertEqual(data["items"][0]["metadata"]["name"], "phoenix-svc")
        mock_api_resource.get.assert_called_once_with(
            namespace="default",
            label_selector="app.kubernetes.io/instance=phoenix"
        )

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_list_grouped_resources_with_label_selector(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test listing grouped resources with label selector parameter."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_resources = Mock()
        mock_resources.to_dict.return_value = {
            "apiVersion": "apps/v1",
            "kind": "DeploymentList",
            "items": [
                {
                    "metadata": {
                        "name": "phoenix-deployment",
                        "labels": {"app.kubernetes.io/instance": "phoenix", "app": "phoenix"}
                    }
                },
                {
                    "metadata": {
                        "name": "other-deployment",
                        "labels": {"app": "other"}
                    }
                }
            ]
        }
        mock_api_resource.get = AsyncMock(return_value=mock_resources)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get(
            "/v1/resources/apis/apps/v1/Deployment?labelSelector=app.kubernetes.io/instance=phoenix"
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["kind"], "DeploymentList")
        mock_api_resource.get.assert_called_once_with(
            namespace="default",
            label_selector="app.kubernetes.io/instance=phoenix"
        )

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_list_core_resources_without_label_selector(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test listing core resources without label selector defaults to None."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_resources = Mock()
        mock_resources.to_dict.return_value = {
            "apiVersion": "v1",
            "kind": "ServiceList",
            "items": []
        }
        mock_api_resource.get = AsyncMock(return_value=mock_resources)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get("/v1/resources/api/v1/Service")

        self.assertEqual(response.status_code, 200)
        mock_api_resource.get.assert_called_once_with(
            namespace="default",
            label_selector=None
        )

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_update_core_resource_success(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test replace respects a caller-supplied resourceVersion (optimistic concurrency)."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_existing = Mock()
        mock_existing.metadata.resourceVersion = "999"

        mock_api_resource = AsyncMock()
        mock_resource = Mock()
        resource_body = {
            "apiVersion": "v1",
            "kind": "ConfigMap",
            "metadata": {"name": "test-cm", "resourceVersion": "111"},
            "data": {"key": "value"},
        }
        mock_resource.to_dict.return_value = resource_body
        mock_api_resource.get = AsyncMock(return_value=mock_existing)
        mock_api_resource.replace = AsyncMock(return_value=mock_resource)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        submitted = {
            "apiVersion": "v1",
            "kind": "ConfigMap",
            "metadata": {"name": "test-cm", "resourceVersion": "111"},
            "data": {"key": "value"},
        }
        response = self.client.put("/v1/resources/api/v1/ConfigMap/test-cm", json=submitted)

        self.assertEqual(response.status_code, 200)
        expected_body = dict(submitted)
        expected_body["metadata"] = {"name": "test-cm", "resourceVersion": "111"}
        mock_api_resource.replace.assert_called_once_with(name="test-cm", body=expected_body, namespace="default")
        mock_api_resource.get.assert_not_called()

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_update_grouped_resource_success(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test successful replace of a grouped Kubernetes resource in place."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_existing = Mock()
        mock_existing.metadata.resourceVersion = "555"

        mock_api_resource = AsyncMock()
        mock_resource = Mock()
        result_body = {
            "apiVersion": "argoproj.io/v1alpha1",
            "kind": "WorkflowTemplate",
            "metadata": {"name": "test-wt", "resourceVersion": "555"},
        }
        mock_resource.to_dict.return_value = result_body
        mock_api_resource.get = AsyncMock(return_value=mock_existing)
        mock_api_resource.replace = AsyncMock(return_value=mock_resource)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        submitted = {
            "apiVersion": "argoproj.io/v1alpha1",
            "kind": "WorkflowTemplate",
            "metadata": {"name": "test-wt"},
        }
        response = self.client.put(
            "/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate/test-wt",
            json=submitted,
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["kind"], "WorkflowTemplate")
        expected_body = dict(submitted)
        expected_body["metadata"] = {"name": "test-wt", "resourceVersion": "555"}
        mock_api_resource.replace.assert_called_once_with(name="test-wt", body=expected_body, namespace="default")

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_update_resource_without_resource_version(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test replace succeeds when submitted body has no resourceVersion."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_existing = Mock()
        mock_existing.metadata.resourceVersion = "12345"

        mock_api_resource = AsyncMock()
        mock_resource = Mock()
        mock_resource.to_dict.return_value = {
            "apiVersion": "v1",
            "kind": "ConfigMap",
            "metadata": {"name": "test-cm", "resourceVersion": "12345"},
        }
        mock_api_resource.get = AsyncMock(return_value=mock_existing)
        mock_api_resource.replace = AsyncMock(return_value=mock_resource)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        submitted = {
            "apiVersion": "v1",
            "kind": "ConfigMap",
            "metadata": {"name": "test-cm"},
        }
        response = self.client.put("/v1/resources/api/v1/ConfigMap/test-cm", json=submitted)

        self.assertEqual(response.status_code, 200)
        called_body = mock_api_resource.replace.call_args.kwargs["body"]
        self.assertEqual(called_body["metadata"]["resourceVersion"], "12345")

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_update_resource_with_namespace(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test replace uses explicit namespace parameter."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_existing = Mock()
        mock_existing.metadata.resourceVersion = "7"

        mock_api_resource = AsyncMock()
        mock_resource = Mock()
        mock_resource.to_dict.return_value = {
            "apiVersion": "v1",
            "kind": "ConfigMap",
            "metadata": {"name": "test-cm", "namespace": "custom-ns", "resourceVersion": "7"},
        }
        mock_api_resource.get = AsyncMock(return_value=mock_existing)
        mock_api_resource.replace = AsyncMock(return_value=mock_resource)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        submitted = {"apiVersion": "v1", "kind": "ConfigMap", "metadata": {"name": "test-cm"}}
        response = self.client.put(
            "/v1/resources/api/v1/ConfigMap/test-cm?namespace=custom-ns",
            json=submitted,
        )

        self.assertEqual(response.status_code, 200)
        mock_api_resource.get.assert_called_once_with(name="test-cm", namespace="custom-ns")
        called_kwargs = mock_api_resource.replace.call_args.kwargs
        self.assertEqual(called_kwargs["namespace"], "custom-ns")

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_update_resource_name_mismatch_uses_path_name(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test replace targets the URL path name, not body.metadata.name, when they differ."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_existing = Mock()
        mock_existing.metadata.resourceVersion = "42"

        mock_api_resource = AsyncMock()
        mock_resource = Mock()
        mock_resource.to_dict.return_value = {
            "apiVersion": "v1",
            "kind": "ConfigMap",
            "metadata": {"name": "body-name", "resourceVersion": "42"},
        }
        mock_api_resource.get = AsyncMock(return_value=mock_existing)
        mock_api_resource.replace = AsyncMock(return_value=mock_resource)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        submitted = {
            "apiVersion": "v1",
            "kind": "ConfigMap",
            "metadata": {"name": "body-name"},
        }
        response = self.client.put("/v1/resources/api/v1/ConfigMap/path-name", json=submitted)

        self.assertEqual(response.status_code, 200)
        mock_api_resource.get.assert_called_once_with(name="path-name", namespace="default")
        called_kwargs = mock_api_resource.replace.call_args.kwargs
        self.assertEqual(called_kwargs["name"], "path-name")

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.get_context')
    @patch('ark_api.api.v1.resources.client.AuthorizationV1Api')
    def test_access_review_allowed(self, mock_auth_api_cls, mock_get_context, mock_api_client):
        """Test access review returns allowed=True when RBAC permits the action."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_auth_api = Mock()
        mock_result = Mock()
        mock_result.status = Mock(allowed=True)
        mock_auth_api.create_self_subject_access_review = AsyncMock(return_value=mock_result)
        mock_auth_api_cls.return_value = mock_auth_api

        response = self.client.post(
            "/v1/resources/access-review",
            json={"group": "argoproj.io", "resource": "workflowtemplates", "verb": "update"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"allowed": True})
        mock_auth_api.create_self_subject_access_review.assert_called_once()

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.get_context')
    @patch('ark_api.api.v1.resources.client.AuthorizationV1Api')
    def test_access_review_denied(self, mock_auth_api_cls, mock_get_context, mock_api_client):
        """Test access review returns allowed=False when RBAC denies the action."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_auth_api = Mock()
        mock_result = Mock()
        mock_result.status = Mock(allowed=False)
        mock_auth_api.create_self_subject_access_review = AsyncMock(return_value=mock_result)
        mock_auth_api_cls.return_value = mock_auth_api

        response = self.client.post(
            "/v1/resources/access-review",
            json={"group": "argoproj.io", "resource": "workflowtemplates", "verb": "update"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"allowed": False})

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.get_context')
    @patch('ark_api.api.v1.resources.client.AuthorizationV1Api')
    def test_access_review_defaults_namespace(self, mock_auth_api_cls, mock_get_context, mock_api_client):
        """Test access review defaults namespace to context when omitted."""
        mock_get_context.return_value = {"namespace": "context-ns"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_auth_api = Mock()
        mock_result = Mock()
        mock_result.status = Mock(allowed=True)
        mock_auth_api.create_self_subject_access_review = AsyncMock(return_value=mock_result)
        mock_auth_api_cls.return_value = mock_auth_api

        response = self.client.post(
            "/v1/resources/access-review",
            json={"resource": "configmaps", "verb": "get"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["allowed"])
        review_arg = mock_auth_api.create_self_subject_access_review.call_args.args[0]
        self.assertEqual(review_arg.spec.resource_attributes.namespace, "context-ns")
        self.assertEqual(review_arg.spec.resource_attributes.verb, "get")
        self.assertEqual(review_arg.spec.resource_attributes.resource, "configmaps")


class FakeLogStreamContent:
    """Minimal stand-in for an aiohttp response body."""

    def __init__(self, data: bytes, chunk_size: int = 4096):
        self.data = data
        self.chunk_size = chunk_size

    def iter_chunked(self, _size):
        async def generator():
            for start in range(0, len(self.data), self.chunk_size):
                yield self.data[start:start + self.chunk_size]
        return generator()


class FakeLogStream:
    """Minimal stand-in for a streamed pod log response."""

    def __init__(self, data: bytes, status: int = 200):
        self.status = status
        self.content = FakeLogStreamContent(data)
        self.released = False

    def release(self):
        self.released = True


def build_log_bytes(total_lines: int, text: str = "line") -> bytes:
    lines = [
        f"2024-01-01T{index // 3600:02d}:{index // 60 % 60:02d}:{index % 60:02d}.{index:09d}Z {text} {index}"
        for index in range(total_lines)
    ]
    return ("\n".join(lines) + "\n").encode("utf-8")


def make_log_stream_reader(total_lines: int, streams: list, line_bytes: int = 0):
    """Return a read_namespaced_pod_log stub honouring tail_lines."""
    async def reader(**kwargs):
        text = "x" * line_bytes if line_bytes else "line"
        lines = build_log_bytes(total_lines, text).split(b"\n")[:-1]
        tail_lines = kwargs.get("tail_lines")
        if tail_lines is not None:
            lines = lines[-tail_lines:]
        stream = FakeLogStream(b"\n".join(lines) + b"\n")
        streams.append((kwargs, stream))
        return stream
    return reader


class TestPodLogWindowEndpoint(unittest.TestCase):
    """Test cases for the windowed pod log endpoints."""

    def setUp(self):
        from ark_api.main import app
        self.client = TestClient(app)

    def _mock_core_v1(self, mock_core_v1_cls, total_lines, line_bytes=0):
        streams = []
        mock_core_v1 = AsyncMock()
        mock_core_v1.read_namespaced_pod_log = make_log_stream_reader(total_lines, streams, line_bytes)
        mock_core_v1_cls.return_value = mock_core_v1
        return mock_core_v1, streams

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_tail_page_returns_newest_lines(self, mock_core_v1_cls, mock_api_client):
        """The default page is the tail of the log."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        _, streams = self._mock_core_v1(mock_core_v1_cls, 2500)

        response = self.client.get(
            "/v1/resources/api/v1/namespaces/default/pods/test-pod/log/window?max_lines=1000"
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        lines = body["content"].splitlines()
        self.assertEqual(body["line_count"], 1000)
        self.assertEqual(lines[0], "line 1500")
        self.assertEqual(lines[-1], "line 2499")
        self.assertTrue(body["has_more_before"])
        self.assertFalse(body["truncated"])
        self.assertEqual(streams[0][0]["tail_lines"], 1)
        self.assertEqual(streams[-1][0]["tail_lines"], 1000)
        self.assertTrue(all(stream.released for _, stream in streams))

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_skip_tail_lines_pages_backwards_without_gaps(self, mock_core_v1_cls, mock_api_client):
        """Paging backwards yields contiguous, non-overlapping windows."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        self._mock_core_v1(mock_core_v1_cls, 2500)

        first = self.client.get(
            "/v1/resources/api/v1/namespaces/default/pods/test-pod/log/window?max_lines=1000"
        ).json()
        second = self.client.get(
            "/v1/resources/api/v1/namespaces/default/pods/test-pod/log/window"
            f"?max_lines=1000&skip_tail_lines=1000&before_timestamp={first['first_timestamp']}"
        ).json()
        third = self.client.get(
            "/v1/resources/api/v1/namespaces/default/pods/test-pod/log/window"
            f"?max_lines=1000&skip_tail_lines=2000&before_timestamp={second['first_timestamp']}"
        ).json()

        self.assertEqual(second["content"].splitlines()[0], "line 500")
        self.assertEqual(second["content"].splitlines()[-1], "line 1499")
        self.assertTrue(second["has_more_before"])

        self.assertEqual(third["line_count"], 500)
        self.assertEqual(third["content"].splitlines()[0], "line 0")
        self.assertEqual(third["content"].splitlines()[-1], "line 499")
        self.assertFalse(third["has_more_before"])

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_lines_larger_than_the_byte_cap_still_page(self, mock_core_v1_cls, mock_api_client):
        """Lines bigger than the byte budget page one at a time instead of stalling."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        _, streams = self._mock_core_v1(mock_core_v1_cls, 40, line_bytes=4096)

        first = self.client.get(
            "/v1/resources/api/v1/namespaces/default/pods/test-pod/log/window"
            "?max_lines=1000&max_bytes=4096"
        ).json()
        second = self.client.get(
            "/v1/resources/api/v1/namespaces/default/pods/test-pod/log/window"
            f"?max_lines=1000&max_bytes=4096&skip_tail_lines={first['line_count']}"
            f"&before_timestamp={first['first_timestamp']}"
        ).json()

        self.assertEqual(first["line_count"], 1)
        self.assertTrue(first["has_more_before"])
        self.assertEqual(second["line_count"], 1)
        self.assertTrue(second["has_more_before"])
        self.assertNotEqual(first["first_timestamp"], second["first_timestamp"])
        self.assertLess(second["first_timestamp"], first["first_timestamp"])
        self.assertLessEqual(max(stream[0]["tail_lines"] for stream in streams), 2)

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_page_past_start_of_log_is_empty(self, mock_core_v1_cls, mock_api_client):
        """Skipping past the start of the log returns nothing."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        self._mock_core_v1(mock_core_v1_cls, 2500)

        body = self.client.get(
            "/v1/resources/api/v1/namespaces/default/pods/test-pod/log/window"
            "?max_lines=1000&skip_tail_lines=2500"
            "&before_timestamp=2024-01-01T00:00:00.000000000Z"
        ).json()

        self.assertEqual(body["line_count"], 0)
        self.assertEqual(body["content"], "")
        self.assertFalse(body["has_more_before"])

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_byte_cap_keeps_newest_lines_and_stays_contiguous(self, mock_core_v1_cls, mock_api_client):
        """A byte-capped page keeps its newest lines and the next page abuts it."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        self._mock_core_v1(mock_core_v1_cls, 2500)

        first = self.client.get(
            "/v1/resources/api/v1/namespaces/default/pods/test-pod/log/window"
            "?max_lines=1000&max_bytes=2048"
        ).json()

        self.assertLess(first["line_count"], 1000)
        self.assertLessEqual(first["byte_count"], 2048)
        self.assertEqual(first["content"].splitlines()[-1], "line 2499")

        second = self.client.get(
            "/v1/resources/api/v1/namespaces/default/pods/test-pod/log/window"
            f"?max_lines=1000&max_bytes=2048&skip_tail_lines={first['line_count']}"
            f"&before_timestamp={first['first_timestamp']}"
        ).json()

        oldest_kept = int(first["content"].splitlines()[0].split()[-1])
        newest_older = int(second["content"].splitlines()[-1].split()[-1])
        self.assertEqual(newest_older, oldest_kept - 1)

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_since_timestamp_returns_only_newer_lines(self, mock_core_v1_cls, mock_api_client):
        """Live tail polling returns only lines newer than the cursor."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        _, streams = self._mock_core_v1(mock_core_v1_cls, 50)

        body = self.client.get(
            "/v1/resources/api/v1/namespaces/default/pods/test-pod/log/window"
            "?since_timestamp=2024-01-01T00:00:45.000000045Z"
        ).json()

        self.assertEqual(body["content"].splitlines(), [f"line {index}" for index in range(46, 50)])
        self.assertEqual(body["last_timestamp"], "2024-01-01T00:00:49.000000049Z")
        self.assertFalse(body["has_more_before"])
        self.assertNotIn("tail_lines", streams[0][0])
        self.assertGreater(streams[0][0]["since_seconds"], 0)

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_timestamps_are_always_requested_and_stripped(self, mock_core_v1_cls, mock_api_client):
        """Timestamps drive the cursor but never reach the rendered content."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        _, streams = self._mock_core_v1(mock_core_v1_cls, 3)

        body = self.client.get(
            "/v1/resources/api/v1/namespaces/default/pods/test-pod/log/window"
        ).json()

        self.assertTrue(streams[0][0]["timestamps"])
        self.assertEqual(body["content"], "line 0\nline 1\nline 2")
        self.assertEqual(body["first_timestamp"], "2024-01-01T00:00:00.000000000Z")

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_workflow_log_window_resolves_node_to_pod(self, mock_core_v1_cls, mock_api_client):
        """The workflow route falls back to a label lookup when the node is not a pod."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        mock_core_v1, _ = self._mock_core_v1(mock_core_v1_cls, 5)
        mock_core_v1.read_namespaced_pod = AsyncMock(
            side_effect=ApiException(status=404, reason="Not Found")
        )
        pod = Mock()
        pod.metadata.name = "test-workflow-step-abc123"
        pod_list = Mock()
        pod_list.items = [pod]
        mock_core_v1.list_namespaced_pod = AsyncMock(return_value=pod_list)

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/"
            "test-workflow/step-abc123/log/window"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["line_count"], 5)
        mock_core_v1.list_namespaced_pod.assert_awaited_once()

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    @patch('ark_api.api.v1.resources.DynamicClient')
    def test_workflow_log_window_reports_deleted_pod(self, mock_dynamic_client_cls, mock_core_v1_cls, mock_api_client):
        """A finished node with no pod explains how to archive logs."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        mock_core_v1 = AsyncMock()
        mock_core_v1.read_namespaced_pod = AsyncMock(
            side_effect=ApiException(status=404, reason="Not Found")
        )
        pod_list = Mock()
        pod_list.items = []
        mock_core_v1.list_namespaced_pod = AsyncMock(return_value=pod_list)
        mock_core_v1_cls.return_value = mock_core_v1

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)
        mock_workflow = Mock()
        mock_workflow.to_dict.return_value = {
            "status": {"nodes": {"node": {"type": "Pod", "phase": "Succeeded"}}}
        }
        mock_workflow_resource = AsyncMock()
        mock_workflow_resource.get = AsyncMock(return_value=mock_workflow)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_workflow_resource)

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/wf/node/log/window"
        )

        self.assertEqual(response.status_code, 404)
        self.assertIn("archiveLogs", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
