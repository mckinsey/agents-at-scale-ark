"""Tests for Proxy API."""
import json
import os
import unittest
from unittest.mock import AsyncMock, MagicMock, Mock, patch
from ark_api.api.v1.proxy.proxy import _get_a2a_server_address

from fastapi.testclient import TestClient

os.environ["AUTH_MODE"] = "open"


def _byte_stream(*chunks: bytes):
    """Build a request.stream() stand-in; AsyncMock is not an async iterator."""
    async def stream():
        for chunk in chunks:
            yield chunk
    return stream


class TestInternalProxy(unittest.TestCase):
    """Test cases for internal proxy functionality."""

    def setUp(self):
        """Set up test client."""
        from ark_api.main import app

        self.client = TestClient(app)

    @patch("ark_api.api.v1.proxy.proxy.with_ark_client")
    async def test_get_a2a_server_success(self, mock_ark_client):
        """Test getting A2A server details successfully."""
        mock_a2a_server = Mock()
        mock_a2a_server.to_dict.return_value = {
            "metadata": {"name": "test-server", "namespace": "default"},
            "status": {"lastResolvedAddress": "http://test-server:8080"},
            "spec": {},
        }

        mock_ark_client.a2aservers.a_get = AsyncMock(return_value=mock_a2a_server)

        result_url, headers = await _get_a2a_server_address("test-server")
        self.assertEqual(result_url, "http://test-server:8080")
        self.assertEqual(headers, {})


class TestProxyRequestFunction(unittest.IsolatedAsyncioTestCase):
    """Test cases for _proxy_request function."""

    @patch("ark_api.api.v1.proxy.proxy.httpx.AsyncClient")
    async def test_proxy_request_with_body_and_params(self, mock_httpx_client):
        """Test _proxy_request with request body and query params."""
        from ark_api.api.v1.proxy.proxy import _proxy_request
        from fastapi import Request

        mock_request = AsyncMock(spec=Request)
        mock_request.method = "POST"
        mock_request.headers = {"content-type": "application/json", "user-agent": "test"}
        mock_request.query_params = {"key": "value", "foo": "bar"}
        mock_request.body = AsyncMock(return_value=b'{"data": "test"}')

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b'{"result": "success"}'
        mock_response.headers = {"content-type": "application/json"}

        mock_http_client = AsyncMock()
        mock_http_client.__aenter__.return_value = mock_http_client
        mock_http_client.__aexit__.return_value = None
        mock_http_client.request = AsyncMock(return_value=mock_response)
        mock_httpx_client.return_value = mock_http_client

        result = await _proxy_request("http://test-service:8080/api", mock_request, {"X-Custom": "header"})

        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.body, b'{"result": "success"}')

        mock_http_client.request.assert_called_once()
        call_args = mock_http_client.request.call_args
        self.assertEqual(call_args.kwargs["method"], "POST")
        self.assertEqual(call_args.kwargs["url"], "http://test-service:8080/api")
        self.assertIn("X-Custom", call_args.kwargs["headers"])
        self.assertEqual(call_args.kwargs["headers"]["X-Custom"], "header")
        self.assertEqual(call_args.kwargs["content"], b'{"data": "test"}')
        self.assertEqual(call_args.kwargs["params"], {"key": "value", "foo": "bar"})

    @patch("ark_api.api.v1.proxy.proxy.httpx.AsyncClient")
    async def test_proxy_request_without_body(self, mock_httpx_client):
        """Test _proxy_request without request body."""
        from ark_api.api.v1.proxy.proxy import _proxy_request
        from fastapi import Request

        mock_request = AsyncMock(spec=Request)
        mock_request.method = "GET"
        mock_request.headers = {"accept": "application/json"}
        mock_request.query_params = {}
        mock_request.body = AsyncMock(return_value=b'')

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b'{"status": "ok"}'
        mock_response.headers = {"content-type": "application/json"}

        mock_http_client = AsyncMock()
        mock_http_client.__aenter__.return_value = mock_http_client
        mock_http_client.__aexit__.return_value = None
        mock_http_client.request = AsyncMock(return_value=mock_response)
        mock_httpx_client.return_value = mock_http_client

        result = await _proxy_request("http://test-service:8080", mock_request)

        self.assertEqual(result.status_code, 200)

        mock_http_client.request.assert_called_once()
        call_args = mock_http_client.request.call_args
        self.assertEqual(call_args.kwargs["method"], "GET")
        self.assertIsNone(call_args.kwargs["content"])

    @patch("ark_api.api.v1.proxy.proxy.httpx.AsyncClient")
    async def test_proxy_request_drops_decoded_encoding_and_length(self, mock_httpx_client):
        """httpx decodes the body, so the upstream encoding and length must not be forwarded."""
        from ark_api.api.v1.proxy.proxy import _proxy_request
        from fastapi import Request

        decoded = b'{"result": "success"}' * 20

        mock_request = AsyncMock(spec=Request)
        mock_request.method = "GET"
        mock_request.headers = {"accept-encoding": "gzip"}
        mock_request.query_params = {}
        mock_request.body = AsyncMock(return_value=b'')

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = decoded
        mock_response.headers = {
            "content-type": "application/json",
            "content-encoding": "gzip",
            "content-length": "42",
        }

        mock_http_client = AsyncMock()
        mock_http_client.__aenter__.return_value = mock_http_client
        mock_http_client.__aexit__.return_value = None
        mock_http_client.request = AsyncMock(return_value=mock_response)
        mock_httpx_client.return_value = mock_http_client

        result = await _proxy_request("http://test-service:8080", mock_request)

        self.assertNotIn("content-encoding", result.headers)
        self.assertEqual(result.headers["content-length"], str(len(decoded)))
        self.assertEqual(result.headers["content-type"], "application/json")

    @patch("ark_api.api.v1.proxy.proxy.httpx.AsyncClient")
    async def test_proxy_request_upload_forwards_sanitized_body_without_stale_length(
        self, mock_httpx_client
    ):
        """Sanitizing changes the body length; httpx must derive content-length from it."""
        from ark_api.api.v1.proxy.proxy import _proxy_request
        from fastapi import Request

        boundary = "X"
        svg = (
            b'<svg xmlns="http://www.w3.org/2000/svg">'
            b"<script>alert(1)</script><path d=\"M0 0h1v1H0z\"/>"
            b"</svg>"
        )
        original = (
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="file"; filename="icon.svg"\r\n'
            "Content-Type: image/svg+xml\r\n\r\n"
        ).encode() + svg + f"\r\n--{boundary}--\r\n".encode()

        mock_request = AsyncMock(spec=Request)
        mock_request.method = "POST"
        mock_request.headers = {
            "content-type": f"multipart/form-data; boundary={boundary}",
            "content-length": str(len(original)),
        }
        mock_request.query_params = {}
        mock_request.body = AsyncMock(return_value=original)
        mock_request.stream = _byte_stream(original)

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b"{}"
        mock_response.headers = {"content-type": "application/json"}

        mock_http_client = AsyncMock()
        mock_http_client.__aenter__.return_value = mock_http_client
        mock_http_client.__aexit__.return_value = None
        mock_http_client.request = AsyncMock(return_value=mock_response)
        mock_httpx_client.return_value = mock_http_client

        await _proxy_request(
            "http://file-gateway:8080",
            mock_request,
            file_gateway_server="file-gateway",
            file_gateway_path="files",
        )

        call_args = mock_http_client.request.call_args
        sent_body = call_args.kwargs["content"]
        self.assertNotIn(b"<script", sent_body)
        self.assertNotEqual(sent_body, original)
        # The stale incoming length must not be forwarded; httpx sets it from content=.
        self.assertNotIn("content-length", {k.lower() for k in call_args.kwargs["headers"]})

    def _upload_request(self, body: bytes, declared_length=None, chunks=None):
        from fastapi import Request

        mock_request = AsyncMock(spec=Request)
        mock_request.method = "POST"
        headers = {"content-type": "multipart/form-data; boundary=B"}
        if declared_length is not None:
            headers["content-length"] = str(declared_length)
        mock_request.headers = headers
        mock_request.query_params = {}
        mock_request.body = AsyncMock(return_value=body)
        mock_request.stream = Mock(
            side_effect=_byte_stream(*(chunks if chunks is not None else [body]))
        )
        return mock_request

    @patch("ark_api.api.v1.proxy.proxy.httpx.AsyncClient")
    async def test_upload_over_limit_rejected_before_reading_body(self, mock_httpx_client):
        """An honest oversized Content-Length is refused without buffering or forwarding."""
        from fastapi import HTTPException
        from ark_api.api.v1.proxy.proxy import PROXY_MAX_UPLOAD_BYTES, _proxy_request

        oversized = PROXY_MAX_UPLOAD_BYTES + 1
        mock_request = self._upload_request(b"", declared_length=oversized)

        with self.assertRaises(HTTPException) as ctx:
            await _proxy_request(
                "http://file-gateway:8080",
                mock_request,
                file_gateway_server="file-gateway",
                file_gateway_path="files",
            )

        self.assertEqual(ctx.exception.status_code, 413)
        mock_request.stream.assert_not_called()
        mock_httpx_client.assert_not_called()

    @patch("ark_api.api.v1.proxy.proxy.httpx.AsyncClient")
    async def test_upload_over_limit_rejected_when_header_understates(self, mock_httpx_client):
        """A chunked or lying Content-Length is caught by the running total instead."""
        from fastapi import HTTPException
        from ark_api.api.v1.proxy.proxy import PROXY_MAX_UPLOAD_BYTES, _proxy_request

        chunk = b"a" * 64_000
        chunks = [chunk] * ((PROXY_MAX_UPLOAD_BYTES // len(chunk)) + 2)
        mock_request = self._upload_request(b"", chunks=chunks)

        with self.assertRaises(HTTPException) as ctx:
            await _proxy_request(
                "http://file-gateway:8080",
                mock_request,
                file_gateway_server="file-gateway",
                file_gateway_path="files",
            )

        self.assertEqual(ctx.exception.status_code, 413)
        mock_httpx_client.assert_not_called()

    @patch("ark_api.api.v1.proxy.proxy.httpx.AsyncClient")
    async def test_upload_within_limit_is_forwarded(self, mock_httpx_client):
        """The cap must not disturb a normal upload."""
        from ark_api.api.v1.proxy.proxy import _proxy_request

        body = (
            b'--B\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\n\r\n'
            b"\x89PNG\r\n\x1a\n\r\n--B--\r\n"
        )
        mock_request = self._upload_request(body, declared_length=len(body))

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b"{}"
        mock_response.headers = {"content-type": "application/json"}

        mock_http_client = AsyncMock()
        mock_http_client.__aenter__.return_value = mock_http_client
        mock_http_client.__aexit__.return_value = None
        mock_http_client.request = AsyncMock(return_value=mock_response)
        mock_httpx_client.return_value = mock_http_client

        result = await _proxy_request(
            "http://file-gateway:8080",
            mock_request,
            file_gateway_server="file-gateway",
            file_gateway_path="files",
        )

        self.assertEqual(result.status_code, 200)
        self.assertEqual(mock_http_client.request.call_args.kwargs["content"], body)

    @patch("ark_api.api.v1.proxy.proxy.httpx.AsyncClient")
    async def test_non_upload_traffic_is_not_capped(self, mock_httpx_client):
        """A2A and MCP payloads must stay unbounded; only file-gateway uploads are capped."""
        from fastapi import Request
        from ark_api.api.v1.proxy.proxy import PROXY_MAX_UPLOAD_BYTES, _proxy_request

        big = b"x" * (PROXY_MAX_UPLOAD_BYTES + 1024)
        mock_request = AsyncMock(spec=Request)
        mock_request.method = "POST"
        mock_request.headers = {
            "content-type": "application/json",
            "content-length": str(len(big)),
        }
        mock_request.query_params = {}
        mock_request.body = AsyncMock(return_value=big)

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b"{}"
        mock_response.headers = {"content-type": "application/json"}

        mock_http_client = AsyncMock()
        mock_http_client.__aenter__.return_value = mock_http_client
        mock_http_client.__aexit__.return_value = None
        mock_http_client.request = AsyncMock(return_value=mock_response)
        mock_httpx_client.return_value = mock_http_client

        result = await _proxy_request("http://a2a-server:8080", mock_request)

        self.assertEqual(result.status_code, 200)
        self.assertEqual(mock_http_client.request.call_args.kwargs["content"], big)

    @patch("ark_api.api.v1.proxy.proxy.httpx.AsyncClient")
    async def test_disguised_upload_rejected_with_400(self, mock_httpx_client):
        """HTML stored under a .png name never reaches the file gateway."""
        from fastapi import HTTPException
        from ark_api.api.v1.proxy.proxy import _proxy_request

        body = (
            b'--B\r\nContent-Disposition: form-data; name="file"; filename="report.png"\r\n'
            b"Content-Type: image/png\r\n\r\n"
            b"<html><script>alert(document.domain)</script></html>\r\n--B--\r\n"
        )
        mock_request = self._upload_request(body, declared_length=len(body))

        with self.assertRaises(HTTPException) as ctx:
            await _proxy_request(
                "http://file-gateway:8080",
                mock_request,
                file_gateway_server="file-gateway",
                file_gateway_path="files",
            )

        self.assertEqual(ctx.exception.status_code, 400)
        mock_httpx_client.assert_not_called()

    @patch("ark_api.api.v1.proxy.proxy.httpx.AsyncClient")
    async def test_proxy_request_forwards_request_content_encoding(self, mock_httpx_client):
        """The request body is passed through as-is, so its encoding header must survive."""
        from ark_api.api.v1.proxy.proxy import _proxy_request
        from fastapi import Request

        mock_request = AsyncMock(spec=Request)
        mock_request.method = "POST"
        mock_request.headers = {
            "content-type": "application/octet-stream",
            "content-encoding": "gzip",
        }
        mock_request.query_params = {}
        mock_request.body = AsyncMock(return_value=b"\x1f\x8b compressed")

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b"{}"
        mock_response.headers = {"content-type": "application/json"}

        mock_http_client = AsyncMock()
        mock_http_client.__aenter__.return_value = mock_http_client
        mock_http_client.__aexit__.return_value = None
        mock_http_client.request = AsyncMock(return_value=mock_response)
        mock_httpx_client.return_value = mock_http_client

        await _proxy_request("http://test-service:8080", mock_request)

        sent_headers = mock_http_client.request.call_args.kwargs["headers"]
        self.assertEqual(sent_headers.get("content-encoding"), "gzip")


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

        async def mock_get_headers_impl(spec, headers_dict, namespace, impersonation=None):
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

        async def mock_get_headers_impl(spec, headers_dict, namespace, impersonation=None):
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

    @patch("ark_api.api.v1.proxy.proxy.with_ark_client")
    @patch("ark_api.api.v1.proxy.proxy.get_headers")
    def test_unknown_a2a_server(self, mock_get_headers, mock_ark_client):
        """Test proxy returns 400 when A2A server does not exist."""
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client

        mock_client.a2aservers.a_get = AsyncMock(side_effect=Exception("NotFound"))

        response = self.client.get(
            "/v1/proxy/a2a/nonexistent?namespace=default"
        )

        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn("Invalid resource a2a", data["detail"])

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

        async def mock_get_headers_impl(spec, headers_dict, namespace, impersonation=None):
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

        async def mock_get_headers_impl(spec, headers_dict, namespace, impersonation=None):
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
    
    @patch("ark_api.api.v1.proxy.proxy.with_ark_client")
    @patch("ark_api.api.v1.proxy.proxy.get_headers")
    def test_unknown_mcp_server(self, mock_get_headers, mock_ark_client):
        """Test proxy returns 400 when MCP server does not exist."""
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client

        mock_client.mcpservers.a_get = AsyncMock(side_effect=Exception("NotFound"))

        response = self.client.get(
            "/v1/proxy/mcp/nonexistent?namespace=default"
        )

        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn("Invalid resource mcp", data["detail"])
    
    @patch("ark_api.api.v1.proxy.proxy.with_ark_client")
    @patch("ark_api.api.v1.proxy.proxy.get_headers")
    def test_proxy_mcp_server_invalid_server_no_resolved_address(self, mock_get_headers, mock_ark_client):
        """Test proxy to an MCP server without a resolved address."""
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client

        async def mock_get_headers_impl(spec, headers_dict, namespace, impersonation=None):
            pass

        mock_get_headers.side_effect = mock_get_headers_impl

        mock_a2a_server = Mock()
        mock_a2a_server.to_dict.return_value = {
            "metadata": {"name": "invalid-server", "namespace": "default"},
            "status": {},
            "spec": {},
        }

        mock_client.mcpservers.a_get = AsyncMock(return_value=mock_a2a_server)

        response = self.client.get(
            "/v1/proxy/mcp/invalid-server?namespace=default"
        )

        self.assertEqual(response.status_code, 500)
        data = response.json()
        self.assertIn("has no resolved address", data["detail"])

class TestUnknownResourceProxyEndpoint(unittest.TestCase):
    """Test cases for unknown resource proxying."""

    def setUp(self):
        """Set up test client."""
        from ark_api.main import app
        self.client = TestClient(app)

    def test_invalid_resource_returns_400(self):
        """Requests to invalid resource types should return 400 from proxy."""
        response = self.client.get("/v1/proxy/unknown/resource")
        self.assertEqual(response.status_code, 422)
      
    
    def test_invalid_resource_path_returns_400(self):
        """Requests to invalid resource types should return 400 from proxy."""
        response = self.client.get("/v1/proxy/unknown/resource/path")
        self.assertEqual(response.status_code, 422)

class TestListServices(unittest.TestCase):
    """Test cases for list services endpoint."""

    def setUp(self):
        """Set up test client."""
        from ark_api.main import app
        self.client = TestClient(app)

    @patch('ark_api.api.v1.proxy.proxy.get_context')
    @patch('ark_api.api.v1.client_utils.create_api_client')
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
    
    @patch('ark_api.api.v1.client_utils.create_api_client')
    def test_list_services_success_with_namespace(self, mock_api_client):
        """Test listing available services."""

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
            response = self.client.get("/v1/proxy/services?namespace=dev")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("services", data)
        self.assertEqual(data["services"], ["file-gateway-api", "other-service"])

class TestServicesProxyEndpoint(unittest.TestCase):
    """Test cases for proxy endpoint."""

    def setUp(self):
        """Set up test client."""
        from ark_api.main import app
        self.client = TestClient(app)

    def _upload(self, filename, content, content_type="application/octet-stream"):
        """POST a real multipart upload through the ASGI stack."""
        with self._mock_service_lookup():
            return self.client.post(
                "/v1/proxy/services/file-gateway-api/files",
                files={"file": (filename, content, content_type)},
                data={"prefix": "uploads"},
            )

    @patch('httpx.AsyncClient.request')
    def test_upload_route_rejects_oversized_file(self, mock_request):
        """Exercises the real request.stream() read, not a mock."""
        from ark_api.api.v1.proxy.proxy import PROXY_MAX_UPLOAD_BYTES

        response = self._upload("big.bin", b"a" * (PROXY_MAX_UPLOAD_BYTES + 1))

        self.assertEqual(response.status_code, 413)
        self.assertIn("exceeds the maximum", response.json()["detail"])
        mock_request.assert_not_called()

    @patch('httpx.AsyncClient.request')
    def test_upload_route_rejects_html_disguised_as_png(self, mock_request):
        response = self._upload(
            "report.png",
            b"<html><script>alert(document.domain)</script></html>",
            "image/png",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("content is html", response.json()["detail"])
        mock_request.assert_not_called()

    @patch('httpx.AsyncClient.request')
    def test_upload_route_forwards_normal_file(self, mock_request):
        """A well-formed upload still reaches the gateway with its bytes intact."""
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.headers = {"content-type": "application/json"}
        mock_response.content = b'{"ok": true}'
        mock_request.return_value = mock_response

        png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
        response = self._upload("photo.png", png, "image/png")

        self.assertEqual(response.status_code, 200)
        mock_request.assert_called_once()
        self.assertIn(png, mock_request.call_args.kwargs["content"])

    @patch('httpx.AsyncClient.request')
    def test_proxy_get_request_success(self, mock_request):
        """Test successful GET request proxying."""
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.headers = {"content-type": "application/json"}
        mock_response.json.return_value = {"files": [{"name": "test.txt"}]}
        mock_response.content = b'{"files": [{"name": "test.txt"}]}'
        mock_request.return_value = mock_response

        with self._mock_service_lookup():
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

        with self._mock_service_lookup():
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

        with self._mock_service_lookup():
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

        with self._mock_service_lookup():
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

        with self._mock_service_lookup():
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

    @patch('httpx.AsyncClient.request')
    def test_proxy_sanitizes_malicious_svg_download(self, mock_request):
        """SVG downloads are sanitized and served with attachment disposition."""
        malicious_svg = (
            b'<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" '
            b'onload="alert(1)"><script>alert(1)</script></svg>'
        )
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.headers = {
            "content-type": "image/svg+xml",
            "content-length": str(len(malicious_svg)),
        }
        mock_response.content = malicious_svg
        mock_request.return_value = mock_response

        with self._mock_service_lookup():
            response = self.client.get(
                "/v1/proxy/services/file-gateway-api/files/payload.svg/download"
            )

        self.assertEqual(response.status_code, 200)
        self.assertNotIn(b"<script", response.content.lower())
        self.assertIn("attachment;", response.headers.get("content-disposition", ""))
        self.assertIn("script-src 'none'", response.headers.get("content-security-policy", ""))

    @patch('httpx.AsyncClient.request')
    def test_proxy_svg_download_preserves_error_status(self, mock_request):
        """A JSON error for a .svg path is passed through, not parsed as SVG."""
        error_body = b'{"detail":"File not found: missing.svg"}'
        mock_response = AsyncMock()
        mock_response.status_code = 404
        mock_response.headers = {"content-type": "application/json"}
        mock_response.content = error_body
        mock_request.return_value = mock_response

        with self._mock_service_lookup():
            response = self.client.get(
                "/v1/proxy/services/file-gateway-api/files/missing.svg/download"
            )

        # Sanitizing the JSON body would surface a 400 and hide the real status.
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.content, error_body)

    @patch('httpx.AsyncClient.request')
    def test_proxy_delete_request_success(self, mock_request):
        """Test DELETE request proxying to a service."""
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.headers = {"content-type": "application/json"}
        mock_response.content = b'{}'
        mock_request.return_value = mock_response

        with self._mock_service_lookup():
            response = self.client.delete("/v1/proxy/services/file-gateway/files/test.txt?namespace=default")

        self.assertEqual(response.status_code, 200)
        mock_request.assert_called_once()
        call_args = mock_request.call_args
        self.assertEqual(call_args.kwargs["method"], "DELETE")
        self.assertIn("http://file-gateway.default.svc.cluster.local/files/test.txt", call_args.kwargs["url"])

    def _mock_service_lookup(self):
        mock_v1 = MagicMock()
        mock_v1.read_namespaced_service = AsyncMock(return_value=MagicMock())

        mock_client_instance = MagicMock()
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=None)

        api_client_patch = patch('ark_api.api.v1.client_utils.create_api_client', return_value=mock_client_instance)
        core_v1_patch = patch('ark_api.api.v1.proxy.proxy.client.CoreV1Api', return_value=mock_v1)

        class _Both:
            def __enter__(self_inner):
                api_client_patch.__enter__()
                core_v1_patch.__enter__()
                return self_inner

            def __exit__(self_inner, *args):
                core_v1_patch.__exit__(*args)
                api_client_patch.__exit__(*args)
                return False

        return _Both()

    @patch('httpx.AsyncClient.request')
    def test_proxy_services_returns_403_when_service_read_forbidden(self, mock_request):
        """Service lookup failures must block the forward entirely."""
        from kubernetes_asyncio.client.rest import ApiException

        mock_v1 = MagicMock()
        mock_v1.read_namespaced_service = AsyncMock(side_effect=ApiException(status=403, reason="Forbidden"))

        mock_client_instance = MagicMock()
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=None)

        # Pin the env this test assumes: with IMPERSONATION_ENABLED+FALLBACK the
        # decorator retries as the service account and the mock's 403 becomes a 500.
        with patch.dict(os.environ, {"IMPERSONATION_ENABLED": "false", "IMPERSONATION_FALLBACK": "false"}), \
             patch('ark_api.api.v1.client_utils.create_api_client', return_value=mock_client_instance), \
             patch('ark_api.api.v1.proxy.proxy.client.CoreV1Api', return_value=mock_v1):
            response = self.client.delete("/v1/proxy/services/file-gateway/files/test.txt?namespace=default")

        self.assertEqual(response.status_code, 403)
        mock_request.assert_not_called()

    @patch('httpx.AsyncClient.request')
    def test_proxy_get_and_post_return_403_when_service_read_forbidden(self, mock_request):
        """GET/POST forwards must be gated by the same impersonated service read as DELETE/PATCH/HEAD."""
        from kubernetes_asyncio.client.rest import ApiException

        mock_v1 = MagicMock()
        mock_v1.read_namespaced_service = AsyncMock(side_effect=ApiException(status=403, reason="Forbidden"))

        mock_client_instance = MagicMock()
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=None)

        with patch.dict(os.environ, {"IMPERSONATION_ENABLED": "false", "IMPERSONATION_FALLBACK": "false"}), \
             patch('ark_api.api.v1.client_utils.create_api_client', return_value=mock_client_instance), \
             patch('ark_api.api.v1.proxy.proxy.client.CoreV1Api', return_value=mock_v1):
            get_response = self.client.get("/v1/proxy/services/file-gateway/files/test.txt?namespace=default")
            post_response = self.client.post("/v1/proxy/services/file-gateway/files?namespace=default", json={})
            no_path_response = self.client.get("/v1/proxy/services/file-gateway?namespace=default")

        self.assertEqual(get_response.status_code, 403)
        self.assertEqual(post_response.status_code, 403)
        self.assertEqual(no_path_response.status_code, 403)
        mock_request.assert_not_called()

    @patch('httpx.AsyncClient.request')
    @patch('ark_api.api.v1.proxy.proxy.get_context')
    def test_proxy_services_defaults_namespace_from_context(self, mock_get_context, mock_request):
        """When no namespace is supplied, the current context namespace is used."""
        mock_get_context.return_value = {"namespace": "ctx-ns"}
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.headers = {"content-type": "application/json"}
        mock_response.content = b'{}'
        mock_request.return_value = mock_response

        with self._mock_service_lookup():
            response = self.client.delete("/v1/proxy/services/file-gateway/files/test.txt")

        self.assertEqual(response.status_code, 200)
        mock_get_context.assert_called_once()
        call_args = mock_request.call_args
        self.assertIn("http://file-gateway.ctx-ns.svc.cluster.local/files/test.txt", call_args.kwargs["url"])

    @patch('httpx.AsyncClient.request')
    def test_proxy_patch_request_success(self, mock_request):
        """Test PATCH request proxying to a service."""
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.headers = {"content-type": "application/json"}
        mock_response.content = b'{}'
        mock_request.return_value = mock_response

        with self._mock_service_lookup():
            response = self.client.patch("/v1/proxy/services/file-gateway/files/test.txt?namespace=default")

        self.assertEqual(response.status_code, 200)
        mock_request.assert_called_once()
        call_args = mock_request.call_args
        self.assertEqual(call_args.kwargs["method"], "PATCH")
        self.assertIn("http://file-gateway.default.svc.cluster.local/files/test.txt", call_args.kwargs["url"])

    @patch('httpx.AsyncClient.request')
    def test_proxy_head_request_success(self, mock_request):
        """Test HEAD request proxying to a service."""
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.headers = {"content-type": "application/json"}
        mock_response.content = b''
        mock_request.return_value = mock_response

        with self._mock_service_lookup():
            response = self.client.head("/v1/proxy/services/file-gateway/files/test.txt?namespace=default")

        self.assertEqual(response.status_code, 200)
        mock_request.assert_called_once()
        call_args = mock_request.call_args
        self.assertEqual(call_args.kwargs["method"], "HEAD")
        self.assertIn("http://file-gateway.default.svc.cluster.local/files/test.txt", call_args.kwargs["url"]) 

    def test_invalid_resource_returns_422(self):
        """Requests to invalid resource types should return 422 from FastAPI."""
        response = self.client.get("/v1/proxy/invalid/file-gateway")
        self.assertEqual(response.status_code, 422)

    @patch("ark_api.api.v1.proxy.proxy.with_ark_client")
    @patch("ark_api.api.v1.proxy.proxy.get_headers")
    def test_proxy_mcp_server_invalid_server_no_resolved_address(self, mock_get_headers, mock_ark_client):
        """Test proxy to an MCP server without a resolved address."""
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client

        async def mock_get_headers_impl(spec, headers_dict, namespace, impersonation=None):
            pass

        mock_get_headers.side_effect = mock_get_headers_impl

        mock_mcp_server = Mock()
        mock_mcp_server.to_dict.return_value = {
            "metadata": {"name": "invalid-mcp", "namespace": "default"},
            "status": {},
            "spec": {},
        }

        mock_client.mcpservers.a_get = AsyncMock(return_value=mock_mcp_server)

        response = self.client.get(
            "/v1/proxy/mcp/invalid-mcp?namespace=default"
        )

        self.assertEqual(response.status_code, 500)
        data = response.json()
        self.assertIn("has no resolved address", data["detail"])

    @patch('ark_api.api.v1.proxy.proxy.get_context')
    @patch('ark_api.api.v1.proxy.proxy.httpx.AsyncClient')
    def test_proxy_services_no_path(self, mock_httpx_client, mock_get_context):
        """Test proxying when no additional path is provided (services resource)."""
        mock_get_context.return_value = {"namespace": "default"}
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b'{"status": "ok"}'
        mock_response.headers = {"content-type": "application/json"}

        mock_http_client = AsyncMock()
        mock_http_client.__aenter__.return_value = mock_http_client
        mock_http_client.__aexit__.return_value = None
        mock_http_client.request = AsyncMock(return_value=mock_response)
        mock_httpx_client.return_value = mock_http_client

        with self._mock_service_lookup():
            response = self.client.get("/v1/proxy/services/file-gateway")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data, {"status": "ok"})

        mock_http_client.request.assert_called_once()
        call_args = mock_http_client.request.call_args
        self.assertEqual(call_args.kwargs["method"], "GET")
        self.assertIn("http://file-gateway.default.svc.cluster.local", call_args.kwargs["url"])

    @patch('ark_api.api.v1.proxy.proxy.httpx.AsyncClient')
    def test_proxy_services_with_namespace(self, mock_httpx_client):
        """Test proxying to a service in a specific namespace."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b'{"files": []}'
        mock_response.headers = {"content-type": "application/json"}

        mock_http_client = AsyncMock()
        mock_http_client.__aenter__.return_value = mock_http_client
        mock_http_client.__aexit__.return_value = None
        mock_http_client.request = AsyncMock(return_value=mock_response)
        mock_httpx_client.return_value = mock_http_client

        with self._mock_service_lookup():
            response = self.client.get("/v1/proxy/services/file-gateway-api/files?namespace=kyc-onboarding-demo")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data, {"files": []})

        mock_http_client.request.assert_called_once()
        call_args = mock_http_client.request.call_args
        self.assertEqual(call_args.kwargs["method"], "GET")
        self.assertIn("http://file-gateway-api.kyc-onboarding-demo.svc.cluster.local/files", call_args.kwargs["url"])

    @patch("ark_api.api.v1.proxy.proxy.httpx.AsyncClient")
    @patch("ark_api.api.v1.proxy.proxy.with_ark_client")
    @patch("ark_api.api.v1.proxy.proxy.get_headers")
    def test_proxy_a2a_server_path_trailing_slash(self, mock_get_headers, mock_ark_client, mock_httpx_client):
        """Test A2A proxying with a server whose resolved address ends with a slash."""
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client

        async def mock_get_headers_impl(spec, headers_dict, namespace, impersonation=None):
            pass

        mock_get_headers.side_effect = mock_get_headers_impl

        mock_a2a_server = Mock()
        mock_a2a_server.to_dict.return_value = {
            "metadata": {"name": "test-server", "namespace": "default"},
            "status": {"lastResolvedAddress": "http://test-server:8080/"},
            "spec": {},
        }

        mock_client.a2aservers.a_get = AsyncMock(return_value=mock_a2a_server)

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b'{"result": "path-success"}'
        mock_response.headers = {"content-type": "application/json"}

        mock_http_client = AsyncMock()
        mock_http_client.__aenter__.return_value = mock_http_client
        mock_http_client.__aexit__.return_value = None
        mock_http_client.request = AsyncMock(return_value=mock_response)
        mock_httpx_client.return_value = mock_http_client

        response = self.client.get(
            "/v1/proxy/a2a/test-server/some/path?namespace=default"
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data, {"result": "path-success"})

        mock_http_client.request.assert_called_once()
        call_args = mock_http_client.request.call_args
        self.assertEqual(call_args.kwargs["method"], "GET")
        self.assertIn("http://test-server:8080/some/path", call_args.kwargs["url"])

    @patch("ark_api.api.v1.proxy.proxy.with_ark_client")
    @patch("ark_api.api.v1.proxy.proxy.get_headers")
    def test_proxy_mcp_server_path_invalid_resolved_address(self, mock_get_headers, mock_ark_client):
        """Test MCP path proxy returns 500 when resolvedAddress is missing."""
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client

        async def mock_get_headers_impl(spec, headers_dict, namespace, impersonation=None):
            pass

        mock_get_headers.side_effect = mock_get_headers_impl

        mock_mcp_server = Mock()
        mock_mcp_server.to_dict.return_value = {
            "metadata": {"name": "invalid-mcp", "namespace": "default"},
            "status": {},
            "spec": {},
        }

        mock_client.mcpservers.a_get = AsyncMock(return_value=mock_mcp_server)

        response = self.client.get(
            "/v1/proxy/mcp/invalid-mcp/some/path?namespace=default"
        )

        self.assertEqual(response.status_code, 500)
        data = response.json()
        self.assertIn("has no resolved address", data["detail"])

    @patch("ark_api.api.v1.proxy.proxy.httpx.AsyncClient")
    @patch("ark_api.api.v1.proxy.proxy.with_ark_client")
    @patch("ark_api.api.v1.proxy.proxy.get_headers")
    def test_proxy_mcp_server_with_path_success(self, mock_get_headers, mock_ark_client, mock_httpx_client):
        """Test MCP proxying with a path successfully."""
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client

        async def mock_get_headers_impl(spec, headers_dict, namespace, impersonation=None):
            pass

        mock_get_headers.side_effect = mock_get_headers_impl

        mock_mcp_server = Mock()
        mock_mcp_server.to_dict.return_value = {
            "metadata": {"name": "test-mcp", "namespace": "default"},
            "status": {"resolvedAddress": "http://test-mcp:8080"},
            "spec": {},
        }

        mock_client.mcpservers.a_get = AsyncMock(return_value=mock_mcp_server)

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b'{"tools": []}'
        mock_response.headers = {"content-type": "application/json"}

        mock_http_client = AsyncMock()
        mock_http_client.__aenter__.return_value = mock_http_client
        mock_http_client.__aexit__.return_value = None
        mock_http_client.request = AsyncMock(return_value=mock_response)
        mock_httpx_client.return_value = mock_http_client

        response = self.client.post(
            "/v1/proxy/mcp/test-mcp/tools/list?namespace=default",
            json={"method": "tools/list"}
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data, {"tools": []})

        mock_http_client.request.assert_called_once()
        call_args = mock_http_client.request.call_args
        self.assertEqual(call_args.kwargs["method"], "POST")
        self.assertIn("http://test-mcp:8080/tools/list", call_args.kwargs["url"])

    @patch('ark_api.api.v1.proxy.proxy.get_context')
    @patch("ark_api.api.v1.proxy.proxy.httpx.AsyncClient")
    def test_proxy_services_resource_without_path(self, mock_httpx_client, mock_get_context):
        """Test proxying to services resource without additional path."""
        mock_get_context.return_value = {"namespace": "default"}
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b'{"status": "healthy"}'
        mock_response.headers = {"content-type": "application/json"}

        mock_http_client = AsyncMock()
        mock_http_client.__aenter__.return_value = mock_http_client
        mock_http_client.__aexit__.return_value = None
        mock_http_client.request = AsyncMock(return_value=mock_response)
        mock_httpx_client.return_value = mock_http_client

        with self._mock_service_lookup():
            response = self.client.get("/v1/proxy/services/my-service")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data, {"status": "healthy"})

        mock_http_client.request.assert_called_once()
        call_args = mock_http_client.request.call_args
        self.assertEqual(call_args.kwargs["method"], "GET")
        self.assertIn("http://my-service", call_args.kwargs["url"])

    @patch('ark_api.api.v1.proxy.proxy.get_context')
    @patch("ark_api.api.v1.proxy.proxy.httpx.AsyncClient")
    def test_proxy_services_resource_with_path(self, mock_httpx_client, mock_get_context):
        """Test proxying to services resource with path."""
        mock_get_context.return_value = {"namespace": "default"}
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b'{"data": "test"}'
        mock_response.headers = {"content-type": "application/json"}

        mock_http_client = AsyncMock()
        mock_http_client.__aenter__.return_value = mock_http_client
        mock_http_client.__aexit__.return_value = None
        mock_http_client.request = AsyncMock(return_value=mock_response)
        mock_httpx_client.return_value = mock_http_client

        with self._mock_service_lookup():
            response = self.client.get("/v1/proxy/services/my-service/api/v1/data")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data, {"data": "test"})

        mock_http_client.request.assert_called_once()
        call_args = mock_http_client.request.call_args
        self.assertEqual(call_args.kwargs["method"], "GET")
        self.assertIn("my-service", call_args.kwargs["url"])
        self.assertIn("/api/v1/data", call_args.kwargs["url"])

