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

    @patch('ark_api.api.v1.resources.ApiClient')
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

    @patch('ark_api.api.v1.resources.ApiClient')
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

    @patch('ark_api.api.v1.resources.ApiClient')
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

    @patch('ark_api.api.v1.resources.ApiClient')
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

    @patch('ark_api.api.v1.resources.ApiClient')
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

    @patch('ark_api.api.v1.resources.ApiClient')
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

    @patch('ark_api.api.v1.resources.ApiClient')
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

    @patch('ark_api.api.v1.resources.ApiClient')
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

    @patch('ark_api.api.v1.resources.ApiClient')
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

    @patch('ark_api.api.v1.resources.ApiClient')
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

    @patch('ark_api.api.v1.resources.ApiClient')
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

    @patch('ark_api.api.v1.resources.ApiClient')
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

    @patch('ark_api.api.v1.resources.ApiClient')
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

    @patch('ark_api.api.v1.resources.ApiClient')
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

    @patch('ark_api.api.v1.resources.ApiClient')
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

    @patch('ark_api.api.v1.resources.ApiClient')
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

    @patch('ark_api.api.v1.resources.ApiClient')
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

    @patch('ark_api.api.v1.resources.ApiClient')
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

    @patch('ark_api.api.v1.resources.ApiClient')
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

    @patch('ark_api.api.v1.resources.ApiClient')
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

    @patch('ark_api.api.v1.resources.ApiClient')
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

    @patch('ark_api.api.v1.resources.ApiClient')
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

    @patch('ark_api.api.v1.resources.ApiClient')
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

    @patch('ark_api.api.v1.resources.ApiClient')
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

    @patch('ark_api.api.v1.resources.ApiClient')
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

    @patch('ark_api.api.v1.resources.ApiClient')
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

    @patch('ark_api.api.v1.resources.ApiClient')
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


if __name__ == "__main__":
    unittest.main()
