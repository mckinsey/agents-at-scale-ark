"""Tests for export API endpoints."""
import os
import unittest
import json
import zipfile
import io
from unittest.mock import AsyncMock, Mock, patch, MagicMock
from datetime import datetime, timezone
from fastapi.testclient import TestClient

os.environ["AUTH_MODE"] = "open"

from ark_api.main import app


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
        """Test export with specific resource types - verifies correct filtering parameters are passed."""
        # Mock collect_resources to return ONLY agents (as if the filtering happened there)
        # We're testing that the endpoint correctly passes the filter and handles the response
        async def mock_collect_resources(*args, **kwargs):
            # Return only agents - simulating that collect_resources did the filtering
            return {
                "agents": [self.sample_agent]
            }
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

        # Verify ZIP contains only what collect_resources returned (agents)
        zip_data = io.BytesIO(response.content)
        with zipfile.ZipFile(zip_data, 'r') as zip_file:
            namelist = zip_file.namelist()
            self.assertIn("agents/test-agent.yaml", namelist)
            self.assertEqual(len(namelist), 1)

        # CRITICAL: Verify that collect_resources was called with the correct filtering parameters
        mock_collect.assert_called_once()
        call_kwargs = mock_collect.call_args.kwargs
        self.assertEqual(call_kwargs['resource_types'], ["agents"])

        # Also verify it wasn't called with ALL_RESOURCE_TYPES (which would mean no filtering)
        self.assertNotEqual(call_kwargs['resource_types'],
                           ["agents", "teams", "models", "queries", "a2a", "mcpservers",
                            "workflows", "evaluators", "evaluations"])

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
        """Test that errors in collection are handled properly."""
        # Mock an error during collection
        async def mock_error(*args, **kwargs):
            raise Exception("Failed to collect resources")
        mock_collect.side_effect = mock_error

        response = self.client.post("/v1/export/resources", json={})

        # Should return 500 error
        self.assertEqual(response.status_code, 500)

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


if __name__ == '__main__':
    unittest.main()