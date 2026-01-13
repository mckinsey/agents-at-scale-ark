"""Tests for proxy endpoint."""
import os
import unittest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient

os.environ["AUTH_MODE"] = "open"


class TestListServices(unittest.TestCase):
    """Test cases for list services endpoint."""

    def setUp(self):
        """Set up test client."""
        from ark_api.main import app
        self.client = TestClient(app)

    @patch('ark_api.api.v1.proxy.get_context')
    @patch('ark_api.api.v1.proxy.ApiClient')
    def test_list_services_success(self, mock_api_client, mock_get_context):
        """Test listing available services."""
        mock_get_context.return_value = {"namespace": "default"}

        mock_svc1 = MagicMock()
        mock_svc1.metadata.name = "file-gateway-api"
        mock_svc2 = MagicMock()
        mock_svc2.metadata.name = "other-service"

        mock_services = MagicMock()
        mock_services.items = [mock_svc1, mock_svc2]

        mock_v1 = MagicMock()
        mock_v1.list_namespaced_service = AsyncMock(return_value=mock_services)

        mock_client_instance = MagicMock()
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=None)
        mock_api_client.return_value = mock_client_instance

        with patch('ark_api.api.v1.proxy.client.CoreV1Api', return_value=mock_v1):
            response = self.client.get("/v1/proxy/services")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("services", data)
        self.assertEqual(data["services"], ["file-gateway-api", "other-service"])


class TestProxyEndpoint(unittest.TestCase):
    """Test cases for proxy endpoint."""

    def setUp(self):
        """Set up test client."""
        from ark_api.main import app
        self.client = TestClient(app)

    @patch('httpx.AsyncClient.request')
    def test_proxy_get_request_success(self, mock_request):
        """Test successful GET request proxying."""
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.headers = {"content-type": "application/json"}
        mock_response.json.return_value = {"files": [{"name": "test.txt"}]}
        mock_response.content = b'{"files": [{"name": "test.txt"}]}'
        mock_request.return_value = mock_response

        response = self.client.get("/v1/proxy/services/file-gateway/files")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("files", data)
        self.assertEqual(len(data["files"]), 1)
        self.assertEqual(data["files"][0]["name"], "test.txt")

        mock_request.assert_called_once()
        call_args = mock_request.call_args
        self.assertEqual(call_args.kwargs["method"], "GET")
        self.assertIn("file-gateway", call_args.kwargs["url"])
        self.assertIn("/files", call_args.kwargs["url"])

    @patch('httpx.AsyncClient.request')
    def test_proxy_post_request_success(self, mock_request):
        """Test successful POST request proxying."""
        mock_response = AsyncMock()
        mock_response.status_code = 201
        mock_response.headers = {"content-type": "application/json"}
        mock_response.content = b'{"id": "123", "name": "uploaded.txt"}'
        mock_request.return_value = mock_response

        response = self.client.post(
            "/v1/proxy/services/file-gateway/files",
            json={"name": "test.txt", "content": "test content"}
        )

        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["id"], "123")

    @patch('httpx.AsyncClient.request')
    def test_proxy_with_query_params(self, mock_request):
        """Test proxying request with query parameters."""
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.headers = {"content-type": "application/json"}
        mock_response.content = b'{"files": []}'
        mock_request.return_value = mock_response

        response = self.client.get("/v1/proxy/services/file-gateway/files?prefix=test&max_keys=10")

        self.assertEqual(response.status_code, 200)
        mock_request.assert_called_once()
        call_args = mock_request.call_args
        self.assertIn("prefix", str(call_args.kwargs.get("params", {})))

    @patch('httpx.AsyncClient.request')
    def test_proxy_service_error(self, mock_request):
        """Test proxy handling of service errors."""
        from httpx import ConnectError
        mock_request.side_effect = ConnectError("Connection refused")

        response = self.client.get("/v1/proxy/services/file-gateway/files")

        self.assertEqual(response.status_code, 502)
        data = response.json()
        self.assertIn("detail", data)
        self.assertIn("Failed to proxy request", data["detail"])

    @patch('httpx.AsyncClient.request')
    def test_proxy_handles_large_file_download(self, mock_request):
        """Test that proxy properly handles large file downloads without header conflicts.

        The proxy should forward the content-length header from the backend and not
        introduce transfer-encoding: chunked which would conflict with it.
        """
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.headers = {
            "content-type": "application/octet-stream",
            "content-disposition": "attachment; filename=test.jpg",
            "content-length": "924836",
        }
        mock_response.content = b"fake file content"
        mock_request.return_value = mock_response

        response = self.client.get("/v1/proxy/services/file-gateway-api/files/test.jpg/download")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"fake file content")

        response_headers = dict(response.headers)
        self.assertIn("content-type", response_headers)
        self.assertIn("content-disposition", response_headers)
        self.assertIn("content-length", response_headers)

        # Ensure no conflicting headers (transfer-encoding + content-length)
        # Having both violates HTTP spec and causes socket hangups
        if "content-length" in response_headers:
            self.assertNotIn("transfer-encoding", response_headers)
