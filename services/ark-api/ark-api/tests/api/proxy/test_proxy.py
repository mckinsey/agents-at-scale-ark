"""Tests for Proxy API."""
import json
import os
import unittest
from unittest.mock import AsyncMock, MagicMock, Mock, patch

from fastapi.testclient import TestClient

os.environ["AUTH_MODE"] = "open"

class TestA2AProxyEndpoint(unittest.TestCase):
    """Test cases for the /proxy/a2a endpoint."""

    def setUp(self):
        """Set up test client."""
        from ark_api.main import app

        self.client = TestClient(app)

    @patch("ark_api.api.v1.proxy.proxy.with_ark_client")
    @patch("ark_api.api.v1.proxy.proxy.get_headers")
    def test_proxy_a2a_server_invalid_server_no_resolved_address(self, mock_get_headers, mock_ark_client):
        """Test proxy to an A2A server without a resolved address."""
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client

        async def mock_get_headers_impl(spec, headers_dict, namespace):
            pass

        mock_get_headers.side_effect = mock_get_headers_impl

        mock_a2a_server = Mock()
        mock_a2a_server.to_dict.return_value = {
            "metadata": {"name": "invalid-server", "namespace": "default"},
            "status": {},
            "spec": {},
        }

        mock_client.a2aservers.a_get = AsyncMock(return_value=mock_a2a_server)

        response = self.client.get(
            "/v1/proxy/a2a/invalid-server?namespace=default"
        )

        self.assertEqual(response.status_code, 500)
        data = response.json()
        self.assertIn("has no resolved address", data["detail"])

    @patch("ark_api.api.v1.proxy.proxy.httpx.AsyncClient")
    @patch("ark_api.api.v1.proxy.proxy.with_ark_client")
    @patch("ark_api.api.v1.proxy.proxy.get_headers")
    def test_proxy_a2a_server_success(self, mock_get_headers, mock_ark_client, mock_httpx_client):
        """Test successful proxy to an A2A server."""
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client

        async def mock_get_headers_impl(spec, headers_dict, namespace):
            pass

        mock_get_headers.side_effect = mock_get_headers_impl

        mock_a2a_server = Mock()
        mock_a2a_server.to_dict.return_value = {
            "metadata": {"name": "test-server", "namespace": "default"},
            "status": {"lastResolvedAddress": "http://test-server:8080"},
            "spec": {},
        }

        mock_client.a2aservers.a_get = AsyncMock(return_value=mock_a2a_server)

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b'{"result": "success"}'
        mock_response.headers = {"content-type": "application/json"}

        mock_http_client = AsyncMock()
        mock_http_client.__aenter__.return_value = mock_http_client
        mock_http_client.__aexit__.return_value = None
        mock_http_client.request = AsyncMock(return_value=mock_response)
        mock_httpx_client.return_value = mock_http_client

        response = self.client.get(
            "/v1/proxy/a2a/test-server?namespace=default"
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data, {"result": "success"})


class TestMcpProxyEndpoint(unittest.TestCase):
    """Test cases for the /proxy/mcp endpoint."""

    def setUp(self):
        """Set up test client."""

        from ark_api.main import app

        self.client = TestClient(app)

        tests_dir = os.path.dirname(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        )
        samples_dir = os.path.join(tests_dir, "samples")
        self.init_req_path = os.path.join(samples_dir, "mcp_initialize_req.json")
        self.init_resp_path = os.path.join(samples_dir, "mcp_initialize_resp.json")

    def _load_json_file(self, file_path):
        """Load JSON file content."""
        with open(file_path, "r") as f:
            return json.load(f)

    @patch("ark_api.api.v1.proxy.proxy.httpx.AsyncClient")
    @patch("ark_api.utils.ark_services.get_secret")
    @patch("ark_api.api.v1.proxy.proxy.with_ark_client")
    @patch("ark_api.api.v1.proxy.proxy.get_headers")
    def test_success_initialize_req(self, mock_get_headers, mock_ark_client, mock_get_secret, mock_httpx_client):
        """Test successful MCP initialize request."""
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client

        mock_mcp_server = Mock()
        mock_mcp_server.to_dict.return_value = {
            "metadata": {"name": "test-mcp-server", "namespace": "default"},
            "status": {"resolvedAddress": "http://test-mcp-server:8080"},
            "spec": {
                "headers": [
                    {
                        "name": "Authorization",
                        "value": {
                            "valueFrom": {
                                "secretKeyRef": {
                                    "name": "mcp-secret",
                                    "key": "token"
                                }
                            }
                        }
                    }
                ]
            },
        }

        mock_client.mcpservers.a_get = AsyncMock(return_value=mock_mcp_server)

        async def mock_get_headers_impl(spec, headers_dict, namespace):
            headers_dict["Authorization"] = "Bearer test-token"

        mock_get_headers.side_effect = mock_get_headers_impl
        mock_get_secret.return_value = b"Bearer test-token"

        request_body = self._load_json_file(self.init_req_path)
        expected_response = self._load_json_file(self.init_resp_path)

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = json.dumps(expected_response).encode()
        mock_response.headers = {"content-type": "application/json"}

        mock_http_client = AsyncMock()
        mock_http_client.__aenter__.return_value = mock_http_client
        mock_http_client.__aexit__.return_value = None
        mock_http_client.request = AsyncMock(return_value=mock_response)
        mock_httpx_client.return_value = mock_http_client

        response = self.client.post(
            "/v1/proxy/mcp/test-mcp-server?namespace=default",
            json=request_body
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data, expected_response)

    @patch("ark_api.api.v1.proxy.proxy.httpx.AsyncClient")
    @patch("ark_api.utils.ark_services.get_secret")
    @patch("ark_api.api.v1.proxy.proxy.with_ark_client")
    @patch("ark_api.api.v1.proxy.proxy.get_headers")
    def test_error_unauthorized(self, mock_get_headers, mock_ark_client, mock_get_secret, mock_httpx_client):
        """Test MCP proxy returns 401 Unauthorized when no authorization header."""
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client

        mock_mcp_server = Mock()
        mock_mcp_server.to_dict.return_value = {
            "metadata": {"name": "test-mcp-server", "namespace": "default"},
            "status": {"resolvedAddress": "http://test-mcp-server:8080"},
            "spec": {},
        }

        mock_client.mcpservers.a_get = AsyncMock(return_value=mock_mcp_server)

        async def mock_get_headers_impl(spec, headers_dict, namespace):
            pass

        mock_get_headers.side_effect = mock_get_headers_impl

        request_body = self._load_json_file(self.init_req_path)

        mock_response = Mock()
        mock_response.status_code = 401
        mock_response.content = b'{"error": "Unauthorized"}'
        mock_response.headers = {"content-type": "application/json"}

        mock_http_client = AsyncMock()
        mock_http_client.__aenter__.return_value = mock_http_client
        mock_http_client.__aexit__.return_value = None
        mock_http_client.request = AsyncMock(return_value=mock_response)
        mock_httpx_client.return_value = mock_http_client

        response = self.client.post(
            "/v1/proxy/mcp/test-mcp-server?namespace=default",
            json=request_body
        )

        self.assertEqual(response.status_code, 401)
        data = response.json()
        self.assertIn("error", data)

class TestListServices(unittest.TestCase):
    """Test cases for list services endpoint."""

    def setUp(self):
        """Set up test client."""
        from ark_api.main import app
        self.client = TestClient(app)

    @patch('ark_api.api.v1.proxy.proxy.get_context')
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

