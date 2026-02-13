"""Test cases for export API endpoints."""

import os
import unittest
from unittest.mock import Mock, patch, AsyncMock
from io import BytesIO
import zipfile
from fastapi.testclient import TestClient

# Set environment variable to skip authentication before importing the app
from ark_api.auth.constants import AuthMode
os.environ["AUTH_MODE"] = AuthMode.OPEN


class TestExportEndpoints(unittest.TestCase):
    """Test cases for essential export endpoints."""

    def setUp(self):
        """Set up test client."""
        from ark_api.main import app
        self.client = TestClient(app)

    @patch('ark_api.api.v1.export.with_ark_client')
    def test_export_all_creates_valid_zip(self, mock_ark_client_context):
        """Test that export all creates a valid zip file."""
        # Mock ark client
        mock_ark_client = Mock()
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_ark_client
        mock_context.__aexit__.return_value = None
        mock_ark_client_context.return_value = mock_context

        # Mock minimal resources
        mock_ark_client.agents.a_list.return_value = [
            Mock(name="test-agent", spec={"prompt": "test"})
        ]
        mock_ark_client.teams.a_list.return_value = []
        mock_ark_client.models.a_list.return_value = []
        mock_ark_client.queries.a_list.return_value = []
        mock_ark_client.a2aservers.a_list.return_value = []
        mock_ark_client.mcpservers.a_list.return_value = []
        mock_ark_client.evaluators.a_list.return_value = []
        mock_ark_client.workflowtemplates.a_list.return_value = []
        mock_ark_client.evaluations.a_list.return_value = []

        response = self.client.post("/v1/export/all")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "application/zip")

        # Verify it's a valid zip
        zip_buffer = BytesIO(response.content)
        with zipfile.ZipFile(zip_buffer, 'r') as zip_file:
            file_list = zip_file.namelist()
            self.assertIn("agents/test-agent.yaml", file_list)

    @patch('ark_api.api.v1.export.with_ark_client')
    def test_export_selected_resources(self, mock_ark_client_context):
        """Test selective resource export."""
        # Mock ark client
        mock_ark_client = Mock()
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_ark_client
        mock_context.__aexit__.return_value = None
        mock_ark_client_context.return_value = mock_context

        mock_ark_client.agents.a_get.return_value = Mock(
            name="agent-1", spec={"prompt": "test"}
        )

        request_data = {
            "resource_types": ["agents"],
            "resource_ids": {"agents": ["agent-1"]}
        }
        response = self.client.post("/v1/export/resources", json=request_data)

        self.assertEqual(response.status_code, 200)
        mock_ark_client.agents.a_get.assert_called_with("agent-1")

    def test_export_empty_selection_returns_error(self):
        """Test that empty selection returns an error."""
        request_data = {
            "resource_types": [],
            "resource_ids": {}
        }
        response = self.client.post("/v1/export/resources", json=request_data)

        self.assertEqual(response.status_code, 400)
        self.assertIn("No resources selected", response.json()["detail"])

    def test_get_last_export_time(self):
        """Test getting last export time."""
        response = self.client.get("/v1/export/last-export-time")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("last_export", data)
        self.assertIn("export_count", data)