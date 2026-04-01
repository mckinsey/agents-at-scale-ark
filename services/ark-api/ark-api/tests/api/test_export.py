"""Tests for export API endpoints."""
import asyncio
import io
import json
import os
import unittest
import zipfile
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, Mock, patch

from fastapi.testclient import TestClient
from kubernetes.client.rest import ApiException

os.environ["AUTH_MODE"] = "open"

import ark_api.api.v1.export as export_module
from ark_api.main import app
from ark_api.api.v1.export import (
    _collect_workflows,
    collect_resources,
    get_export_history,
    update_export_history,
    EXPORT_CONFIGMAP_NAMESPACE,
)


class TestExportEndpoints(unittest.TestCase):
    """Test cases for the /export endpoints."""

    def setUp(self):
        """Set up test client."""
        self.client = TestClient(app)

        # Sample resource data for testing
        self.sample_agent = {
            "apiVersion": "v1alpha1",
            "kind": "Agent",
            "metadata": {
                "name": "test-agent",
                "namespace": "default",
                "uid": "123",
                "resourceVersion": "456"
            },
            "spec": {
                "model": "gpt-4",
                "tools": ["web-search"]
            }
        }

        self.sample_model = {
            "apiVersion": "v1alpha1",
            "kind": "Model",
            "metadata": {
                "name": "test-model",
                "namespace": "default"
            },
            "spec": {
                "provider": "openai",
                "model": "gpt-4"
            }
        }

    @patch('ark_api.api.v1.export.update_export_history')
    @patch('ark_api.api.v1.export.collect_resources')
    def test_export_resources_all_types_success(self, mock_collect, mock_update_history):
        """Test successful export of all resource types as ZIP."""
        # Mock the collect_resources to return our test data
        async def mock_collect_resources(*args, **kwargs):
            return {
                "agents": [self.sample_agent],
                "models": [self.sample_model]
            }
        mock_collect.side_effect = mock_collect_resources

        async def mock_update(*args, **kwargs):
            return None
        mock_update_history.side_effect = mock_update

        # Make request
        response = self.client.post("/v1/export/resources", json={})

        # Verify response
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "application/zip")

        # Verify ZIP contents
        zip_data = io.BytesIO(response.content)
        with zipfile.ZipFile(zip_data, 'r') as zip_file:
            namelist = zip_file.namelist()
            self.assertIn("agents/test-agent.yaml", namelist)
            self.assertIn("models/test-model.yaml", namelist)

    @patch('ark_api.api.v1.export.update_export_history')
    @patch('ark_api.api.v1.export.collect_resources')
    def test_export_with_specific_resource_types(self, mock_collect, mock_update_history):
        """Test that endpoint correctly passes filtering parameters to collect_resources.

        Note: The actual filtering happens inside collect_resources, not in the endpoint.
        This test verifies the endpoint correctly passes the requested resource types.
        """
        # Mock collect_resources to return only what was requested
        # (simulating that it correctly filtered based on the resource_types parameter)
        async def mock_collect_resources(resource_types, *args, **kwargs):
            # Simulate the filtering that happens inside collect_resources
            all_available = {
                "agents": [self.sample_agent],
                "models": [self.sample_model],
                "teams": [{
                    "apiVersion": "v1alpha1",
                    "kind": "Team",
                    "metadata": {"name": "test-team", "namespace": "default"},
                    "spec": {"members": ["agent1", "agent2"]}
                }]
            }
            # Return only requested types (this is what collect_resources does internally)
            return {k: v for k, v in all_available.items() if k in resource_types}
        mock_collect.side_effect = mock_collect_resources

        async def mock_update(*args, **kwargs):
            return None
        mock_update_history.side_effect = mock_update

        # Request only agents
        response = self.client.post(
            "/v1/export/resources",
            json={"resource_types": ["agents"]}
        )

        self.assertEqual(response.status_code, 200)

        # Verify ZIP contains only agents (what collect_resources returned)
        zip_data = io.BytesIO(response.content)
        with zipfile.ZipFile(zip_data, 'r') as zip_file:
            namelist = zip_file.namelist()
            self.assertIn("agents/test-agent.yaml", namelist)
            self.assertEqual(len(namelist), 1)

        # Verify that collect_resources was called with the correct filtering parameters
        mock_collect.assert_called_once()
        call_kwargs = mock_collect.call_args.kwargs
        self.assertEqual(call_kwargs['resource_types'], ["agents"])

        # Test with multiple resource types
        response2 = self.client.post(
            "/v1/export/resources",
            json={"resource_types": ["agents", "models"]}
        )
        self.assertEqual(response2.status_code, 200)

        # Verify both types are in the ZIP
        zip_data2 = io.BytesIO(response2.content)
        with zipfile.ZipFile(zip_data2, 'r') as zip_file:
            namelist = zip_file.namelist()
            self.assertIn("agents/test-agent.yaml", namelist)
            self.assertIn("models/test-model.yaml", namelist)
            self.assertEqual(len(namelist), 2)

    @patch('ark_api.api.v1.export.get_export_history')
    def test_export_history_endpoint(self, mock_get_history):
        """Test the export history endpoint."""
        # Mock history data
        async def mock_history_func(*args, **kwargs):
            return {
                "last_export": "2024-01-01T00:00:00Z",
                "export_count": 5,
                "last_resource_counts": {
                    "agents": 10,
                    "models": 5
                }
            }
        mock_get_history.side_effect = mock_history_func

        response = self.client.get("/v1/export/last-export-time")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["last_export"], "2024-01-01T00:00:00Z")
        self.assertEqual(data["export_count"], 5)

    @patch('ark_api.api.v1.export.collect_resources')
    def test_export_handles_errors(self, mock_collect):
        """Test that errors in collection are handled properly and visible to user."""
        # Mock an error during collection
        async def mock_error(*args, **kwargs):
            raise Exception("Failed to collect resources: Database connection timeout")
        mock_collect.side_effect = mock_error

        response = self.client.post("/v1/export/resources", json={})

        # Should return 500 error
        self.assertEqual(response.status_code, 500)

        # Verify error message is in the response
        error_detail = response.json().get("detail", "")
        self.assertIn("Internal server error", error_detail)

    @patch('ark_api.api.v1.export.update_export_history')
    @patch('ark_api.api.v1.export.collect_resources')
    def test_export_zip_file_structure(self, mock_collect, mock_update_history):
        """Test ZIP file creation with proper YAML formatting."""
        # Mock multiple resources
        async def mock_collect_resources(*args, **kwargs):
            return {
                "agents": [
                    {**self.sample_agent, "metadata": {**self.sample_agent["metadata"], "name": f"agent-{i}"}}
                    for i in range(2)
                ]
            }
        mock_collect.side_effect = mock_collect_resources

        async def mock_update(*args, **kwargs):
            return None
        mock_update_history.side_effect = mock_update

        response = self.client.post("/v1/export/resources", json={})

        self.assertEqual(response.status_code, 200)

        # Verify ZIP structure
        zip_data = io.BytesIO(response.content)
        with zipfile.ZipFile(zip_data, 'r') as zip_file:
            # Check a YAML file to ensure metadata is cleaned
            with zip_file.open("agents/agent-0.yaml") as f:
                content = f.read().decode('utf-8')
                # Should not contain uid or resourceVersion
                self.assertNotIn("uid:", content)
                self.assertNotIn("resourceVersion:", content)
                # Should contain name
                self.assertIn("agent-0", content)


class TestCollectResources(unittest.TestCase):
    """Test cases for the collect_resources function."""

    @patch('ark_api.api.v1.export.with_ark_client')
    def test_collect_resources_filters_by_type(self, mock_ark_client_context):
        """Test that collect_resources only collects requested resource types."""
        # Setup mock ark_client with all resource types available
        mock_ark_client = AsyncMock()

        # Create mock objects with to_dict method
        mock_agent = Mock()
        mock_agent.to_dict.return_value = {
            "apiVersion": "v1alpha1", "kind": "Agent",
            "metadata": {"name": "agent1", "namespace": "default"},
            "spec": {"model": "gpt-4"}
        }

        mock_model = Mock()
        mock_model.to_dict.return_value = {
            "apiVersion": "v1alpha1", "kind": "Model",
            "metadata": {"name": "model1", "namespace": "default"},
            "spec": {"provider": "openai"}
        }

        mock_team = Mock()
        mock_team.to_dict.return_value = {
            "apiVersion": "v1alpha1", "kind": "Team",
            "metadata": {"name": "team1", "namespace": "default"},
            "spec": {"members": ["agent1"]}
        }

        # Mock the list methods to return objects with to_dict
        mock_ark_client.agents.a_list = AsyncMock(return_value=[mock_agent])
        mock_ark_client.models.a_list = AsyncMock(return_value=[mock_model])
        mock_ark_client.teams.a_list = AsyncMock(return_value=[mock_team])

        # Setup context manager
        mock_context = AsyncMock()
        mock_context.__aenter__ = AsyncMock(return_value=mock_ark_client)
        mock_context.__aexit__ = AsyncMock(return_value=None)
        mock_ark_client_context.return_value = mock_context

        # Test 1: Request only agents - should NOT call models or teams
        result = asyncio.run(collect_resources(
            resource_types=["agents"],
            namespace="default"
        ))

        # Verify only agents were collected
        self.assertIn("agents", result)
        self.assertNotIn("models", result)
        self.assertNotIn("teams", result)
        self.assertEqual(len(result["agents"]), 1)
        self.assertEqual(result["agents"][0]["metadata"]["name"], "agent1")

        # Verify only agents.a_list was called
        mock_ark_client.agents.a_list.assert_called_once()
        mock_ark_client.models.a_list.assert_not_called()
        mock_ark_client.teams.a_list.assert_not_called()

        # Reset mocks for next test
        mock_ark_client.agents.a_list.reset_mock()
        mock_ark_client.models.a_list.reset_mock()
        mock_ark_client.teams.a_list.reset_mock()

        # Test 2: Request agents and models - should NOT call teams
        result = asyncio.run(collect_resources(
            resource_types=["agents", "models"],
            namespace="default"
        ))

        # Verify only requested types were collected
        self.assertIn("agents", result)
        self.assertIn("models", result)
        self.assertNotIn("teams", result)

        # Verify only requested methods were called
        mock_ark_client.agents.a_list.assert_called_once()
        mock_ark_client.models.a_list.assert_called_once()
        mock_ark_client.teams.a_list.assert_not_called()

        # Test 3: Request all types
        result = asyncio.run(collect_resources(
            resource_types=["agents", "models", "teams"],
            namespace="default"
        ))

        # Verify all types were collected
        self.assertIn("agents", result)
        self.assertIn("models", result)
        self.assertIn("teams", result)
        self.assertEqual(len(result), 3)



class TestExportHistoryNamespace(unittest.TestCase):
    """Tests that export history ConfigMap operations use the namespace from
    the service account token, not a hardcoded value."""

    @patch('ark_api.api.v1.export.EXPORT_CONFIGMAP_NAMESPACE', 'token-namespace')
    @patch('ark_api.api.v1.export.client')
    def test_get_export_history_reads_from_token_namespace(self, mock_client):
        """get_export_history reads the ConfigMap from the token-file namespace."""
        mock_v1 = MagicMock()
        mock_client.CoreV1Api.return_value = mock_v1
        mock_cm = MagicMock()
        mock_cm.data = {'history': json.dumps({
            'last_export': '2024-01-01T00:00:00',
            'export_count': 3
        })}
        mock_v1.read_namespaced_config_map.return_value = mock_cm

        result = asyncio.run(get_export_history())

        mock_v1.read_namespaced_config_map.assert_called_once_with(
            name='ark-export-metadata',
            namespace='token-namespace'
        )
        self.assertEqual(result['export_count'], 3)

    @patch('ark_api.api.v1.export.EXPORT_CONFIGMAP_NAMESPACE', 'token-namespace')
    @patch('ark_api.api.v1.export.client')
    def test_update_export_history_patches_configmap_in_token_namespace(self, mock_client):
        """update_export_history patches an existing ConfigMap in the token-file namespace."""
        mock_v1 = MagicMock()
        mock_client.CoreV1Api.return_value = mock_v1
        existing_cm = MagicMock()
        existing_cm.data = {'history': '{}'}
        mock_v1.read_namespaced_config_map.return_value = existing_cm

        asyncio.run(update_export_history(
            datetime(2024, 1, 1, tzinfo=timezone.utc),
            {'agents': 2}
        ))

        mock_v1.patch_namespaced_config_map.assert_called_once()
        call_kwargs = mock_v1.patch_namespaced_config_map.call_args.kwargs
        self.assertEqual(call_kwargs['namespace'], 'token-namespace')


class TestCollectWorkflowsNamespace(unittest.TestCase):
    """Tests that _collect_workflows resolves namespace from the token file
    when no namespace is explicitly provided."""

    @patch('ark_api.api.v1.export.get_current_context')
    @patch('ark_api.api.v1.export.CustomObjectsApi')
    def test_uses_token_namespace_when_none_provided(self, mock_api_cls, mock_get_ctx):
        """When namespace is None, _collect_workflows reads from the current context."""
        mock_get_ctx.return_value = {'namespace': 'token-namespace'}
        mock_api = MagicMock()
        mock_api_cls.return_value = mock_api
        mock_api.list_namespaced_custom_object.return_value = {'items': []}

        asyncio.run(_collect_workflows(namespace=None, resource_ids=None))

        mock_get_ctx.assert_called_once()
        call_kwargs = mock_api.list_namespaced_custom_object.call_args.kwargs
        self.assertEqual(call_kwargs['namespace'], 'token-namespace')

    @patch('ark_api.api.v1.export.get_current_context')
    @patch('ark_api.api.v1.export.CustomObjectsApi')
    def test_uses_provided_namespace_without_calling_token_helper(self, mock_api_cls, mock_get_ctx):
        """When namespace is supplied, _collect_workflows does not call get_current_context."""
        mock_api = MagicMock()
        mock_api_cls.return_value = mock_api
        mock_api.list_namespaced_custom_object.return_value = {'items': []}

        asyncio.run(_collect_workflows(namespace='explicit-ns', resource_ids=None))

        mock_get_ctx.assert_not_called()
        call_kwargs = mock_api.list_namespaced_custom_object.call_args.kwargs
        self.assertEqual(call_kwargs['namespace'], 'explicit-ns')


if __name__ == '__main__':
    unittest.main()
