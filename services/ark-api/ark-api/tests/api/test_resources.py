"""Tests for generic Kubernetes resources API endpoints."""
import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, Mock, patch
from fastapi.testclient import TestClient
from kubernetes_asyncio.client.rest import ApiException
from kubernetes_asyncio.dynamic.exceptions import ResourceNotFoundError

os.environ["AUTH_MODE"] = "open"

from ark_api.api.v1.pagination import MAX_PAGE_LIMIT


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
            "kind": "ServiceList",
            "items": [
                {"metadata": {"name": "svc-1"}},
                {"metadata": {"name": "svc-2"}}
            ]
        }
        mock_api_resource.get = AsyncMock(return_value=mock_resources)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get("/v1/resources/api/v1/Service")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["kind"], "ServiceList")
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
            "apiVersion": "argoproj.io/v1alpha1",
            "kind": "WorkflowTemplate",
            "metadata": {"name": "test-wt", "namespace": "custom-namespace"}
        }
        mock_api_resource.get = AsyncMock(return_value=mock_resource)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get("/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate/test-wt?namespace=custom-namespace")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["metadata"]["namespace"], "custom-namespace")
        mock_api_resource.get.assert_called_once_with(name="test-wt", namespace="custom-namespace")

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
        mock_api_resource.get = AsyncMock(side_effect=Exception("Unexpected failure"))
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get("/v1/resources/apis/argoproj.io/v1alpha1/Workflow/test-wf")

        self.assertEqual(response.status_code, 500)

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
            "kind": "ServiceList",
            "items": [
                {"metadata": {"name": "pod-1"}},
                {"metadata": {"name": "pod-2"}}
            ]
        }
        mock_api_resource.get = AsyncMock(return_value=mock_resources)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get(
            "/v1/resources/api/v1/Service",
            headers={"Accept": "text/yaml"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("application/yaml", response.headers["content-type"])
        self.assertIn("kind: ServiceList", response.text)

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
    def test_get_grouped_resource_api_lookup_failure(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
        """Test error handling when grouped API resource lookup fails."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_dynamic_client_instance.resources.get = AsyncMock(side_effect=Exception("API resource not found"))

        response = self.client.get("/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate/test-resource")

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
        """status and workflowTemplateName become one combined label selector; workflowName stays post-fetch."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_resources = Mock()
        # A real K8s server would already have applied the label selector -
        # only test-workflow-123 matches template=test-template AND phase=Running.
        mock_resources.to_dict.return_value = {
            "items": [
                {
                    "metadata": {"name": "test-workflow-123"},
                    "spec": {"workflowTemplateRef": {"name": "test-template"}},
                    "status": {"phase": "Running"}
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
        mock_api_resource.get.assert_called_once_with(
            namespace="default",
            label_selector="workflows.argoproj.io/workflow-template=test-template,"
            "workflows.argoproj.io/phase=Running",
            limit=None,
            _continue=None,
        )

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
        """workflowTemplateName becomes an exact-match label selector."""
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
                }
            ]
        }
        mock_api_resource.get = AsyncMock(return_value=mock_resources)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/Workflow?workflowTemplateName=prod-template"
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["items"]), 1)
        self.assertEqual(data["items"][0]["metadata"]["name"], "workflow1")
        mock_api_resource.get.assert_called_once_with(
            namespace="default",
            label_selector="workflows.argoproj.io/workflow-template=prod-template",
            limit=None,
            _continue=None,
        )

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
        mock_api_resource.get.assert_called_once_with(
            namespace="default",
            label_selector="workflows.argoproj.io/phase in (Failed,Error)",
            limit=None,
            _continue=None,
        )

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
        mock_api_resource.get.assert_called_once_with(
            namespace="default",
            label_selector="workflows.argoproj.io/phase=Succeeded",
            limit=None,
            _continue=None,
        )

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_list_workflows_filter_by_pending_status_uses_notin_selector(
        self, mock_get_context, mock_dynamic_client_cls, mock_api_client
    ):
        """'pending' also needs to catch workflows with no phase label yet, via `notin`."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_resources = Mock()
        mock_resources.to_dict.return_value = {"items": []}
        mock_api_resource.get = AsyncMock(return_value=mock_resources)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/Workflow?status=pending"
        )

        self.assertEqual(response.status_code, 200)
        mock_api_resource.get.assert_called_once_with(
            namespace="default",
            label_selector="workflows.argoproj.io/phase notin (Running,Succeeded,Failed,Error)",
            limit=None,
            _continue=None,
        )

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_list_workflows_combines_caller_label_selector_with_status(
        self, mock_get_context, mock_dynamic_client_cls, mock_api_client
    ):
        """A caller-supplied labelSelector is ANDed with the status-derived one."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_resources = Mock()
        mock_resources.to_dict.return_value = {"items": []}
        mock_api_resource.get = AsyncMock(return_value=mock_resources)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/Workflow"
            "?labelSelector=app.kubernetes.io/instance=phoenix&status=running"
        )

        self.assertEqual(response.status_code, 200)
        mock_api_resource.get.assert_called_once_with(
            namespace="default",
            label_selector="app.kubernetes.io/instance=phoenix,workflows.argoproj.io/phase=Running",
            limit=None,
            _continue=None,
        )

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_list_workflows_forwards_limit_and_continue_to_k8s(
        self, mock_get_context, mock_dynamic_client_cls, mock_api_client
    ):
        """Test that limit and continue query params reach the Kubernetes list call."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_resources = Mock()
        mock_resources.to_dict.return_value = {"items": []}
        mock_api_resource.get = AsyncMock(return_value=mock_resources)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/Workflow?limit=5&continue=abc123"
        )

        self.assertEqual(response.status_code, 200)
        mock_api_resource.get.assert_called_once_with(
            namespace="default", label_selector=None, limit=5, _continue="abc123"
        )

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_list_workflows_no_limit_used_when_not_specified(
        self, mock_get_context, mock_dynamic_client_cls, mock_api_client
    ):
        """Test that no limit (full list) and no continue token are used when omitted."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_resources = Mock()
        mock_resources.to_dict.return_value = {"items": []}
        mock_api_resource.get = AsyncMock(return_value=mock_resources)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get("/v1/resources/apis/argoproj.io/v1alpha1/Workflow")

        self.assertEqual(response.status_code, 200)
        mock_api_resource.get.assert_called_once_with(
            namespace="default", label_selector=None, limit=None, _continue=None
        )

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_list_workflows_passthrough_of_continue_and_remaining_count(
        self, mock_get_context, mock_dynamic_client_cls, mock_api_client
    ):
        """Test that continue/remainingItemCount metadata survives the Workflow filter block untouched."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_resources = Mock()
        mock_resources.to_dict.return_value = {
            "metadata": {"continue": "next-token-xyz", "remainingItemCount": 42},
            "items": [
                {
                    "metadata": {"name": "workflow1"},
                    "spec": {},
                    "status": {"phase": "Running"}
                }
            ]
        }
        mock_api_resource.get = AsyncMock(return_value=mock_resources)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get("/v1/resources/apis/argoproj.io/v1alpha1/Workflow?limit=1")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["metadata"]["continue"], "next-token-xyz")
        self.assertEqual(data["metadata"]["remainingItemCount"], 42)

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.get_context')
    def test_list_workflows_filtered_page_can_return_fewer_than_limit(
        self, mock_get_context, mock_dynamic_client_cls, mock_api_client
    ):
        """A filtered page may legitimately come back empty while more matches exist further on."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        mock_dynamic_client_instance = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(mock_dynamic_client_instance)

        mock_api_resource = AsyncMock()
        mock_resources = Mock()
        mock_resources.to_dict.return_value = {
            "metadata": {"continue": "more-to-come"},
            "items": [
                {
                    "metadata": {"name": "workflow1"},
                    "spec": {},
                    "status": {"phase": "Running"}
                }
            ]
        }
        mock_api_resource.get = AsyncMock(return_value=mock_resources)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/Workflow?workflowName=nonmatching&limit=1"
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["items"], [])
        self.assertEqual(data["metadata"]["continue"], "more-to-come")

    def test_list_workflows_limit_validation(self):
        """Test that out-of-range limit values are rejected."""
        too_low = self.client.get("/v1/resources/apis/argoproj.io/v1alpha1/Workflow?limit=0")
        self.assertEqual(too_low.status_code, 422)

        too_high = self.client.get(
            f"/v1/resources/apis/argoproj.io/v1alpha1/Workflow?limit={MAX_PAGE_LIMIT + 1}"
        )
        self.assertEqual(too_high.status_code, 422)

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
            "apiVersion": "argoproj.io/v1alpha1",
            "kind": "Workflow",
            "metadata": {"name": "test-wf"}
        }
        mock_resource.to_dict.return_value = resource_body
        mock_api_resource.create = AsyncMock(return_value=mock_resource)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.post(
            "/v1/resources/apis/argoproj.io/v1alpha1/Workflow?namespace=prod",
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
            "apiVersion": "argoproj.io/v1alpha1",
            "kind": "WorkflowTemplateList",
            "items": [
                {
                    "metadata": {
                        "name": "phoenix-template",
                        "labels": {"app.kubernetes.io/instance": "phoenix", "app": "phoenix"}
                    }
                },
                {
                    "metadata": {
                        "name": "other-template",
                        "labels": {"app": "other"}
                    }
                }
            ]
        }
        mock_api_resource.get = AsyncMock(return_value=mock_resources)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate?labelSelector=app.kubernetes.io/instance=phoenix"
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["kind"], "WorkflowTemplateList")
        mock_api_resource.get.assert_called_once_with(
            namespace="default",
            label_selector="app.kubernetes.io/instance=phoenix",
            limit=None,
            _continue=None,
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
    def test_update_resource_honours_resource_version(self, mock_get_context, mock_dynamic_client_cls, mock_api_client):
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
            "apiVersion": "argoproj.io/v1alpha1",
            "kind": "WorkflowTemplate",
            "metadata": {"name": "test-wt", "resourceVersion": "111"},
            "spec": {"entrypoint": "main"},
        }
        mock_resource.to_dict.return_value = resource_body
        mock_api_resource.get = AsyncMock(return_value=mock_existing)
        mock_api_resource.replace = AsyncMock(return_value=mock_resource)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        submitted = {
            "apiVersion": "argoproj.io/v1alpha1",
            "kind": "WorkflowTemplate",
            "metadata": {"name": "test-wt", "resourceVersion": "111"},
            "spec": {"entrypoint": "main"},
        }
        response = self.client.put("/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate/test-wt", json=submitted)

        self.assertEqual(response.status_code, 200)
        expected_body = dict(submitted)
        expected_body["metadata"] = {"name": "test-wt", "resourceVersion": "111"}
        mock_api_resource.replace.assert_called_once_with(name="test-wt", body=expected_body, namespace="default")
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
            "apiVersion": "argoproj.io/v1alpha1",
            "kind": "WorkflowTemplate",
            "metadata": {"name": "test-wt", "resourceVersion": "12345"},
        }
        mock_api_resource.get = AsyncMock(return_value=mock_existing)
        mock_api_resource.replace = AsyncMock(return_value=mock_resource)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        submitted = {
            "apiVersion": "argoproj.io/v1alpha1",
            "kind": "WorkflowTemplate",
            "metadata": {"name": "test-wt"},
        }
        response = self.client.put("/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate/test-wt", json=submitted)

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
            "apiVersion": "argoproj.io/v1alpha1",
            "kind": "WorkflowTemplate",
            "metadata": {"name": "test-wt", "namespace": "custom-ns", "resourceVersion": "7"},
        }
        mock_api_resource.get = AsyncMock(return_value=mock_existing)
        mock_api_resource.replace = AsyncMock(return_value=mock_resource)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        submitted = {"apiVersion": "argoproj.io/v1alpha1", "kind": "WorkflowTemplate", "metadata": {"name": "test-wt"}}
        response = self.client.put(
            "/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate/test-wt?namespace=custom-ns",
            json=submitted,
        )

        self.assertEqual(response.status_code, 200)
        mock_api_resource.get.assert_called_once_with(name="test-wt", namespace="custom-ns")
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
            "apiVersion": "argoproj.io/v1alpha1",
            "kind": "WorkflowTemplate",
            "metadata": {"name": "body-name", "resourceVersion": "42"},
        }
        mock_api_resource.get = AsyncMock(return_value=mock_existing)
        mock_api_resource.replace = AsyncMock(return_value=mock_resource)
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_api_resource)

        submitted = {
            "apiVersion": "argoproj.io/v1alpha1",
            "kind": "WorkflowTemplate",
            "metadata": {"name": "body-name"},
        }
        response = self.client.put("/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate/path-name", json=submitted)

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

    async def read(self, size):
        data = self.data[:size]
        self.data = self.data[size:]
        return data

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

    async def text(self):
        return self.content.data.decode("utf-8", errors="replace")


def build_log_lines(texts: list[str]) -> bytes:
    lines = [
        f"2024-01-01T{index // 3600:02d}:{index // 60 % 60:02d}:{index % 60:02d}.{index:09d}Z {text}"
        for index, text in enumerate(texts)
    ]
    return ("\n".join(lines) + "\n").encode("utf-8")


def build_log_bytes(total_lines: int, text: str = "line") -> bytes:
    return build_log_lines([f"{text} {index}" for index in range(total_lines)])


def make_log_stream_reader(total_lines: int, streams: list, line_bytes: int = 0, texts: list[str] | None = None):
    """Return a read_namespaced_pod_log stub honouring tail_lines."""
    async def reader(**kwargs):
        if texts is None:
            text = "x" * line_bytes if line_bytes else "line"
            lines = build_log_bytes(total_lines, text).split(b"\n")[:-1]
        else:
            lines = build_log_lines(texts).split(b"\n")[:-1]
        tail_lines = kwargs.get("tail_lines")
        if tail_lines is not None:
            lines = lines[-tail_lines:]
        data = b"\n".join(lines) + b"\n"
        limit_bytes = kwargs.get("limit_bytes")
        if limit_bytes is not None:
            data = data[:limit_bytes]
        stream = FakeLogStream(data)
        streams.append((kwargs, stream))
        return stream
    return reader


CRI_CHUNK_BYTES = 16384


def make_chunked_log_stream_reader(lines, streams):
    """Return a reader whose tail_lines counts 16KB CRI chunks, not lines."""
    chunks = []
    for timestamp, text in lines:
        for start in range(0, len(text), CRI_CHUNK_BYTES):
            chunks.append((timestamp, text[start:start + CRI_CHUNK_BYTES]))

    async def reader(**kwargs):
        tail_lines = kwargs.get("tail_lines")
        selected = chunks[-tail_lines:] if tail_lines is not None else list(chunks)
        parts = []
        previous = None
        for timestamp, text in selected:
            if timestamp == previous:
                parts[-1] += text
            else:
                parts.append(f"{timestamp} {text}")
                previous = timestamp
        data = ("\n".join(parts) + "\n").encode("utf-8") if parts else b""
        limit_bytes = kwargs.get("limit_bytes")
        if limit_bytes is not None:
            data = data[:limit_bytes]
        stream = FakeLogStream(data)
        streams.append((kwargs, stream))
        return stream

    return reader


def format_log_timestamp(moment: datetime) -> str:
    return f"{moment.strftime('%Y-%m-%dT%H:%M:%S')}.{moment.microsecond * 1000:09d}Z"


def build_recent_log_lines(total_lines: int, anchor: datetime) -> list[tuple[datetime, str]]:
    """One line per second, the newest stamped at ``anchor``."""
    return [
        (anchor - timedelta(seconds=total_lines - 1 - index), f"line {index}")
        for index in range(total_lines)
    ]


def make_recent_log_stream_reader(lines: list[tuple[datetime, str]], streams: list):
    """Return a reader that, like the kubelet, drops lines older than now - since_seconds."""
    async def reader(**kwargs):
        selected = list(lines)
        since_seconds = kwargs.get("since_seconds")
        if since_seconds is not None:
            cutoff = datetime.now(timezone.utc) - timedelta(seconds=since_seconds)
            selected = [(moment, text) for moment, text in selected if moment >= cutoff]
        tail_lines = kwargs.get("tail_lines")
        if tail_lines is not None:
            selected = selected[-tail_lines:]
        parts = [f"{format_log_timestamp(moment)} {text}" for moment, text in selected]
        data = ("\n".join(parts) + "\n").encode("utf-8") if parts else b""
        limit_bytes = kwargs.get("limit_bytes")
        if limit_bytes is not None:
            data = data[:limit_bytes]
        stream = FakeLogStream(data)
        streams.append((kwargs, stream))
        return stream

    return reader


class TestPodLogWindowEndpoint(unittest.TestCase):
    """Test cases for the windowed pod log endpoints."""

    def setUp(self):
        from ark_api.main import app
        self.client = TestClient(app)

    def _mock_core_v1(self, mock_core_v1_cls, total_lines, line_bytes=0, texts=None):
        streams = []
        mock_core_v1 = AsyncMock()
        mock_core_v1.read_namespaced_pod_log = make_log_stream_reader(total_lines, streams, line_bytes, texts)
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
        self.assertEqual(streams[0][0]["limit_bytes"], 1024 * 1024)
        self.assertNotIn("tail_lines", streams[0][0])
        self.assertEqual(streams[1][0]["tail_lines"], 1)
        self.assertEqual(streams[-1][0]["tail_lines"], 1001)
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
        self.assertLessEqual(max(stream[0].get("tail_lines", 0) for stream in streams), 3)

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_chunked_long_lines_page_as_whole_lines(self, mock_core_v1_cls, mock_api_client):
        """Lines split into several CRI chunks still page one whole line at a time."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        lines = [
            (f"2024-01-01T00:00:0{index}.00000000{index}Z", chr(ord("a") + index) * 40000)
            for index in range(4)
        ]
        mock_core_v1 = AsyncMock()
        mock_core_v1.read_namespaced_pod_log = make_chunked_log_stream_reader(lines, [])
        mock_core_v1_cls.return_value = mock_core_v1

        seen = []
        skip = 0
        before = None
        for _ in range(len(lines) + 1):
            query = f"max_lines=1000&max_bytes=50000&skip_tail_lines={skip}"
            if before:
                query += f"&before_timestamp={before}"
            body = self.client.get(
                f"/v1/resources/api/v1/namespaces/default/pods/test-pod/log/window?{query}"
            ).json()
            seen.append(body)
            if not body["has_more_before"]:
                break
            skip += body["line_count"]
            before = body["first_timestamp"]

        self.assertEqual(len(seen), 4)
        self.assertFalse(seen[-1]["has_more_before"])
        for index, body in enumerate(seen):
            self.assertEqual(body["line_count"], 1)
            self.assertEqual(body["first_timestamp"], lines[3 - index][0])

        for index, body in enumerate(seen[:-1]):
            self.assertEqual(body["content"], lines[3 - index][1])

        self.assertEqual(seen[-1]["content"], lines[0][1])

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

    def _long_tailed_log_texts(self, total_lines):
        return [f"line {index} " + "x" * 200 for index in range(total_lines - 1)] + [f"line {total_lines - 1}"]

    def _line_numbers(self, body):
        return [int(line.split()[1]) for line in body["content"].splitlines()]

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_byte_capped_page_reaching_log_start_still_has_more_before(self, mock_core_v1_cls, mock_api_client):
        """A tail range that spans the whole log but drops its oldest lines for the byte cap is not the first page."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        _, streams = self._mock_core_v1(mock_core_v1_cls, 60, texts=self._long_tailed_log_texts(60))

        body = self.client.get(
            "/v1/resources/api/v1/namespaces/default/pods/test-pod/log/window"
            "?max_lines=1000&max_bytes=4096"
        ).json()

        self.assertGreaterEqual(streams[-1][0]["tail_lines"], 60)
        self.assertLess(body["line_count"], 60)
        self.assertEqual(body["content"].splitlines()[-1], "line 59")
        self.assertLessEqual(body["byte_count"], 4096)
        self.assertTrue(body["truncated"])
        self.assertTrue(body["has_more_before"])

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_paging_back_from_a_byte_capped_first_page_recovers_the_dropped_lines(
        self, mock_core_v1_cls, mock_api_client
    ):
        """Walking back from a byte-capped page that spans the log yields every line exactly once."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        self._mock_core_v1(mock_core_v1_cls, 60, texts=self._long_tailed_log_texts(60))

        body = self.client.get(
            "/v1/resources/api/v1/namespaces/default/pods/test-pod/log/window"
            "?max_lines=1000&max_bytes=4096"
        ).json()
        self.assertTrue(body["has_more_before"])

        pages = [body]
        skip_tail_lines = body["line_count"]
        while body["has_more_before"]:
            self.assertLess(len(pages), 60)
            body = self.client.get(
                "/v1/resources/api/v1/namespaces/default/pods/test-pod/log/window"
                f"?max_lines=1000&max_bytes=4096&skip_tail_lines={skip_tail_lines}"
                f"&before_timestamp={body['first_timestamp']}"
            ).json()
            self.assertGreater(body["line_count"], 0)
            skip_tail_lines += body["line_count"]
            pages.append(body)

        collected = [number for page in reversed(pages) for number in self._line_numbers(page)]
        self.assertEqual(collected, list(range(60)))
        self.assertFalse(pages[-1]["has_more_before"])
        self.assertEqual(self._line_numbers(pages[-1])[0], 0)

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_page_reaching_log_start_within_the_byte_cap_is_the_first_page(self, mock_core_v1_cls, mock_api_client):
        """A whole log that fits one page reports nothing older."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        self._mock_core_v1(mock_core_v1_cls, 60)

        body = self.client.get(
            "/v1/resources/api/v1/namespaces/default/pods/test-pod/log/window"
            "?max_lines=1000&max_bytes=65536"
        ).json()

        self.assertEqual(body["line_count"], 60)
        self.assertEqual(self._line_numbers(body), list(range(60)))
        self.assertFalse(body["truncated"])
        self.assertFalse(body["has_more_before"])

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

    def _mock_recent_core_v1(self, mock_core_v1_cls, total_lines):
        streams = []
        lines = build_recent_log_lines(total_lines, datetime.now(timezone.utc))
        mock_core_v1 = AsyncMock()
        mock_core_v1.read_namespaced_pod_log = make_recent_log_stream_reader(lines, streams)
        mock_core_v1_cls.return_value = mock_core_v1
        return lines, streams

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_since_seconds_sent_to_kubelet_covers_the_cursor(self, mock_core_v1_cls, mock_api_client):
        """The since_seconds window reaches back far enough that the kubelet returns every newer line."""
        from ark_api.api.v1.resources import LOG_WINDOW_SINCE_SLACK_SECONDS

        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        lines, streams = self._mock_recent_core_v1(mock_core_v1_cls, 20)
        cursor_moment, _ = lines[-5]

        body = self.client.get(
            "/v1/resources/api/v1/namespaces/default/pods/test-pod/log/window"
            f"?since_timestamp={format_log_timestamp(cursor_moment)}"
        ).json()

        self.assertEqual(body["content"].splitlines(), [text for _, text in lines[-4:]])
        self.assertEqual(body["line_count"], 4)
        self.assertEqual(body["last_timestamp"], format_log_timestamp(lines[-1][0]))
        self.assertGreaterEqual(streams[0][0]["since_seconds"], 4 + LOG_WINDOW_SINCE_SLACK_SECONDS)
        self.assertLessEqual(streams[0][0]["since_seconds"], 4 + LOG_WINDOW_SINCE_SLACK_SECONDS + 2)
        served = streams[0][1].content.data.decode("utf-8").splitlines()
        self.assertGreaterEqual(len(served), 4)
        self.assertLess(len(served), len(lines))

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_fractional_since_timestamp_between_lines_returns_only_newer_lines(
        self, mock_core_v1_cls, mock_api_client
    ):
        """A cursor sitting between two lines still yields exactly the newer ones."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        lines, streams = self._mock_recent_core_v1(mock_core_v1_cls, 20)
        cursor_moment = lines[-6][0] + timedelta(milliseconds=500)

        body = self.client.get(
            "/v1/resources/api/v1/namespaces/default/pods/test-pod/log/window"
            f"?since_timestamp={format_log_timestamp(cursor_moment)}"
        ).json()

        self.assertEqual(body["content"].splitlines(), [text for _, text in lines[-5:]])
        self.assertEqual(body["line_count"], 5)
        self.assertEqual(body["first_timestamp"], format_log_timestamp(lines[-5][0]))
        self.assertEqual(body["last_timestamp"], format_log_timestamp(lines[-1][0]))
        served = streams[0][1].content.data.decode("utf-8").splitlines()
        self.assertLess(len(served), len(lines))

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_append_page_cut_mid_line_by_byte_limit_keeps_whole_lines(self, mock_core_v1_cls, mock_api_client):
        """A byte-limited append page drops the cut tail line so the cursor never skips it."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        _, streams = self._mock_core_v1(mock_core_v1_cls, 6, line_bytes=400)

        body = self.client.get(
            "/v1/resources/api/v1/namespaces/default/pods/test-pod/log/window"
            "?since_timestamp=2024-01-01T00:00:00.000000000Z&max_bytes=1024"
        ).json()

        self.assertEqual(streams[0][0]["limit_bytes"], 1024)
        self.assertEqual(len(streams[0][1].content.data), 1024)
        self.assertEqual(body["content"], "x" * 400 + " 1")
        self.assertEqual(body["line_count"], 1)
        self.assertEqual(body["last_timestamp"], "2024-01-01T00:00:01.000000001Z")
        self.assertTrue(body["truncated"])

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_timestamps_are_always_requested_and_stripped(self, mock_core_v1_cls, mock_api_client):
        """Timestamps drive the cursor but never reach the rendered content."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        _, streams = self._mock_core_v1(mock_core_v1_cls, 3)

        body = self.client.get(
            "/v1/resources/api/v1/namespaces/default/pods/test-pod/log/window"
        ).json()

        self.assertTrue(all(stream[0]["timestamps"] for stream in streams))
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

    def _mock_missing_workflow_pod(self, mock_core_v1_cls, mock_dynamic_client_cls, workflow_get):
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
        mock_workflow_resource = AsyncMock()
        mock_workflow_resource.get = workflow_get
        mock_dynamic_client_instance.resources.get = AsyncMock(return_value=mock_workflow_resource)

    def _workflow_with_nodes(self, nodes):
        mock_workflow = Mock()
        mock_workflow.to_dict.return_value = {"status": {"nodes": nodes}}
        return AsyncMock(return_value=mock_workflow)

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    @patch('ark_api.api.v1.resources.DynamicClient')
    def test_workflow_log_window_reports_unknown_node(self, mock_dynamic_client_cls, mock_core_v1_cls, mock_api_client):
        """A node id missing from the workflow status is a 404 naming the node and workflow."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        self._mock_missing_workflow_pod(
            mock_core_v1_cls,
            mock_dynamic_client_cls,
            self._workflow_with_nodes({"other": {"type": "Pod", "phase": "Succeeded"}}),
        )

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/wf/node/log/window"
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Node node not found in workflow wf")

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    @patch('ark_api.api.v1.resources.DynamicClient')
    def test_workflow_log_window_reports_node_without_logs(self, mock_dynamic_client_cls, mock_core_v1_cls, mock_api_client):
        """A running pod node or a non-pod node without a pod gets the generic unavailable detail."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()

        for node in ({"type": "Pod", "phase": "Running"}, {"type": "Steps", "phase": "Succeeded"}):
            with self.subTest(node=node):
                self._mock_missing_workflow_pod(
                    mock_core_v1_cls,
                    mock_dynamic_client_cls,
                    self._workflow_with_nodes({"node": node}),
                )

                response = self.client.get(
                    "/v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/wf/node/log/window"
                )

                self.assertEqual(response.status_code, 404)
                self.assertEqual(response.json()["detail"], "Logs are not available for node node")

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    @patch('ark_api.api.v1.resources.DynamicClient')
    def test_workflow_log_window_reports_missing_workflow(self, mock_dynamic_client_cls, mock_core_v1_cls, mock_api_client):
        """A workflow that no longer exists is a 404 naming the workflow, not a 500."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        self._mock_missing_workflow_pod(
            mock_core_v1_cls,
            mock_dynamic_client_cls,
            AsyncMock(side_effect=ApiException(status=404, reason="Not Found")),
        )

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/wf/node/log/window"
        )

        self.assertEqual(response.status_code, 404)
        self.assertIn("wf", response.json()["detail"])
        self.assertIn("not found", response.json()["detail"])

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    @patch('ark_api.api.v1.resources.DynamicClient')
    def test_workflow_log_window_propagates_workflow_lookup_status(self, mock_dynamic_client_cls, mock_core_v1_cls, mock_api_client):
        """A non-404 failure reading the workflow keeps its own status code."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        self._mock_missing_workflow_pod(
            mock_core_v1_cls,
            mock_dynamic_client_cls,
            AsyncMock(side_effect=ApiException(status=403, reason="Forbidden")),
        )

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/wf/node/log/window"
        )

        self.assertEqual(response.status_code, 403)
        self.assertIn("Forbidden", response.json()["detail"])

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    @patch('ark_api.api.v1.resources.DynamicClient')
    def test_workflow_log_window_keeps_a_forbidden_log_read_as_403(self, mock_dynamic_client_cls, mock_core_v1_cls, mock_api_client):
        """A denied log read keeps its own status instead of becoming archive guidance."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        mock_core_v1 = AsyncMock()
        mock_core_v1.read_namespaced_pod = AsyncMock(return_value=Mock())
        mock_core_v1.read_namespaced_pod_log = AsyncMock(
            side_effect=ApiException(status=403, reason="Forbidden")
        )
        mock_core_v1_cls.return_value = mock_core_v1

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/wf/node/log/window"
        )

        self.assertEqual(response.status_code, 403)
        self.assertNotIn("archiveLogs", response.json()["detail"])
        mock_dynamic_client_cls.assert_not_called()

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    @patch('ark_api.api.v1.resources.DynamicClient')
    def test_workflow_log_window_handles_a_missing_workflow_crd(self, mock_dynamic_client_cls, mock_core_v1_cls, mock_api_client):
        """Without the Argo CRD the explanation degrades to a 404, never an empty 500."""
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
        mock_dynamic_client_instance.resources.get = AsyncMock(
            side_effect=ResourceNotFoundError("No resource kind Workflow")
        )

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/wf/node/log/window"
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Logs are not available for node node")

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_malformed_since_timestamp_is_rejected_without_reading_logs(self, mock_core_v1_cls, mock_api_client):
        """An unparseable since_timestamp is a client error, never a silent tail page."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        _, streams = self._mock_core_v1(mock_core_v1_cls, 50)

        for cursor in ("not-a-timestamp", "2024-13-45T99:99:99Z"):
            with self.subTest(cursor=cursor):
                response = self.client.get(
                    "/v1/resources/api/v1/namespaces/default/pods/test-pod/log/window"
                    f"?since_timestamp={cursor}"
                )

                self.assertEqual(response.status_code, 422)
                self.assertIn("since_timestamp", response.json()["detail"])
                self.assertIn(cursor, response.json()["detail"])

        self.assertEqual(streams, [])

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_malformed_before_timestamp_is_rejected_without_reading_logs(self, mock_core_v1_cls, mock_api_client):
        """An unparseable before_timestamp is a client error, never a silent tail page."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        _, streams = self._mock_core_v1(mock_core_v1_cls, 50)

        response = self.client.get(
            "/v1/resources/api/v1/namespaces/default/pods/test-pod/log/window"
            "?skip_tail_lines=10&before_timestamp=2024-13-45T99:99:99Z"
        )

        self.assertEqual(response.status_code, 422)
        self.assertIn("before_timestamp", response.json()["detail"])
        self.assertEqual(streams, [])

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_workflow_window_rejects_malformed_since_timestamp_before_resolving_pod(self, mock_core_v1_cls, mock_api_client):
        """The workflow route reports the bad cursor as 422 instead of a pod-not-found 404."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        mock_core_v1, streams = self._mock_core_v1(mock_core_v1_cls, 5)

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/"
            "test-workflow/step-abc123/log/window?since_timestamp=not-a-timestamp"
        )

        self.assertEqual(response.status_code, 422)
        self.assertIn("since_timestamp", response.json()["detail"])
        self.assertEqual(streams, [])
        mock_core_v1.read_namespaced_pod.assert_not_awaited()
        mock_core_v1.list_namespaced_pod.assert_not_awaited()

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_out_of_range_paging_params_are_rejected_without_reading_logs(self, mock_core_v1_cls, mock_api_client):
        """Paging params outside their bounds are a 422 before any log stream opens."""
        from ark_api.api.v1.resources import LOG_WINDOW_MAX_BYTES_LIMIT, LOG_WINDOW_MAX_LINES_LIMIT

        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        _, streams = self._mock_core_v1(mock_core_v1_cls, 50)

        queries = (
            "max_lines=0",
            f"max_lines={LOG_WINDOW_MAX_LINES_LIMIT + 1}",
            "max_bytes=1023",
            f"max_bytes={LOG_WINDOW_MAX_BYTES_LIMIT + 1}",
            "skip_tail_lines=-1",
        )
        for query in queries:
            with self.subTest(query=query):
                response = self.client.get(
                    f"/v1/resources/api/v1/namespaces/default/pods/test-pod/log/window?{query}"
                )

                self.assertEqual(response.status_code, 422)
                self.assertIn(query.split("=")[0], str(response.json()["detail"]))

        self.assertEqual(streams, [])

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_pod_route_forwards_container_to_every_log_read(self, mock_core_v1_cls, mock_api_client):
        """The container query param reaches the probe, boundary and page reads alike."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        _, streams = self._mock_core_v1(mock_core_v1_cls, 2500)

        response = self.client.get(
            "/v1/resources/api/v1/namespaces/default/pods/test-pod/log/window"
            "?max_lines=1000&container=sidecar"
        )

        self.assertEqual(response.status_code, 200)
        self.assertGreater(len(streams), 1)
        self.assertTrue(all(kwargs["container"] == "sidecar" for kwargs, _ in streams))

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_pod_route_passes_no_container_by_default(self, mock_core_v1_cls, mock_api_client):
        """Without a container param the pod route lets the kubelet pick the container."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        _, streams = self._mock_core_v1(mock_core_v1_cls, 5)

        response = self.client.get(
            "/v1/resources/api/v1/namespaces/default/pods/test-pod/log/window"
        )

        self.assertEqual(response.status_code, 200)
        self.assertGreater(len(streams), 0)
        self.assertTrue(all(kwargs["container"] is None for kwargs, _ in streams))

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_workflow_route_defaults_container_to_main(self, mock_core_v1_cls, mock_api_client):
        """The workflow route reads the Argo main container unless told otherwise."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        _, streams = self._mock_core_v1(mock_core_v1_cls, 5)

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/wf/node/log/window"
        )

        self.assertEqual(response.status_code, 200)
        self.assertGreater(len(streams), 0)
        self.assertTrue(all(kwargs["container"] == "main" for kwargs, _ in streams))

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_workflow_route_forwards_explicit_container(self, mock_core_v1_cls, mock_api_client):
        """An explicit container on the workflow route overrides the main default."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        _, streams = self._mock_core_v1(mock_core_v1_cls, 5)

        response = self.client.get(
            "/v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/wf/node/log/window"
            "?container=sidecar"
        )

        self.assertEqual(response.status_code, 200)
        self.assertGreater(len(streams), 0)
        self.assertTrue(all(kwargs["container"] == "sidecar" for kwargs, _ in streams))

    @patch('ark_api.api.v1.client_utils.create_api_client')
    @patch('ark_api.api.v1.resources.CoreV1Api')
    def test_non_2xx_log_stream_is_reported_and_released(self, mock_core_v1_cls, mock_api_client):
        """A kubelet error status becomes an HTTP error carrying the body, and the stream is released."""
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        stream = FakeLogStream(b"container sidecar is not valid", status=400)
        mock_core_v1 = AsyncMock()
        mock_core_v1.read_namespaced_pod_log = AsyncMock(return_value=stream)
        mock_core_v1_cls.return_value = mock_core_v1

        response = self.client.get(
            "/v1/resources/api/v1/namespaces/default/pods/test-pod/log/window?container=sidecar"
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "container sidecar is not valid")
        self.assertTrue(stream.released)


class TestLogWindowTimestampHelpers(unittest.TestCase):
    """Direct unit tests for the log window timestamp helpers."""

    def test_normalize_adds_nanosecond_fraction_when_missing(self):
        from ark_api.api.v1.resources import _normalize_log_timestamp

        self.assertEqual(_normalize_log_timestamp("2024-01-01T00:00:00Z"), "2024-01-01T00:00:00.000000000Z")

    def test_normalize_pads_short_fraction_to_nine_digits(self):
        from ark_api.api.v1.resources import _normalize_log_timestamp

        self.assertEqual(_normalize_log_timestamp("2024-01-01T00:00:00.123Z"), "2024-01-01T00:00:00.123000000Z")

    def test_normalize_truncates_long_fraction_to_nine_digits(self):
        from ark_api.api.v1.resources import _normalize_log_timestamp

        self.assertEqual(
            _normalize_log_timestamp("2024-01-01T00:00:00.1234567890123Z"),
            "2024-01-01T00:00:00.123456789Z",
        )

    def test_normalize_appends_z_when_missing(self):
        from ark_api.api.v1.resources import _normalize_log_timestamp

        self.assertEqual(_normalize_log_timestamp("2024-01-01T00:00:00.5"), "2024-01-01T00:00:00.500000000Z")

    def test_normalize_returns_non_matching_value_unchanged(self):
        from ark_api.api.v1.resources import _normalize_log_timestamp

        self.assertEqual(_normalize_log_timestamp("not a timestamp"), "not a timestamp")

    def test_parse_returns_aware_utc_datetime(self):
        from datetime import datetime, timezone
        from ark_api.api.v1.resources import _parse_log_timestamp

        parsed = _parse_log_timestamp("2024-01-01T12:34:56.000000000Z")

        self.assertEqual(parsed, datetime(2024, 1, 1, 12, 34, 56, tzinfo=timezone.utc))
        self.assertEqual(parsed.utcoffset().total_seconds(), 0)

    def test_parse_drops_sub_microsecond_digits(self):
        from ark_api.api.v1.resources import _parse_log_timestamp

        parsed = _parse_log_timestamp("2024-01-01T00:00:00.123456789Z")

        self.assertEqual(parsed.microsecond, 123456)

    def test_parse_returns_none_for_non_matching_string(self):
        from ark_api.api.v1.resources import _parse_log_timestamp

        self.assertIsNone(_parse_log_timestamp("line 1"))

    def test_parse_returns_none_for_invalid_date(self):
        from ark_api.api.v1.resources import _parse_log_timestamp

        self.assertIsNone(_parse_log_timestamp("2024-13-45T99:99:99Z"))

    def test_split_returns_timestamp_and_text(self):
        from ark_api.api.v1.resources import _split_log_line

        self.assertEqual(
            _split_log_line("2024-01-01T00:00:00.000000000Z hello world"),
            ("2024-01-01T00:00:00.000000000Z", "hello world"),
        )

    def test_split_keeps_whole_line_when_first_token_is_not_a_timestamp(self):
        from ark_api.api.v1.resources import _split_log_line

        self.assertEqual(_split_log_line("hello world"), (None, "hello world"))

    def test_split_returns_empty_text_for_timestamp_with_trailing_space(self):
        from ark_api.api.v1.resources import _split_log_line

        self.assertEqual(_split_log_line("2024-01-01T00:00:00Z "), ("2024-01-01T00:00:00Z", ""))

    def test_split_keeps_bare_timestamp_as_text(self):
        from ark_api.api.v1.resources import _split_log_line

        self.assertEqual(_split_log_line("2024-01-01T00:00:00Z"), (None, "2024-01-01T00:00:00Z"))

    def test_since_seconds_covers_elapsed_time_plus_slack(self):
        from datetime import datetime, timedelta, timezone
        from ark_api.api.v1.resources import LOG_WINDOW_SINCE_SLACK_SECONDS, _since_seconds_for

        past = datetime.now(timezone.utc) - timedelta(seconds=100)

        result = _since_seconds_for(past.strftime("%Y-%m-%dT%H:%M:%S.%fZ"))

        self.assertGreaterEqual(result, 100 + LOG_WINDOW_SINCE_SLACK_SECONDS)
        self.assertLessEqual(result, 100 + LOG_WINDOW_SINCE_SLACK_SECONDS + 2)

    def test_since_seconds_is_at_least_one_for_future_timestamp(self):
        from datetime import datetime, timedelta, timezone
        from ark_api.api.v1.resources import _since_seconds_for

        future = datetime.now(timezone.utc) + timedelta(seconds=600)

        self.assertGreaterEqual(_since_seconds_for(future.strftime("%Y-%m-%dT%H:%M:%SZ")), 1)

    def test_since_seconds_returns_none_for_invalid_timestamp(self):
        from ark_api.api.v1.resources import _since_seconds_for

        self.assertIsNone(_since_seconds_for("yesterday"))

    def _collector(self, min_timestamp=None, max_timestamp=None):
        from ark_api.api.v1.resources import _LogWindowCollector

        return _LogWindowCollector(
            read_limit=10,
            max_bytes=1024,
            min_timestamp=min_timestamp,
            max_timestamp=max_timestamp,
            keep_newest=False,
        )

    def test_collector_rejects_untimestamped_line_when_min_cursor_set(self):
        collector = self._collector(min_timestamp="2024-01-01T00:00:00Z")

        collector.add("no timestamp here")

        self.assertEqual(list(collector.lines), [])
        self.assertEqual(collector.lines_read, 1)

    def test_collector_admits_untimestamped_line_when_only_max_cursor_set(self):
        collector = self._collector(max_timestamp="2024-01-01T00:00:00Z")

        collector.add("no timestamp here")

        self.assertEqual(list(collector.lines), ["no timestamp here"])
        self.assertFalse(collector.reached_known_lines)

    def test_collector_rejects_line_at_or_after_max_cursor(self):
        collector = self._collector(max_timestamp="2024-01-01T00:00:05Z")

        collector.add("2024-01-01T00:00:04.999999999Z before")
        collector.add("2024-01-01T00:00:05.000000000Z at")
        collector.add("2024-01-01T00:00:06Z after")

        self.assertEqual(list(collector.lines), ["before"])
        self.assertTrue(collector.reached_known_lines)

    def test_collector_rejects_line_equal_to_min_cursor_and_admits_newer(self):
        collector = self._collector(min_timestamp="2024-01-01T00:00:05Z")

        collector.add("2024-01-01T00:00:05.000000000Z equal")
        collector.add("2024-01-01T00:00:05.000000001Z newer")

        self.assertEqual(list(collector.lines), ["newer"])
        self.assertEqual(list(collector.timestamps), ["2024-01-01T00:00:05.000000001Z"])

    def test_collector_compares_cursors_across_fraction_precision(self):
        collector = self._collector(min_timestamp="2024-01-01T00:00:01Z", max_timestamp="2024-01-01T00:00:02.5Z")

        collector.add("2024-01-01T00:00:01.000000001Z first")
        collector.add("2024-01-01T00:00:02.499Z second")
        collector.add("2024-01-01T00:00:02.500000000Z third")

        self.assertEqual(list(collector.lines), ["first", "second"])
        self.assertTrue(collector.reached_known_lines)


if __name__ == "__main__":
    unittest.main()
