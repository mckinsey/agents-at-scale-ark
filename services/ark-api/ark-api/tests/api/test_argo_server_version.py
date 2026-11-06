"""Tests for Argo Server version detection and support checking."""
import unittest
from unittest.mock import patch

import httpx

from ark_api.api.v1 import argo_server

ARGO_URL = "http://argo-server.test:2746"
REAL_ASYNC_CLIENT = httpx.AsyncClient


def argo_client_factory(handler):
    def factory(**kwargs):
        return REAL_ASYNC_CLIENT(transport=httpx.MockTransport(handler), **kwargs)
    return factory


def version_handler(version, status_code=200):
    def handler(request):
        return httpx.Response(status_code, json={"version": version})
    return handler


class TestGetArgoServerVersion(unittest.IsolatedAsyncioTestCase):
    async def test_returns_version_string_from_argo_server(self):
        with patch("ark_api.api.v1.argo_server.httpx.AsyncClient", argo_client_factory(version_handler("v4.1.0"))):
            version = await argo_server.get_argo_server_version(ARGO_URL)

        self.assertEqual(version, "v4.1.0")

    async def test_requests_the_version_endpoint(self):
        requests = []

        def handler(request):
            requests.append(request)
            return httpx.Response(200, json={"version": "v4.1.0"})

        with patch("ark_api.api.v1.argo_server.httpx.AsyncClient", argo_client_factory(handler)):
            await argo_server.get_argo_server_version(ARGO_URL)

        self.assertEqual(requests[0].url.path, "/api/v1/version")

    async def test_returns_none_when_argo_server_unreachable(self):
        def handler(request):
            raise httpx.ConnectError("connection refused", request=request)

        with patch("ark_api.api.v1.argo_server.httpx.AsyncClient", argo_client_factory(handler)):
            version = await argo_server.get_argo_server_version(ARGO_URL)

        self.assertIsNone(version)

    async def test_returns_none_on_http_error_status(self):
        with patch("ark_api.api.v1.argo_server.httpx.AsyncClient", argo_client_factory(version_handler("", status_code=503))):
            version = await argo_server.get_argo_server_version(ARGO_URL)

        self.assertIsNone(version)

    async def test_returns_none_on_malformed_response(self):
        def handler(request):
            return httpx.Response(200, content=b"not json")

        with patch("ark_api.api.v1.argo_server.httpx.AsyncClient", argo_client_factory(handler)):
            version = await argo_server.get_argo_server_version(ARGO_URL)

        self.assertIsNone(version)


class TestIsVersionSupported(unittest.TestCase):
    def test_minimum_supported_version_is_supported(self):
        self.assertTrue(argo_server.is_version_supported("v4.1.0"))

    def test_newer_version_is_supported(self):
        self.assertTrue(argo_server.is_version_supported("v4.2.3"))

    def test_older_minor_version_is_not_supported(self):
        self.assertFalse(argo_server.is_version_supported("v4.0.6"))

    def test_older_major_version_is_not_supported(self):
        self.assertFalse(argo_server.is_version_supported("v3.6.4"))

    def test_version_without_leading_v_is_parsed(self):
        self.assertTrue(argo_server.is_version_supported("4.1.0"))

    def test_none_is_unknown(self):
        self.assertIsNone(argo_server.is_version_supported(None))

    def test_unparseable_version_is_unknown(self):
        self.assertIsNone(argo_server.is_version_supported("not-a-version"))

    def test_prerelease_of_minimum_version_is_not_supported(self):
        self.assertFalse(argo_server.is_version_supported("v4.1.0-rc1"))

    def test_build_metadata_without_prerelease_is_supported(self):
        self.assertTrue(argo_server.is_version_supported("v4.1.0+build123"))

    def test_trailing_garbage_after_version_is_unknown(self):
        self.assertIsNone(argo_server.is_version_supported("v4.1.0 (dirty)"))


if __name__ == "__main__":
    unittest.main()
