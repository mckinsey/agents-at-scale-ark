"""Tests for OpenAPI security injection based on AUTH_MODE."""
import os
import unittest
from unittest.mock import Mock, patch

from ark_api.main import app, custom_openapi
from ark_api.auth.constants import AuthMode


class TestOpenAPISecurity(unittest.TestCase):
    def setUp(self):
        # Ensure we start with a fresh OpenAPI schema each time
        app.openapi_schema = None

    async def _get_schema(self) -> dict:
        # Minimal Request mock: only headers are used by custom_openapi
        request = Mock()
        request.headers = {}
        schema = await custom_openapi(request)
        return schema

    @patch.dict(os.environ, {"AUTH_MODE": AuthMode.BASIC})
    async def test_basic_mode_exposes_basic_auth(self):
        schema = await self._get_schema()
        schemes = schema.get("components", {}).get("securitySchemes", {})
        self.assertIn("basicAuth", schemes)
        self.assertEqual(schemes["basicAuth"]["scheme"], "basic")
        # Top-level security should reference basicAuth
        self.assertIn({"basicAuth": []}, schema.get("security", []))
        # Public routes should be unlocked
        health_get = schema["paths"]["/health"]["get"]
        self.assertEqual(health_get.get("security"), [])

    @patch.dict(os.environ, {"AUTH_MODE": AuthMode.SSO})
    async def test_sso_mode_exposes_bearer_auth(self):
        schema = await self._get_schema()
        schemes = schema.get("components", {}).get("securitySchemes", {})
        self.assertIn("bearerAuth", schemes)
        self.assertEqual(schemes["bearerAuth"]["scheme"], "bearer")
        self.assertIn({"bearerAuth": []}, schema.get("security", []))

    @patch.dict(os.environ, {"AUTH_MODE": AuthMode.HYBRID})
    async def test_hybrid_mode_exposes_both_schemes(self):
        schema = await self._get_schema()
        schemes = schema.get("components", {}).get("securitySchemes", {})
        self.assertIn("bearerAuth", schemes)
        self.assertIn("basicAuth", schemes)
        # OR semantics: two entries at top level
        security = schema.get("security", [])
        self.assertIn({"bearerAuth": []}, security)
        self.assertIn({"basicAuth": []}, security)

    @patch.dict(os.environ, {"AUTH_MODE": AuthMode.OPEN})
    async def test_open_mode_has_no_global_security(self):
        schema = await self._get_schema()
        # No global security and no schemes in open mode
        self.assertIsNone(schema.get("security"))
        self.assertIsNone(schema.get("components", {}).get("securitySchemes"))


if __name__ == "__main__":
    unittest.main()


