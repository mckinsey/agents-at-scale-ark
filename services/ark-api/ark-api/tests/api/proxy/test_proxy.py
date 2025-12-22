"""Tests for Proxy API."""
import json
import os
import unittest
from unittest.mock import AsyncMock, Mock, patch

from fastapi.testclient import TestClient


class TestA2AProxyEndpoint(unittest.TestCase):
    """Test cases for the /proxy/a2a endpoint."""

    def setUp(self):
        """Set up test client."""
        os.environ["AUTH_MODE"] = "open"
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
        os.environ["AUTH_MODE"] = "open"
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


