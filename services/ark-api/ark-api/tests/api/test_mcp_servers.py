"""Tests for the MCPServer read surface, focused on the authorization block."""
from __future__ import annotations

import os
import unittest

os.environ.setdefault("AUTH_MODE", "open")

from ark_api.api.v1.mcp_servers import (
    mcp_server_to_detail_response,
    mcp_server_to_response,
)
from ark_api.services.mcp_auth_persistence import (
    ANNOTATION_AUTHORIZED_AT,
    ANNOTATION_AUTHORIZED_BY,
)


def _mcp_dict(*, state=None, resource_name=None, expires_at=None, annotations=None):
    authorization = None
    if state is not None:
        authorization = {"state": state}
        if resource_name is not None:
            authorization["resourceName"] = resource_name
        if expires_at is not None:
            authorization["expiresAt"] = expires_at
    metadata = {"name": "notion-mcp", "namespace": "team-a"}
    if annotations is not None:
        metadata["annotations"] = annotations
    status = {}
    if authorization is not None:
        status["authorization"] = authorization
    return {
        "metadata": metadata,
        "spec": {"transport": "http"},
        "status": status,
    }


class TestAuthorizationBlock(unittest.TestCase):
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
            resource_name="notion-mcp-tokens",
            expires_at="2030-01-01T00:00:00Z",
            annotations={
                ANNOTATION_AUTHORIZED_BY: "alice@example.com",
                ANNOTATION_AUTHORIZED_AT: "2026-06-30T10:00:00Z",
            },
        )
        resp = mcp_server_to_response(mcp)
        self.assertEqual(resp.authorization.state, "Authorized")
        self.assertEqual(resp.authorization.authorizedBy, "alice@example.com")
        self.assertEqual(resp.authorization.authorizedAt, "2026-06-30T10:00:00Z")
        self.assertEqual(resp.authorization.expiresAt, "2030-01-01T00:00:00Z")
        self.assertEqual(resp.authorization.resourceName, "notion-mcp-tokens")

    def test_no_authorization_status_is_null(self):
        resp = mcp_server_to_response(_mcp_dict(state=None))
        self.assertIsNone(resp.authorization)

    def test_authorized_by_omitted_when_annotation_absent(self):
        resp = mcp_server_to_response(_mcp_dict(state="Required"))
        self.assertIsNone(resp.authorization.authorizedBy)
        self.assertIsNone(resp.authorization.expiresAt)

    def test_detail_response_exposes_authorization(self):
        mcp = _mcp_dict(
            state="Authorized",
            expires_at="2030-01-01T00:00:00Z",
            annotations={ANNOTATION_AUTHORIZED_BY: "alice@example.com"},
        )
        resp = mcp_server_to_detail_response(mcp)
        self.assertEqual(resp.authorization.state, "Authorized")
        self.assertEqual(resp.authorization.authorizedBy, "alice@example.com")
        self.assertEqual(resp.authorization.expiresAt, "2030-01-01T00:00:00Z")

    def test_detail_response_null_when_absent(self):
        resp = mcp_server_to_detail_response(_mcp_dict(state=None))
        self.assertIsNone(resp.authorization)

    def test_no_token_material_serialized(self):
        mcp = _mcp_dict(state="Authorized", expires_at="2030-01-01T00:00:00Z")
        dumped = mcp_server_to_response(mcp).model_dump()
        serialized = str(dumped)
        for forbidden in ("access_token", "refresh_token", "client_secret"):
            self.assertNotIn(forbidden, serialized)


if __name__ == "__main__":
    unittest.main()
