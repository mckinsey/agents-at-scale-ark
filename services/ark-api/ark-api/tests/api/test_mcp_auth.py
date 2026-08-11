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

    @patch("ark_api.api.v1.mcp_auth.write_flow_state", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_cached_client_creds", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.register_client", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.ensure_mcpserver_token_secret_ref", new_callable=AsyncMock)
    def test_missing_token_secret_ref_auto_provisions(
        self, mock_ensure, mock_register, mock_read_creds, mock_write_flow
    ):
        from ark_api.services.mcp_auth_persistence import CachedClientCreds
        from ark_api.services.oauth_dcr import DcrResult

        mock_read_creds.return_value = CachedClientCreds(client_id=None, client_secret=None)
        mock_register.return_value = DcrResult(client_id="cid", client_secret="csec", raw_response={})
        mock_ensure.return_value = "notion-mcp-oauth"

        no_ref = _build_typed_mcp(token_secret_ref_name=None)
        provisioned = _build_typed_mcp(token_secret_ref_name="notion-mcp-oauth")
        patcher, client = _patch_ark_client(no_ref)
        client.mcpservers.a_get = AsyncMock(side_effect=[no_ref, provisioned])
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        mock_ensure.assert_awaited_once()
        self.assertEqual(mock_write_flow.call_args.kwargs["secret_name"], "notion-mcp-oauth")


class TestAuthStartRedirectAndIdentity(_AuthBase):
    @patch("ark_api.api.v1.mcp_auth.write_flow_state", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_cached_client_creds", new_callable=AsyncMock)
    def test_redirect_on_complete_round_trips_and_defaults_cli(self, mock_read_creds, mock_write):
        from ark_api.services.mcp_auth_persistence import CachedClientCreds

        mock_read_creds.return_value = CachedClientCreds(client_id="cid", client_secret="csec")
        patcher, _ = _patch_ark_client(_build_typed_mcp())
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={"redirect_on_complete": True},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        kwargs = mock_write.call_args.kwargs
        self.assertTrue(kwargs["redirect_on_complete"])
        self.assertEqual(kwargs["caller_identity"], "cli")
        body = response.json()
        self.assertNotIn("caller_identity", body)
        self.assertNotIn("redirect_on_complete", body)

    @patch("ark_api.api.v1.mcp_auth.write_flow_state", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_cached_client_creds", new_callable=AsyncMock)
    def test_redirect_on_complete_defaults_false(self, mock_read_creds, mock_write):
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
        self.assertFalse(mock_write.call_args.kwargs["redirect_on_complete"])

    @patch("ark_api.api.v1.mcp_auth.write_flow_state", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_cached_client_creds", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.register_client", new_callable=AsyncMock)
    def test_force_with_redirect_on_complete_accepted(
        self, mock_register, mock_read_creds, mock_write
    ):
        from ark_api.services.mcp_auth_persistence import CachedClientCreds
        from ark_api.services.oauth_dcr import DcrResult

        mock_read_creds.return_value = CachedClientCreds(client_id="cid", client_secret="csec")
        mock_register.return_value = DcrResult(client_id="cid2", client_secret="csec2", raw_response={})
        patcher, _ = _patch_ark_client(_build_typed_mcp(state="Authorized"))
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={"force": True, "redirect_on_complete": True},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        mock_register.assert_awaited_once()
        self.assertTrue(mock_write.call_args.kwargs["redirect_on_complete"])

    def test_resolve_identity_returns_username_when_present(self):
        from ark_api.api.v1.mcp_auth import _resolve_caller_identity

        req = MagicMock()
        req.state.user_identity.username = "alice@example.com"
        self.assertEqual(_resolve_caller_identity(req), "alice@example.com")

    def test_resolve_identity_falls_back_to_cli(self):
        from ark_api.api.v1.mcp_auth import _resolve_caller_identity

        req = MagicMock()
        req.state.user_identity = None
        self.assertEqual(_resolve_caller_identity(req), "cli")


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


def _dashboard_flow(**overrides):
    from ark_api.services.mcp_auth_persistence import FlowState

    defaults = dict(
        auth_id="aid-123", state_param="st1", verifier="v" * 64,
        status="pending", message="", expires_at="2030-01-01T00:00:00Z",
        caller_identity="cli", token_expires_at="",
        server_name="notion-mcp", namespace="team-a",
        client_id="cid", client_secret="csec",
        secret_name="notion-mcp-tokens", redirect_on_complete=True,
    )
    defaults.update(overrides)
    return FlowState(**defaults)


class TestAuthCallbackDashboardRedirect(_AuthBase):
    def _enable_dashboard(self, url="https://ark.example.com"):
        patcher = patch.dict("os.environ", {"ARK_API_DASHBOARD_URL": url}, clear=False)
        patcher.start()
        mcp_auth_config.reset_mcp_auth_config()
        self.addCleanup(mcp_auth_config.reset_mcp_auth_config)
        self.addCleanup(patcher.stop)

    @patch("ark_api.api.v1.mcp_auth.mark_flow_authorized", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.annotate_mcpserver_authorized", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.write_token_secret", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.exchange_code", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_flow_state_by_state_param", new_callable=AsyncMock)
    def test_success_redirects_with_auth_id(
        self, mock_read_flow, mock_exchange, _mock_write, mock_annotate, _mock_mark
    ):
        from ark_api.services.oauth_token import TokenResponse

        self._enable_dashboard()
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
        loc = response.headers["location"]
        self.assertTrue(loc.startswith("https://ark.example.com/mcp?"))
        self.assertIn("authorized=notion-mcp", loc)
        self.assertIn("namespace=team-a", loc)
        self.assertIn("auth_id=aid-123", loc)
        mock_annotate.assert_awaited_once()
        self.assertEqual(mock_annotate.await_args.args[2], "alice@example.com")

    @patch("ark_api.api.v1.mcp_auth.mark_flow_failed", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_flow_state_by_state_param", new_callable=AsyncMock)
    def test_idp_error_redirects_with_capped_desc(self, mock_read_flow, _mock_failed):
        self._enable_dashboard()
        mock_read_flow.return_value = _dashboard_flow()
        long_desc = "x" * 500
        response = self.client.get(
            "/v1/mcp/auth/callback",
            params={"state": "team-a.st1", "error": "access_denied", "error_description": long_desc},
            follow_redirects=False,
        )
        self.assertEqual(response.status_code, 302, response.text)
        loc = response.headers["location"]
        self.assertIn("auth_error=access_denied", loc)
        self.assertNotIn("auth_id=", loc)
        from urllib.parse import parse_qs, urlsplit

        desc = parse_qs(urlsplit(loc).query)["auth_error_desc"][0]
        self.assertEqual(len(desc), 200)

    @patch("ark_api.api.v1.mcp_auth.mark_flow_failed", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_flow_state_by_state_param", new_callable=AsyncMock)
    def test_idp_error_desc_uses_percent_encoding(self, mock_read_flow, _mock_failed):
        self._enable_dashboard()
        mock_read_flow.return_value = _dashboard_flow()
        response = self.client.get(
            "/v1/mcp/auth/callback",
            params={"state": "team-a.st1", "error": "access_denied", "error_description": "User declined"},
            follow_redirects=False,
        )
        self.assertIn("auth_error_desc=User%20declined", response.headers["location"])

    @patch("ark_api.api.v1.mcp_auth.mark_flow_failed", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.exchange_code", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_flow_state_by_state_param", new_callable=AsyncMock)
    def test_token_exchange_failure_redirects(self, mock_read_flow, mock_exchange, _mock_failed):
        from ark_api.services.oauth_token import TokenExchangeError

        self._enable_dashboard()
        mock_read_flow.return_value = _dashboard_flow()
        mock_exchange.side_effect = TokenExchangeError("token endpoint 400")

        patcher, _ = _patch_ark_client(_build_typed_mcp())
        with patcher:
            response = self.client.get(
                "/v1/mcp/auth/callback",
                params={"state": "team-a.st1", "code": "the-code"},
                follow_redirects=False,
            )
        self.assertEqual(response.status_code, 302, response.text)
        self.assertIn("auth_error=token_exchange_failed", response.headers["location"])

    @patch("ark_api.api.v1.mcp_auth.read_flow_state_by_state_param", new_callable=AsyncMock)
    def test_cache_miss_with_dashboard_url_redirects_expired(self, mock_read_flow):
        self._enable_dashboard()
        mock_read_flow.return_value = None
        response = self.client.get(
            "/v1/mcp/auth/callback",
            params={"state": "team-a.unknown", "code": "x"},
            follow_redirects=False,
        )
        self.assertEqual(response.status_code, 302, response.text)
        loc = response.headers["location"]
        self.assertEqual(loc, "https://ark.example.com/mcp?auth_error=expired")

    @patch("ark_api.api.v1.mcp_auth.read_flow_state_by_state_param", new_callable=AsyncMock)
    def test_cache_miss_without_dashboard_url_renders_html(self, mock_read_flow):
        mock_read_flow.return_value = None
        response = self.client.get(
            "/v1/mcp/auth/callback",
            params={"state": "team-a.unknown", "code": "x"},
            follow_redirects=False,
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Unknown or expired state", response.text)

    @patch("ark_api.api.v1.mcp_auth.mark_flow_authorized", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.annotate_mcpserver_authorized", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.write_token_secret", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.exchange_code", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_flow_state_by_state_param", new_callable=AsyncMock)
    def test_cli_flow_renders_html_even_with_dashboard_url(
        self, mock_read_flow, mock_exchange, _mock_write, mock_annotate, _mock_mark
    ):
        from ark_api.services.oauth_token import TokenResponse

        self._enable_dashboard()
        mock_read_flow.return_value = _dashboard_flow(redirect_on_complete=False, caller_identity="cli")
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
        self.assertEqual(mock_annotate.await_args.args[2], "cli")

    @patch("ark_api.api.v1.mcp_auth.mark_flow_authorized", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.annotate_mcpserver_authorized", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.write_token_secret", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.exchange_code", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_flow_state_by_state_param", new_callable=AsyncMock)
    def test_path_prefix_dashboard_url_and_open_redirect_guard(
        self, mock_read_flow, mock_exchange, _mock_write, _mock_annotate, _mock_mark
    ):
        from ark_api.services.oauth_token import TokenResponse

        self._enable_dashboard("https://ark.example.com/dashboard")
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
                    "redirect_uri": "https://evil.example/steal",
                },
                follow_redirects=False,
            )
        self.assertEqual(response.status_code, 302, response.text)
        loc = response.headers["location"]
        self.assertTrue(loc.startswith("https://ark.example.com/dashboard/mcp?"))
        self.assertNotIn("evil.example", loc)


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


class TestEnsureTokenSecretRef(unittest.IsolatedAsyncioTestCase):
    async def test_preset_name_is_preserved(self):
        from ark_api.services.mcp_auth_persistence import ensure_mcpserver_token_secret_ref

        mcp = MagicMock()
        mcp.to_dict.return_value = {
            "metadata": {"name": "svc"},
            "spec": {"authorization": {"tokenSecretRef": {"name": "custom"}}},
        }
        client = AsyncMock()
        client.mcpservers.a_get = AsyncMock(return_value=mcp)

        result = await ensure_mcpserver_token_secret_ref(client, "svc")

        self.assertEqual(result, "custom")
        client.mcpservers.a_update.assert_not_awaited()

    @patch("ark_api.services.mcp_auth_persistence.MCPServerV1alpha1")
    async def test_absent_ref_defaults_to_name_oauth(self, mock_model):
        from ark_api.services.mcp_auth_persistence import ensure_mcpserver_token_secret_ref

        mcp = MagicMock()
        mcp.to_dict.return_value = {"metadata": {"name": "svc"}, "spec": {"authorization": {}}}
        client = AsyncMock()
        client.mcpservers.a_get = AsyncMock(return_value=mcp)

        result = await ensure_mcpserver_token_secret_ref(client, "svc")

        self.assertEqual(result, "svc-oauth")
        client.mcpservers.a_update.assert_awaited_once()
        sent = mock_model.call_args.kwargs
        self.assertEqual(sent["spec"]["authorization"]["tokenSecretRef"]["name"], "svc-oauth")

    @patch("ark_api.services.mcp_auth_persistence.MCPServerV1alpha1")
    async def test_retries_on_conflict_then_succeeds(self, mock_model):
        from kubernetes_asyncio.client.rest import ApiException

        from ark_api.services.mcp_auth_persistence import ensure_mcpserver_token_secret_ref

        def _fresh_mcp(*_args, **_kwargs):
            mcp = MagicMock()
            mcp.to_dict.return_value = {
                "metadata": {"name": "svc"},
                "spec": {"authorization": {}},
            }
            return mcp

        client = AsyncMock()
        client.mcpservers.a_get = AsyncMock(side_effect=_fresh_mcp)
        client.mcpservers.a_update = AsyncMock(
            side_effect=[ApiException(status=409), None]
        )

        result = await ensure_mcpserver_token_secret_ref(client, "svc")

        self.assertEqual(result, "svc-oauth")
        self.assertEqual(client.mcpservers.a_get.await_count, 2)
        self.assertEqual(client.mcpservers.a_update.await_count, 2)

    @patch("ark_api.services.mcp_auth_persistence.MCPServerV1alpha1")
    async def test_non_conflict_error_is_not_retried(self, mock_model):
        from kubernetes_asyncio.client.rest import ApiException

        from ark_api.services.mcp_auth_persistence import ensure_mcpserver_token_secret_ref

        mcp = MagicMock()
        mcp.to_dict.return_value = {"metadata": {"name": "svc"}, "spec": {"authorization": {}}}
        client = AsyncMock()
        client.mcpservers.a_get = AsyncMock(return_value=mcp)
        client.mcpservers.a_update = AsyncMock(side_effect=ApiException(status=403))

        with self.assertRaises(ApiException):
            await ensure_mcpserver_token_secret_ref(client, "svc")

        client.mcpservers.a_update.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
