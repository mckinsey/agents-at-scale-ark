"""Tests for the health check endpoint."""
import json
import unittest

from starlette.requests import Request

from ark_mcp.server import health_check


def _make_request() -> Request:
    return Request({"type": "http", "method": "GET", "path": "/health", "headers": []})


class TestHealthEndpoint(unittest.IsolatedAsyncioTestCase):
    """Test cases for the /health endpoint used by Kubernetes probes."""

    async def test_health_returns_200_ok(self):
        response = await health_check(_make_request())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.body), {"status": "ok"})
