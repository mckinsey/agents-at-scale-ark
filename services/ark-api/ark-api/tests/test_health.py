"""Tests for health check endpoints."""
import os
import unittest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from kubernetes_asyncio.client.rest import ApiException

# Set environment variable to skip authentication before importing the app
os.environ["AUTH_MODE"] = "open"


class TestHealthEndpoints(unittest.TestCase):
    """Test cases for health check endpoints."""
    
    def setUp(self):
        """Set up test client."""
        from ark_api.main import app
        self.client = TestClient(app)
    
    def test_health_check_success(self):
        """Test successful health check."""
        response = self.client.get("/health")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["service"], "ark-api")
    
    @patch('ark_api.api.health.client.VersionApi')
    @patch('ark_api.api.health.client.ApiClient')
    def test_readiness_check_success(self, mock_api_client, mock_version_api):
        """Test successful readiness check."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance
        
        # Mock successful Kubernetes API call
        mock_version_instance = mock_version_api.return_value
        mock_version_instance.get_code = AsyncMock(return_value={"git_version": "v1.28.0"})
        
        response = self.client.get("/ready")
        
        # Assert response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ready")
        self.assertEqual(data["service"], "ark-api")
        
        # Verify Kubernetes API was called
        mock_version_instance.get_code.assert_called_once()
    
    @patch('ark_api.api.health.client.VersionApi')
    @patch('ark_api.api.health.client.ApiClient')
    def test_readiness_check_kubernetes_error(self, mock_api_client, mock_version_api):
        """Test readiness check when Kubernetes is unavailable."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        # Mock Kubernetes API error
        mock_version_instance = mock_version_api.return_value
        mock_version_instance.get_code = AsyncMock(side_effect=ApiException(
            status=503,
            reason="Service Unavailable"
        ))

        response = self.client.get("/ready")

        # Assert response
        self.assertEqual(response.status_code, 200)  # Endpoint still returns 200
        data = response.json()
        self.assertEqual(data["status"], "not ready")
        self.assertEqual(data["service"], "ark-api")
        self.assertIn("error", data)
        self.assertEqual(data["error"], "An internal error occurred during readiness check.")
    
    @patch('ark_api.api.health.client.VersionApi')
    @patch('ark_api.api.health.client.ApiClient')
    def test_readiness_check_connection_error(self, mock_api_client, mock_version_api):
        """Test readiness check when connection fails."""
        # Setup async context manager mock
        mock_api_client_instance = AsyncMock()
        mock_api_client.return_value.__aenter__.return_value = mock_api_client_instance

        # Mock connection error
        mock_version_instance = mock_version_api.return_value
        mock_version_instance.get_code = AsyncMock(side_effect=Exception("Connection refused"))

        response = self.client.get("/ready")

        # Assert response
        self.assertEqual(response.status_code, 200)  # Endpoint still returns 200
        data = response.json()
        self.assertEqual(data["status"], "not ready")
        self.assertEqual(data["service"], "ark-api")
        self.assertIn("error", data)
        self.assertEqual(data["error"], "An internal error occurred during readiness check.")
