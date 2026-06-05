"""Endpoint tests for the four MCP auth routes."""
from __future__ import annotations

import os
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

os.environ["AUTH_MODE"] = "open"
os.environ["ARK_API_PUBLIC_CALLBACK_URL"] = "https://ark.example.com/v1/mcp/auth/callback"

from fastapi.testclient import TestClient

from ark_api.core import mcp_auth_config


REDIRECT_URI = "https://ark.example.com/v1/mcp/auth/callback"
SECRET_NAME = "notion-mcp-tokens"


def _build_typed_mcp(
    *,
    name: str = "notion-mcp",
    namespace: str = "default",
    state: str | None = "Required",
    registration_endpoint: str | None = "https://idp.example.com/register",
    token_endpoint: str | None = "https://idp.example.com/token",
    authorization_endpoint: str | None = "https://idp.example.com/authorize",
    resource: str | None = "https://mcp.example/mcp",
    scopes_supported: list[str] | None = None,
    token_secret_ref_name: str | None = SECRET_NAME,
    conditions: list | None = None,
):
    auth_status = MagicMock()
    auth_status.state = state
    auth_status.registration_endpoint = registration_endpoint
    auth_status.token_endpoint = token_endpoint
    auth_status.authorization_endpoint = authorization_endpoint
    auth_status.resource = resource
    auth_status.scopes_supported = scopes_supported

    status = MagicMock()
    status.authorization = auth_status
    status.conditions = conditions

    token_ref = MagicMock()
    token_ref.name = token_secret_ref_name
    token_ref.access_token_key = None
    token_ref.refresh_token_key = None
    token_ref.expires_at_key = None
    token_ref.client_id_key = None
    token_ref.client_secret_key = None

    spec_auth = MagicMock()
    spec_auth.token_secret_ref = token_ref if token_secret_ref_name is not None else None

    spec = MagicMock()
    spec.authorization = spec_auth if token_secret_ref_name is not None else None

    mcp = MagicMock()
    mcp.status = status
    mcp.spec = spec
    mcp.to_dict.return_value = {
        "metadata": {"name": name, "namespace": namespace},
        "spec": {"authorization": {"tokenSecretRef": {"name": token_secret_ref_name}} if token_secret_ref_name else {}},
        "status": {
            "authorization": {
                "state": state,
                "registrationEndpoint": registration_endpoint,
                "tokenEndpoint": token_endpoint,
                "authorizationEndpoint": authorization_endpoint,
                "resource": resource,
                "scopesSupported": scopes_supported,
            }
        },
    }
    return mcp


def _patch_ark_client(mcp=None):
    if mcp is None:
        mcp = _build_typed_mcp()
    mock_client = AsyncMock()
    mock_client.mcpservers.a_get = AsyncMock(return_value=mcp)
    mock_client.mcpservers.a_update = AsyncMock(return_value=mcp)
    mock_client.mcpservers.a_patch = AsyncMock(return_value=mcp)

    cm = AsyncMock()
    cm.__aenter__.return_value = mock_client
    cm.__aexit__.return_value = None
    patcher = patch("ark_api.api.v1.mcp_auth.with_ark_client", return_value=cm)
    return patcher, mock_client


class _AuthBase(unittest.TestCase):
    def setUp(self):
        mcp_auth_config.reset_mcp_auth_config()
        from ark_api.main import app

        self.client = TestClient(app)

    def tearDown(self):
        mcp_auth_config.reset_mcp_auth_config()


class TestAuthStart(_AuthBase):
    @patch("ark_api.api.v1.mcp_auth.write_flow_state", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_cached_client_creds", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.register_client", new_callable=AsyncMock)
    def test_start_happy_path_with_dcr(self, mock_register, mock_read_creds, mock_write_flow):
        from ark_api.services.mcp_auth_persistence import CachedClientCreds
        from ark_api.services.oauth_dcr import DcrResult

        mock_read_creds.return_value = CachedClientCreds(client_id=None, client_secret=None)
        mock_register.return_value = DcrResult(
            client_id="cid",
            client_secret="csec",
            raw_response={},
        )

        patcher, _ = _patch_ark_client(_build_typed_mcp(scopes_supported=["read", "write"]))
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertIn("auth_id", body)
        self.assertIn("authorization_url", body)
        self.assertIn("flow_expires_at", body)
        self.assertNotIn("expires_at", body)
        self.assertIn("https://idp.example.com/authorize?", body["authorization_url"])
        self.assertIn("code_challenge_method=S256", body["authorization_url"])
        self.assertIn("resource=https", body["authorization_url"])
        self.assertIn("scope=read+write", body["authorization_url"])
        mock_register.assert_awaited_once()
        mock_write_flow.assert_awaited_once()

    @patch("ark_api.api.v1.mcp_auth.write_flow_state", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_cached_client_creds", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.register_client", new_callable=AsyncMock)
    def test_start_skips_dcr_when_cached_creds_present(self, mock_register, mock_read_creds, _mock_write):
        from ark_api.services.mcp_auth_persistence import CachedClientCreds

        mock_read_creds.return_value = CachedClientCreds(client_id="cid", client_secret="csec")

        patcher, _ = _patch_ark_client(_build_typed_mcp())
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        mock_register.assert_not_called()

    @patch("ark_api.api.v1.mcp_auth.write_flow_state", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_cached_client_creds", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.register_client", new_callable=AsyncMock)
    def test_force_triggers_dcr_even_with_cached_creds(
        self, mock_register, mock_read_creds, _mock_write
    ):
        from ark_api.services.mcp_auth_persistence import CachedClientCreds
        from ark_api.services.oauth_dcr import DcrResult

        mock_read_creds.return_value = CachedClientCreds(client_id="cid", client_secret="csec")
        mock_register.return_value = DcrResult(
            client_id="cid2", client_secret="csec2", raw_response={}
        )

        patcher, _ = _patch_ark_client(_build_typed_mcp())
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={"force": True},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        mock_register.assert_awaited_once()

    def test_start_authorized_without_force_returns_409(self):
        patcher, _ = _patch_ark_client(_build_typed_mcp(state="Authorized"))
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 409, response.text)

    @patch("ark_api.api.v1.mcp_auth.write_flow_state", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_cached_client_creds", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.register_client", new_callable=AsyncMock)
    def test_start_authorized_with_force_proceeds(self, mock_register, mock_read_creds, _mock_write):
        from ark_api.services.mcp_auth_persistence import CachedClientCreds
        from ark_api.services.oauth_dcr import DcrResult

        mock_read_creds.return_value = CachedClientCreds(client_id="cid", client_secret="csec")
        mock_register.return_value = DcrResult(client_id="cid2", client_secret="csec2", raw_response={})
        patcher, _ = _patch_ark_client(_build_typed_mcp(state="Authorized"))
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={"force": True},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        mock_register.assert_awaited_once()

    def test_start_discovery_failed_returns_422_even_with_force(self):
        patcher, _ = _patch_ark_client(_build_typed_mcp(state="DiscoveryFailed"))
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={"force": True},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 422, response.text)

    @patch("ark_api.api.v1.mcp_auth.read_cached_client_creds", new_callable=AsyncMock)
    def test_missing_registration_endpoint_without_cached_creds_returns_422(
        self, mock_read_creds
    ):
        from ark_api.services.mcp_auth_persistence import CachedClientCreds

        mock_read_creds.return_value = CachedClientCreds(client_id=None, client_secret=None)
        patcher, _ = _patch_ark_client(_build_typed_mcp(registration_endpoint=None))
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 422, response.text)

    @patch("ark_api.api.v1.mcp_auth.write_flow_state", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_cached_client_creds", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.register_client", new_callable=AsyncMock)
    def test_missing_registration_endpoint_with_cached_creds_succeeds(
        self, mock_register, mock_read_creds, _mock_write
    ):
        from ark_api.services.mcp_auth_persistence import CachedClientCreds

        mock_read_creds.return_value = CachedClientCreds(client_id="cid", client_secret="csec")
        patcher, _ = _patch_ark_client(_build_typed_mcp(registration_endpoint=None))
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)

    @patch("ark_api.api.v1.mcp_auth.read_cached_client_creds", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.register_client", new_callable=AsyncMock)
    def test_dcr_failure_returns_502(self, mock_register, mock_read_creds):
        from ark_api.services.mcp_auth_persistence import CachedClientCreds
        from ark_api.services.oauth_dcr import DcrError

        mock_read_creds.return_value = CachedClientCreds(client_id=None, client_secret=None)
        mock_register.side_effect = DcrError("redirect_uris missing")

        patcher, _ = _patch_ark_client(_build_typed_mcp())
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 502, response.text)

    def test_missing_token_secret_ref_returns_422(self):
        patcher, _ = _patch_ark_client(_build_typed_mcp(token_secret_ref_name=None))
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 422, response.text)
        self.assertIn("tokenSecretRef", response.json()["detail"])


class TestAuthCallback(_AuthBase):
    @patch("ark_api.api.v1.mcp_auth.mark_flow_authorized", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.annotate_mcpserver_authorized", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.write_token_secret", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.exchange_code", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_flow_state_by_state_param", new_callable=AsyncMock)
    def test_happy_path(self, mock_read_flow, mock_exchange, mock_write, mock_annotate, mock_mark):
        from ark_api.services.mcp_auth_persistence import FlowState
        from ark_api.services.oauth_token import TokenResponse

        mock_read_flow.return_value = FlowState(
            auth_id="aid", state_param="st1", verifier="v" * 64,
            status="pending", message="", expires_at="2030-01-01T00:00:00Z",
            caller_identity="cli", token_expires_at="",
            server_name="notion-mcp", namespace="default",
            client_id="cid", client_secret="csec",
            secret_name="notion-mcp-tokens",
        )
        mock_exchange.return_value = TokenResponse(
            access_token="at", refresh_token="rt", expires_in=3600, raw={}
        )

        patcher, _ = _patch_ark_client(_build_typed_mcp())
        with patcher:
            response = self.client.get(
                "/v1/mcp/auth/callback",
                params={"state": "default.st1", "code": "the-code"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        mock_write.assert_awaited_once()
        mock_annotate.assert_awaited_once()
        mock_mark.assert_awaited_once()

    @patch("ark_api.api.v1.mcp_auth.read_flow_state_by_state_param", new_callable=AsyncMock)
    def test_unknown_state_returns_400_html(self, mock_read_flow):
        mock_read_flow.return_value = None
        response = self.client.get("/v1/mcp/auth/callback", params={"state": "default.unknown", "code": "x"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("Unknown or expired state", response.text)

    @patch("ark_api.api.v1.mcp_auth.mark_flow_failed", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_flow_state_by_state_param", new_callable=AsyncMock)
    def test_idp_returns_error_renders_400_and_marks_failed(self, mock_read_flow, mock_mark_failed):
        from ark_api.services.mcp_auth_persistence import FlowState

        mock_read_flow.return_value = FlowState(
            auth_id="aid", state_param="st1", verifier="v",
            status="pending", message="", expires_at="2030-01-01T00:00:00Z",
            caller_identity="cli", token_expires_at="",
            server_name="notion-mcp", namespace="default",
            client_id="cid", client_secret="csec",
            secret_name="notion-mcp-tokens",
        )

        response = self.client.get(
            "/v1/mcp/auth/callback",
            params={
                "state": "default.st1",
                "error": "access_denied",
                "error_description": "<script>alert(1)</script>",
            },
        )
        self.assertEqual(response.status_code, 400, response.text)
        self.assertIn("&lt;script&gt;", response.text)
        self.assertNotIn("<script>alert(1)</script>", response.text)
        mock_mark_failed.assert_awaited_once()


class TestAuthStatus(_AuthBase):
    @patch("ark_api.api.v1.mcp_auth.read_flow_state_by_auth_id", new_callable=AsyncMock)
    def test_unknown_auth_id_returns_expired(self, mock_read_flow):
        mock_read_flow.return_value = None
        patcher, _ = _patch_ark_client(_build_typed_mcp(state="Required"))
        with patcher:
            response = self.client.get(
                "/v1/mcp-servers/notion-mcp/auth/status",
                params={"auth_id": "no-such", "namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["state"], "expired")

    @patch("ark_api.api.v1.mcp_auth.read_flow_state_by_auth_id", new_callable=AsyncMock)
    def test_pending_when_flow_pending(self, mock_read_flow):
        from ark_api.services.mcp_auth_persistence import FlowState

        mock_read_flow.return_value = FlowState(
            auth_id="aid", state_param="st1", verifier="v",
            status="pending", message="", expires_at="2030-01-01T00:00:00Z",
            caller_identity="cli", token_expires_at="",
            server_name="notion-mcp", namespace="default",
            client_id="cid", client_secret="csec",
        )
        patcher, _ = _patch_ark_client(_build_typed_mcp(state="Required"))
        with patcher:
            response = self.client.get(
                "/v1/mcp-servers/notion-mcp/auth/status",
                params={"auth_id": "aid", "namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["state"], "pending")
        self.assertEqual(body["controller_state"], "Required")

    @patch("ark_api.api.v1.mcp_auth.read_flow_state_by_auth_id", new_callable=AsyncMock)
    def test_pending_when_flow_authorized_but_server_not_authorized(self, mock_read_flow):
        from ark_api.services.mcp_auth_persistence import FlowState

        mock_read_flow.return_value = FlowState(
            auth_id="aid", state_param="st1", verifier="v",
            status="authorized", message="", expires_at="2030-01-01T00:00:00Z",
            caller_identity="cli", token_expires_at="2026-01-01T00:00:00Z",
            server_name="notion-mcp", namespace="default",
            client_id="cid", client_secret="csec",
        )
        mcp = _build_typed_mcp(state="Pending")
        patcher, _ = _patch_ark_client(mcp)
        with patcher:
            response = self.client.get(
                "/v1/mcp-servers/notion-mcp/auth/status",
                params={"auth_id": "aid", "namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["state"], "pending")

    @patch("ark_api.api.v1.mcp_auth.read_flow_state_by_auth_id", new_callable=AsyncMock)
    def test_authorized_when_both_align(self, mock_read_flow):
        from ark_api.services.mcp_auth_persistence import FlowState

        mock_read_flow.return_value = FlowState(
            auth_id="aid", state_param="st1", verifier="v",
            status="authorized", message="", expires_at="2030-01-01T00:00:00Z",
            caller_identity="cli", token_expires_at="2026-01-01T00:00:00Z",
            server_name="notion-mcp", namespace="default",
            client_id="cid", client_secret="csec",
        )
        patcher, _ = _patch_ark_client(_build_typed_mcp(state="Authorized"))
        with patcher:
            response = self.client.get(
                "/v1/mcp-servers/notion-mcp/auth/status",
                params={"auth_id": "aid", "namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["state"], "authorized")
        self.assertEqual(body["expires_at"], "2026-01-01T00:00:00Z")
        self.assertEqual(body["controller_state"], "Authorized")

    @patch("ark_api.api.v1.mcp_auth.read_flow_state_by_auth_id", new_callable=AsyncMock)
    def test_cache_failed_wins_over_server_authorized(self, mock_read_flow):
        from ark_api.services.mcp_auth_persistence import FlowState

        mock_read_flow.return_value = FlowState(
            auth_id="aid", state_param="st1", verifier="v",
            status="failed", message="invalid_grant", expires_at="2030-01-01T00:00:00Z",
            caller_identity="cli", token_expires_at="",
            server_name="notion-mcp", namespace="default",
            client_id="cid", client_secret="csec",
        )
        patcher, _ = _patch_ark_client(_build_typed_mcp(state="Authorized"))
        with patcher:
            response = self.client.get(
                "/v1/mcp-servers/notion-mcp/auth/status",
                params={"auth_id": "aid", "namespace": "default"},
            )
        self.assertEqual(response.json()["state"], "failed")

    @patch("ark_api.api.v1.mcp_auth.read_flow_state_by_auth_id", new_callable=AsyncMock)
    def test_controller_not_yet_reconciled_returns_pending(self, mock_read_flow):
        from ark_api.services.mcp_auth_persistence import FlowState

        mock_read_flow.return_value = FlowState(
            auth_id="aid", state_param="st1", verifier="v",
            status="authorized", message="", expires_at="2030-01-01T00:00:00Z",
            caller_identity="cli", token_expires_at="2026-01-01T00:00:00Z",
            server_name="notion-mcp", namespace="default",
            client_id="cid", client_secret="csec",
        )
        cond = MagicMock()
        cond.type = "Available"
        cond.message = "OAuth authorization required for Notion MCP (Beta)"
        patcher, _ = _patch_ark_client(
            _build_typed_mcp(state="Required", conditions=[cond])
        )
        with patcher:
            response = self.client.get(
                "/v1/mcp-servers/notion-mcp/auth/status",
                params={"auth_id": "aid", "namespace": "default"},
            )
        body = response.json()
        self.assertEqual(body["state"], "pending")
        self.assertEqual(body["controller_state"], "Required")
        self.assertIn("awaiting", body["message"])


class TestAuthLogout(_AuthBase):
    @patch("ark_api.api.v1.mcp_auth.strip_mcpserver_auth_annotations", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.clear_token_secret", new_callable=AsyncMock)
    def test_default_clears_five_keys(self, mock_clear, mock_strip):
        mock_clear.return_value = [
            "access_token",
            "refresh_token",
            "expires_at",
            "client_id",
            "client_secret",
        ]
        patcher, _ = _patch_ark_client(_build_typed_mcp())
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/logout",
                json={},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(response.json()["cleared_keys"]), 5)
        mock_strip.assert_awaited_once()

    @patch("ark_api.api.v1.mcp_auth.strip_mcpserver_auth_annotations", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.clear_token_secret", new_callable=AsyncMock)
    def test_keep_client_clears_three_keys(self, mock_clear, mock_strip):
        mock_clear.return_value = ["access_token", "refresh_token", "expires_at"]
        patcher, _ = _patch_ark_client(_build_typed_mcp())
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/logout",
                json={"keep_client": True},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(set(response.json()["cleared_keys"]), {"access_token", "refresh_token", "expires_at"})
        passed = mock_clear.await_args.kwargs
        self.assertTrue(passed["keep_client"])

    @patch("ark_api.api.v1.mcp_auth.strip_mcpserver_auth_annotations", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.delete_token_secret", new_callable=AsyncMock)
    def test_delete_secret(self, mock_delete, mock_strip):
        mock_delete.return_value = True
        patcher, _ = _patch_ark_client(_build_typed_mcp())
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/logout",
                json={"delete_secret": True},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["deleted"])

    def test_mutual_exclusion(self):
        patcher, _ = _patch_ark_client(_build_typed_mcp())
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/logout",
                json={"keep_client": True, "delete_secret": True},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 400, response.text)

    @patch("ark_api.api.v1.mcp_auth.strip_mcpserver_auth_annotations", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.clear_token_secret", new_callable=AsyncMock)
    def test_default_missing_secret_returns_noop(self, mock_clear, mock_strip):
        mock_clear.return_value = None
        patcher, _ = _patch_ark_client(_build_typed_mcp())
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/logout",
                json={},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["noop"])
        mock_strip.assert_awaited_once()

    @patch("ark_api.api.v1.mcp_auth.strip_mcpserver_auth_annotations", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.delete_token_secret", new_callable=AsyncMock)
    def test_delete_secret_missing_returns_noop(self, mock_delete, mock_strip):
        mock_delete.return_value = False
        patcher, _ = _patch_ark_client(_build_typed_mcp())
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/logout",
                json={"delete_secret": True},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["noop"])
        mock_strip.assert_awaited_once()


class TestConfigGuards(_AuthBase):
    def test_callback_url_unset_returns_503(self):
        original = os.environ.pop("ARK_API_PUBLIC_CALLBACK_URL", None)
        mcp_auth_config.reset_mcp_auth_config()
        try:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={},
                params={"namespace": "default"},
            )
            self.assertEqual(response.status_code, 503, response.text)
        finally:
            if original is not None:
                os.environ["ARK_API_PUBLIC_CALLBACK_URL"] = original
            mcp_auth_config.reset_mcp_auth_config()


class TestAuthStartMissingFields(_AuthBase):
    def test_missing_authorization_endpoint_returns_422(self):
        patcher, _ = _patch_ark_client(_build_typed_mcp(authorization_endpoint=None))
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 422, response.text)

    @patch("ark_api.api.v1.mcp_auth.write_flow_state", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_cached_client_creds", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.register_client", new_callable=AsyncMock)
    def test_force_falls_back_to_cached_when_registration_endpoint_missing(
        self, mock_register, mock_read_creds, _mock_write
    ):
        from ark_api.services.mcp_auth_persistence import CachedClientCreds

        mock_read_creds.return_value = CachedClientCreds(client_id="cid", client_secret="csec")
        patcher, _ = _patch_ark_client(_build_typed_mcp(registration_endpoint=None))
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={"force": True},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        mock_register.assert_not_called()

    @patch("ark_api.api.v1.mcp_auth.write_flow_state", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_cached_client_creds", new_callable=AsyncMock)
    def test_explicit_scopes_override_advertised(self, mock_read_creds, _mock_write):
        from ark_api.services.mcp_auth_persistence import CachedClientCreds

        mock_read_creds.return_value = CachedClientCreds(client_id="cid", client_secret="csec")
        patcher, _ = _patch_ark_client(
            _build_typed_mcp(scopes_supported=["read", "write"])
        )
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={"scopes": ["custom"]},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("scope=custom", response.json()["authorization_url"])


class TestAuthCallbackMissingFields(_AuthBase):
    def test_missing_state_returns_400(self):
        response = self.client.get("/v1/mcp/auth/callback", params={"code": "x"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("Missing state parameter", response.text)


class TestAuthStatusExpired(_AuthBase):
    @patch("ark_api.api.v1.mcp_auth.read_flow_state_by_auth_id", new_callable=AsyncMock)
    def test_mismatched_auth_id_returns_expired(self, mock_read_flow):
        from ark_api.services.mcp_auth_persistence import FlowState

        mock_read_flow.return_value = FlowState(
            auth_id="different-id", state_param="st1", verifier="v",
            status="pending", message="", expires_at="2030-01-01T00:00:00Z",
            caller_identity="cli", token_expires_at="",
            server_name="notion-mcp", namespace="default",
            client_id="cid", client_secret="csec",
        )
        patcher, _ = _patch_ark_client(_build_typed_mcp(state="Required"))
        with patcher:
            response = self.client.get(
                "/v1/mcp-servers/notion-mcp/auth/status",
                params={"auth_id": "no-such", "namespace": "default"},
            )
        self.assertEqual(response.json()["state"], "expired")


class TestAuthLogoutNoTokenRef(_AuthBase):
    @patch("ark_api.api.v1.mcp_auth.strip_mcpserver_auth_annotations", new_callable=AsyncMock)
    def test_no_token_secret_ref_returns_noop(self, mock_strip):
        patcher, _ = _patch_ark_client(_build_typed_mcp(token_secret_ref_name=None))
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/logout",
                json={},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["noop"])
        mock_strip.assert_awaited_once()


class TestResolveCallerIdentity(unittest.TestCase):
    def test_authenticated_request_resolves_username(self):
        from ark_api.api.v1.mcp_auth import _resolve_caller_identity

        request = MagicMock()
        request.state.user_identity.username = "alice@example.com"
        self.assertEqual(_resolve_caller_identity(request), "alice@example.com")

    def test_unauthenticated_request_resolves_cli(self):
        from ark_api.api.v1.mcp_auth import _resolve_caller_identity

        request = MagicMock()
        request.state.user_identity = None
        self.assertEqual(_resolve_caller_identity(request), "cli")


class TestAuthStartIdentityAndRedirect(_AuthBase):
    def _run_start(self, json_body):
        with patch(
            "ark_api.api.v1.mcp_auth.write_flow_state", new_callable=AsyncMock
        ) as mock_write, patch(
            "ark_api.api.v1.mcp_auth.read_cached_client_creds", new_callable=AsyncMock
        ) as mock_read_creds, patch(
            "ark_api.api.v1.mcp_auth.register_client", new_callable=AsyncMock
        ) as mock_register:
            from ark_api.services.mcp_auth_persistence import CachedClientCreds
            from ark_api.services.oauth_dcr import DcrResult

            mock_read_creds.return_value = CachedClientCreds(client_id=None, client_secret=None)
            mock_register.return_value = DcrResult(
                client_id="cid", client_secret="csec", raw_response={}
            )
            patcher, _ = _patch_ark_client(_build_typed_mcp())
            with patcher:
                response = self.client.post(
                    "/v1/mcp-servers/notion-mcp/auth/start",
                    json=json_body,
                    params={"namespace": "default"},
                )
            return response, mock_write

    def test_unauthenticated_start_stores_cli_and_default_flag(self):
        response, mock_write = self._run_start({})
        self.assertEqual(response.status_code, 200, response.text)
        kwargs = mock_write.await_args.kwargs
        self.assertEqual(kwargs["caller_identity"], "cli")
        self.assertEqual(kwargs["redirect_on_complete"], False)
        body = response.json()
        self.assertNotIn("caller_identity", body)
        self.assertNotIn("redirect_on_complete", body)

    def test_redirect_on_complete_round_trips(self):
        response, mock_write = self._run_start({"redirect_on_complete": True})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(mock_write.await_args.kwargs["redirect_on_complete"], True)

    def test_force_and_redirect_on_complete_accepted_together(self):
        with patch(
            "ark_api.api.v1.mcp_auth.write_flow_state", new_callable=AsyncMock
        ) as mock_write, patch(
            "ark_api.api.v1.mcp_auth.read_cached_client_creds", new_callable=AsyncMock
        ) as mock_read_creds, patch(
            "ark_api.api.v1.mcp_auth.register_client", new_callable=AsyncMock
        ) as mock_register:
            from ark_api.services.mcp_auth_persistence import CachedClientCreds
            from ark_api.services.oauth_dcr import DcrResult

            mock_read_creds.return_value = CachedClientCreds(client_id="cid", client_secret="csec")
            mock_register.return_value = DcrResult(
                client_id="cid2", client_secret="csec2", raw_response={}
            )
            patcher, _ = _patch_ark_client(_build_typed_mcp(state="Authorized"))
            with patcher:
                response = self.client.post(
                    "/v1/mcp-servers/notion-mcp/auth/start",
                    json={"force": True, "redirect_on_complete": True},
                    params={"namespace": "default"},
                )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(mock_write.await_args.kwargs["redirect_on_complete"], True)

    def test_start_wires_resolved_identity_into_flow(self):
        with patch(
            "ark_api.api.v1.mcp_auth._resolve_caller_identity",
            return_value="alice@example.com",
        ), patch(
            "ark_api.api.v1.mcp_auth.write_flow_state", new_callable=AsyncMock
        ) as mock_write, patch(
            "ark_api.api.v1.mcp_auth.read_cached_client_creds", new_callable=AsyncMock
        ) as mock_read_creds, patch(
            "ark_api.api.v1.mcp_auth.register_client", new_callable=AsyncMock
        ) as mock_register:
            from ark_api.services.mcp_auth_persistence import CachedClientCreds
            from ark_api.services.oauth_dcr import DcrResult

            mock_read_creds.return_value = CachedClientCreds(client_id=None, client_secret=None)
            mock_register.return_value = DcrResult(
                client_id="cid", client_secret="csec", raw_response={}
            )
            patcher, _ = _patch_ark_client(_build_typed_mcp())
            with patcher:
                response = self.client.post(
                    "/v1/mcp-servers/notion-mcp/auth/start",
                    json={},
                    params={"namespace": "default"},
                )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(mock_write.await_args.kwargs["caller_identity"], "alice@example.com")


def _dashboard_flow(*, redirect_on_complete=True, caller_identity="cli", auth_id="aid"):
    from ark_api.services.mcp_auth_persistence import FlowState

    return FlowState(
        auth_id=auth_id, state_param="st1", verifier="v" * 64,
        status="pending", message="", expires_at="2030-01-01T00:00:00Z",
        caller_identity=caller_identity, token_expires_at="",
        server_name="notion-mcp", namespace="team-a",
        client_id="cid", client_secret="csec",
        secret_name="notion-mcp-tokens",
        redirect_on_complete=redirect_on_complete,
    )


class TestAuthCallbackDashboard(_AuthBase):
    DASHBOARD_URL = "https://ark.example.com"

    def setUp(self):
        super().setUp()
        os.environ["ARK_API_DASHBOARD_URL"] = self.DASHBOARD_URL
        mcp_auth_config.reset_mcp_auth_config()

    def tearDown(self):
        os.environ.pop("ARK_API_DASHBOARD_URL", None)
        mcp_auth_config.reset_mcp_auth_config()
        super().tearDown()

    @patch("ark_api.api.v1.mcp_auth.mark_flow_authorized", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.annotate_mcpserver_authorized", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.write_token_secret", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.exchange_code", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_flow_state_by_state_param", new_callable=AsyncMock)
    def test_success_redirects_with_auth_id(
        self, mock_read_flow, mock_exchange, mock_write, mock_annotate, mock_mark
    ):
        from ark_api.services.oauth_token import TokenResponse

        mock_read_flow.return_value = _dashboard_flow(caller_identity="alice@example.com")
        mock_exchange.return_value = TokenResponse(
            access_token="at", refresh_token="rt", expires_in=3600, raw={}
        )
        patcher, _ = _patch_ark_client(_build_typed_mcp())
        with patcher:
            response = self.client.get(
                "/v1/mcp/auth/callback",
                params={"state": "team-a.st1", "code": "the-code"},
                follow_redirects=False,
            )
        self.assertEqual(response.status_code, 302, response.text)
        location = response.headers["location"]
        self.assertTrue(location.startswith("https://ark.example.com/mcp?"))
        self.assertIn("authorized=notion-mcp", location)
        self.assertIn("namespace=team-a", location)
        self.assertIn("auth_id=aid", location)
        self.assertNotIn("auth_error", location)
        mock_annotate.assert_awaited_once()
        self.assertEqual(mock_annotate.await_args.args[2], "alice@example.com")

    @patch("ark_api.api.v1.mcp_auth.mark_flow_failed", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_flow_state_by_state_param", new_callable=AsyncMock)
    def test_idp_error_redirects_with_capped_desc(self, mock_read_flow, mock_mark_failed):
        mock_read_flow.return_value = _dashboard_flow()
        long_desc = "x" * 500
        response = self.client.get(
            "/v1/mcp/auth/callback",
            params={
                "state": "team-a.st1",
                "error": "access_denied",
                "error_description": long_desc,
            },
            follow_redirects=False,
        )
        self.assertEqual(response.status_code, 302, response.text)
        location = response.headers["location"]
        self.assertIn("auth_error=access_denied", location)
        self.assertIn("auth_error_desc=", location)
        self.assertNotIn("auth_id=", location)
        from urllib.parse import parse_qs, urlsplit

        desc = parse_qs(urlsplit(location).query)["auth_error_desc"][0]
        self.assertLessEqual(len(desc), 200)
        mock_mark_failed.assert_awaited_once()

    @patch("ark_api.api.v1.mcp_auth.mark_flow_failed", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.exchange_code", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_flow_state_by_state_param", new_callable=AsyncMock)
    def test_token_exchange_failure_redirects(
        self, mock_read_flow, mock_exchange, mock_mark_failed
    ):
        from ark_api.services.oauth_token import TokenExchangeError

        mock_read_flow.return_value = _dashboard_flow()
        mock_exchange.side_effect = TokenExchangeError("token endpoint said no")
        patcher, _ = _patch_ark_client(_build_typed_mcp())
        with patcher:
            response = self.client.get(
                "/v1/mcp/auth/callback",
                params={"state": "team-a.st1", "code": "the-code"},
                follow_redirects=False,
            )
        self.assertEqual(response.status_code, 302, response.text)
        self.assertIn("auth_error=token_exchange_failed", response.headers["location"])
        mock_mark_failed.assert_awaited_once()

    @patch("ark_api.api.v1.mcp_auth.read_flow_state_by_state_param", new_callable=AsyncMock)
    def test_cache_miss_redirects_expired(self, mock_read_flow):
        mock_read_flow.return_value = None
        response = self.client.get(
            "/v1/mcp/auth/callback",
            params={"state": "team-a.unknown", "code": "x"},
            follow_redirects=False,
        )
        self.assertEqual(response.status_code, 302, response.text)
        location = response.headers["location"]
        self.assertEqual(location, "https://ark.example.com/mcp?auth_error=expired")

    @patch("ark_api.api.v1.mcp_auth.mark_flow_authorized", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.annotate_mcpserver_authorized", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.write_token_secret", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.exchange_code", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_flow_state_by_state_param", new_callable=AsyncMock)
    def test_redirect_ignores_client_supplied_url(
        self, mock_read_flow, mock_exchange, mock_write, mock_annotate, mock_mark
    ):
        from ark_api.services.oauth_token import TokenResponse

        mock_read_flow.return_value = _dashboard_flow()
        mock_exchange.return_value = TokenResponse(
            access_token="at", refresh_token="rt", expires_in=3600, raw={}
        )
        patcher, _ = _patch_ark_client(_build_typed_mcp())
        with patcher:
            response = self.client.get(
                "/v1/mcp/auth/callback",
                params={
                    "state": "team-a.st1",
                    "code": "the-code",
                    "redirect_uri": "https://evil.example.com",
                    "next": "https://evil.example.com/phish",
                },
                follow_redirects=False,
            )
        self.assertEqual(response.status_code, 302, response.text)
        location = response.headers["location"]
        self.assertTrue(location.startswith("https://ark.example.com/mcp?"))
        self.assertNotIn("evil.example.com", location)


class TestAuthCallbackDashboardPrefix(_AuthBase):
    DASHBOARD_URL = "https://ark.example.com/dashboard"

    def setUp(self):
        super().setUp()
        os.environ["ARK_API_DASHBOARD_URL"] = self.DASHBOARD_URL
        mcp_auth_config.reset_mcp_auth_config()

    def tearDown(self):
        os.environ.pop("ARK_API_DASHBOARD_URL", None)
        mcp_auth_config.reset_mcp_auth_config()
        super().tearDown()

    @patch("ark_api.api.v1.mcp_auth.mark_flow_authorized", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.annotate_mcpserver_authorized", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.write_token_secret", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.exchange_code", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_flow_state_by_state_param", new_callable=AsyncMock)
    def test_prefix_preserved_in_redirect(
        self, mock_read_flow, mock_exchange, mock_write, mock_annotate, mock_mark
    ):
        from ark_api.services.oauth_token import TokenResponse

        mock_read_flow.return_value = _dashboard_flow()
        mock_exchange.return_value = TokenResponse(
            access_token="at", refresh_token="rt", expires_in=3600, raw={}
        )
        patcher, _ = _patch_ark_client(_build_typed_mcp())
        with patcher:
            response = self.client.get(
                "/v1/mcp/auth/callback",
                params={"state": "team-a.st1", "code": "the-code"},
                follow_redirects=False,
            )
        self.assertEqual(response.status_code, 302, response.text)
        self.assertTrue(
            response.headers["location"].startswith(
                "https://ark.example.com/dashboard/mcp?"
            )
        )


class TestAuthCallbackHtmlFallback(_AuthBase):
    @patch("ark_api.api.v1.mcp_auth.mark_flow_authorized", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.annotate_mcpserver_authorized", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.write_token_secret", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.exchange_code", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_flow_state_by_state_param", new_callable=AsyncMock)
    def test_cli_flow_renders_html_when_dashboard_url_set(
        self, mock_read_flow, mock_exchange, mock_write, mock_annotate, mock_mark
    ):
        from ark_api.services.oauth_token import TokenResponse

        os.environ["ARK_API_DASHBOARD_URL"] = "https://ark.example.com"
        mcp_auth_config.reset_mcp_auth_config()
        try:
            mock_read_flow.return_value = _dashboard_flow(redirect_on_complete=False)
            mock_exchange.return_value = TokenResponse(
                access_token="at", refresh_token="rt", expires_in=3600, raw={}
            )
            patcher, _ = _patch_ark_client(_build_typed_mcp())
            with patcher:
                response = self.client.get(
                    "/v1/mcp/auth/callback",
                    params={"state": "team-a.st1", "code": "the-code"},
                    follow_redirects=False,
                )
            self.assertEqual(response.status_code, 200, response.text)
            self.assertIn("Authorization complete", response.text)
        finally:
            os.environ.pop("ARK_API_DASHBOARD_URL", None)
            mcp_auth_config.reset_mcp_auth_config()

    @patch("ark_api.api.v1.mcp_auth.read_flow_state_by_state_param", new_callable=AsyncMock)
    def test_cache_miss_no_dashboard_url_renders_html(self, mock_read_flow):
        mock_read_flow.return_value = None
        response = self.client.get(
            "/v1/mcp/auth/callback",
            params={"state": "default.unknown", "code": "x"},
            follow_redirects=False,
        )
        self.assertEqual(response.status_code, 400, response.text)
        self.assertIn("Unknown or expired state", response.text)


class TestAuthIdEntropy(unittest.TestCase):
    def test_auth_id_decodes_to_at_least_16_bytes(self):
        import base64
        from ark_api.services.pkce import generate_auth_id

        a = generate_auth_id()
        b = generate_auth_id()
        self.assertNotEqual(a, b)

        def _decode(s: str) -> bytes:
            pad = "=" * (-len(s) % 4)
            return base64.urlsafe_b64decode(s + pad)

        self.assertGreaterEqual(len(_decode(a)), 16)
        self.assertGreaterEqual(len(_decode(b)), 16)


if __name__ == "__main__":
    unittest.main()
