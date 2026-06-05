"""Tests for the authorization block on the MCPServer read surface."""
from __future__ import annotations

import os
import unittest

os.environ.setdefault("AUTH_MODE", "open")

from ark_api.api.v1.mcp_servers import (
    mcp_server_to_detail_response,
    mcp_server_to_response,
)

ANNOTATION_AUTHORIZED_BY = "ark.mckinsey.com/mcp-auth-authorized-by"
ANNOTATION_AUTHORIZED_AT = "ark.mckinsey.com/mcp-auth-authorized-at"


def _mcp_dict(*, state=None, resource_name=None, expires_at=None, annotations=None):
    status = {}
    if state is not None:
        authorization = {"state": state}
        if resource_name is not None:
            authorization["resourceName"] = resource_name
        if expires_at is not None:
            authorization["expiresAt"] = expires_at
        status["authorization"] = authorization
    return {
        "metadata": {
            "name": "notion-mcp",
            "namespace": "default",
            "annotations": annotations or {},
        },
        "spec": {"transport": "http"},
        "status": status,
    }


class TestAuthorizationReadSurface(unittest.TestCase):
    def test_required_state_in_list(self):
        resp = mcp_server_to_response(_mcp_dict(state="Required"))
        self.assertIsNotNone(resp.authorization)
        self.assertEqual(resp.authorization.state, "Required")

    def test_discovery_failed_state_in_list(self):
        resp = mcp_server_to_response(_mcp_dict(state="DiscoveryFailed"))
        self.assertEqual(resp.authorization.state, "DiscoveryFailed")

    def test_authorized_exposes_identity_and_expiry(self):
        mcp = _mcp_dict(
            state="Authorized",
            resource_name="Notion MCP (Beta)",
            expires_at="2030-01-01T00:00:00Z",
            annotations={
                ANNOTATION_AUTHORIZED_BY: "alice@example.com",
                ANNOTATION_AUTHORIZED_AT: "2026-01-01T00:00:00Z",
            },
        )
        resp = mcp_server_to_response(mcp)
        self.assertEqual(resp.authorization.state, "Authorized")
        self.assertEqual(resp.authorization.authorizedBy, "alice@example.com")
        self.assertEqual(resp.authorization.authorizedAt, "2026-01-01T00:00:00Z")
        self.assertEqual(resp.authorization.expiresAt, "2030-01-01T00:00:00Z")
        self.assertEqual(resp.authorization.resourceName, "Notion MCP (Beta)")

    def test_absent_authorization_is_null_in_list(self):
        resp = mcp_server_to_response(_mcp_dict(state=None))
        self.assertIsNone(resp.authorization)

    def test_detail_response_includes_authorization(self):
        mcp = _mcp_dict(state="Authorized", expires_at="2030-01-01T00:00:00Z")
        resp = mcp_server_to_detail_response(mcp)
        self.assertEqual(resp.authorization.state, "Authorized")
        self.assertEqual(resp.authorization.expiresAt, "2030-01-01T00:00:00Z")

    def test_detail_absent_authorization_is_null(self):
        resp = mcp_server_to_detail_response(_mcp_dict(state=None))
        self.assertIsNone(resp.authorization)

    def test_no_token_material_serialized(self):
        mcp = _mcp_dict(state="Authorized", expires_at="2030-01-01T00:00:00Z")
        dumped = mcp_server_to_response(mcp).model_dump()
        serialized = str(dumped).lower()
        self.assertNotIn("access_token", serialized)
        self.assertNotIn("client_secret", serialized)


if __name__ == "__main__":
    unittest.main()
