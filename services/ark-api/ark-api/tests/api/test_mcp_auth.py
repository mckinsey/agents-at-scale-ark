"""Endpoint tests for the four MCP auth routes."""
from __future__ import annotations

import os
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

os.environ["AUTH_MODE"] = "open"
os.environ["ARK_API_PUBLIC_CALLBACK_URL"] = "https://ark.example.com/api/v1/mcp/auth/callback"

from fastapi.testclient import TestClient

from ark_api.core import mcp_auth_config
from ark_api.services import mcp_auth_cache


REDIRECT_URI = "https://ark.example.com/api/v1/mcp/auth/callback"
SECRET_NAME = "notion-mcp-tokens"


def _build_mcp_dict(
    *,
    name: str = "notion-mcp",
    namespace: str = "default",
    state: str | None = "Required",
    registration_endpoint: str | None = "https://idp.example.com/register",
    token_endpoint: str | None = "https://idp.example.com/token",
    authorization_endpoint: str | None = "https://idp.example.com/authorize",
    resource: str | None = "https://mcp.example/mcp",
    scopes_supported: list[str] | None = None,
    token_secret_ref: dict | None = None,
) -> dict:
    if token_secret_ref is None:
        token_secret_ref = {"name": SECRET_NAME}
    return {
        "metadata": {"name": name, "namespace": namespace},
        "spec": {"authorization": {"tokenSecretRef": token_secret_ref}},
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


def _patch_ark_client(mcp_dict: dict | None = None):
    """Patch with_ark_client used inside mcp_auth.py to yield a mock ark_client."""
    mock_client = AsyncMock()
    mcp = MagicMock()
    mcp.to_dict.return_value = mcp_dict if mcp_dict is not None else _build_mcp_dict()
    mock_client.mcpservers.a_get = AsyncMock(return_value=mcp)
    mock_client.mcpservers.a_update = AsyncMock(return_value=mcp)

    cm = AsyncMock()
    cm.__aenter__.return_value = mock_client
    cm.__aexit__.return_value = None
    patcher = patch("ark_api.api.v1.mcp_auth.with_ark_client", return_value=cm)
    return patcher, mock_client


class _AuthBase(unittest.TestCase):
    def setUp(self):
        mcp_auth_config.reset_mcp_auth_config()
        mcp_auth_cache.reset_mcp_auth_cache()
        from ark_api.main import app

        self.client = TestClient(app)

    def tearDown(self):
        mcp_auth_config.reset_mcp_auth_config()
        mcp_auth_cache.reset_mcp_auth_cache()


class TestAuthStart(_AuthBase):
    @patch("ark_api.api.v1.mcp_auth.read_cached_client_creds", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.register_client", new_callable=AsyncMock)
    def test_start_happy_path_with_dcr(self, mock_register, mock_read_creds):
        from ark_api.services.mcp_auth_persistence import CachedClientCreds
        from ark_api.services.oauth_dcr import DcrResult

        mock_read_creds.return_value = CachedClientCreds(client_id=None, client_secret=None)
        mock_register.return_value = DcrResult(
            client_id="cid",
            client_secret="csec",
            raw_response={},
        )

        patcher, _ = _patch_ark_client(_build_mcp_dict(scopes_supported=["read", "write"]))
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

    @patch("ark_api.api.v1.mcp_auth.read_cached_client_creds", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.register_client", new_callable=AsyncMock)
    def test_start_skips_dcr_when_cached_creds_present(self, mock_register, mock_read_creds):
        from ark_api.services.mcp_auth_persistence import CachedClientCreds

        mock_read_creds.return_value = CachedClientCreds(client_id="cid", client_secret="csec")

        patcher, _ = _patch_ark_client(_build_mcp_dict())
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        mock_register.assert_not_called()

    @patch("ark_api.api.v1.mcp_auth.read_cached_client_creds", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.register_client", new_callable=AsyncMock)
    def test_force_registration_triggers_dcr_even_with_cached_creds(
        self, mock_register, mock_read_creds
    ):
        from ark_api.services.mcp_auth_persistence import CachedClientCreds
        from ark_api.services.oauth_dcr import DcrResult

        mock_read_creds.return_value = CachedClientCreds(client_id="cid", client_secret="csec")
        mock_register.return_value = DcrResult(
            client_id="cid2", client_secret="csec2", raw_response={}
        )

        patcher, _ = _patch_ark_client(_build_mcp_dict())
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={"force_registration": True},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        mock_register.assert_awaited_once()

    def test_start_authorized_without_force_returns_409(self):
        patcher, _ = _patch_ark_client(_build_mcp_dict(state="Authorized"))
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 409, response.text)

    @patch("ark_api.api.v1.mcp_auth.read_cached_client_creds", new_callable=AsyncMock)
    def test_start_authorized_with_force_proceeds(self, mock_read_creds):
        from ark_api.services.mcp_auth_persistence import CachedClientCreds

        mock_read_creds.return_value = CachedClientCreds(client_id="cid", client_secret="csec")
        patcher, _ = _patch_ark_client(_build_mcp_dict(state="Authorized"))
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={"force": True},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)

    def test_start_force_registration_without_force_on_authorized_returns_409(self):
        patcher, _ = _patch_ark_client(_build_mcp_dict(state="Authorized"))
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={"force_registration": True},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 409, response.text)

    def test_start_discovery_failed_returns_422_even_with_force(self):
        patcher, _ = _patch_ark_client(_build_mcp_dict(state="DiscoveryFailed"))
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
        patcher, _ = _patch_ark_client(_build_mcp_dict(registration_endpoint=None))
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 422, response.text)

    @patch("ark_api.api.v1.mcp_auth.read_cached_client_creds", new_callable=AsyncMock)
    def test_missing_registration_endpoint_with_cached_creds_succeeds(
        self, mock_read_creds
    ):
        from ark_api.services.mcp_auth_persistence import CachedClientCreds

        mock_read_creds.return_value = CachedClientCreds(client_id="cid", client_secret="csec")
        patcher, _ = _patch_ark_client(_build_mcp_dict(registration_endpoint=None))
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

        patcher, _ = _patch_ark_client(_build_mcp_dict())
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 502, response.text)


class TestAuthCallback(_AuthBase):
    async def _seed_entry(self, **overrides):
        from ark_api.services.mcp_auth_cache import CacheEntry, get_mcp_auth_cache
        from ark_api.services.pkce import generate_auth_id, generate_state, generate_verifier
        import time as _time

        cache = get_mcp_auth_cache(600)
        entry = CacheEntry(
            auth_id=overrides.get("auth_id") or generate_auth_id(),
            state=overrides.get("state") or generate_state(),
            mcp_server_name=overrides.get("mcp_server_name", "notion-mcp"),
            namespace=overrides.get("namespace", "default"),
            verifier=overrides.get("verifier") or generate_verifier(),
            client_id=overrides.get("client_id", "cid"),
            client_secret=overrides.get("client_secret", "csec"),
            caller_identity=overrides.get("caller_identity", "cli"),
            created_at=_time.time(),
            ttl_seconds=600,
        )
        await cache.put(entry)
        return entry

    def _seed_entry_sync(self, **overrides):
        import asyncio

        return asyncio.run(self._seed_entry(**overrides))

    def test_unknown_state_returns_400_html(self):
        response = self.client.get("/v1/mcp/auth/callback", params={"state": "unknown", "code": "x"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("Unknown or expired state", response.text)

    @patch("ark_api.api.v1.mcp_auth.exchange_code", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.write_token_secret", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.annotate_mcpserver_authorized", new_callable=AsyncMock)
    def test_happy_path(self, mock_annotate, mock_write, mock_exchange):
        from ark_api.services.oauth_token import TokenResponse

        entry = self._seed_entry_sync()
        mock_exchange.return_value = TokenResponse(
            access_token="at", refresh_token="rt", expires_in=3600, raw={}
        )

        patcher, _ = _patch_ark_client(_build_mcp_dict())
        with patcher:
            response = self.client.get(
                "/v1/mcp/auth/callback",
                params={"state": entry.state, "code": "the-code"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        mock_write.assert_awaited_once()
        mock_annotate.assert_awaited_once()

    def test_second_hit_for_same_state_returns_400(self):
        import asyncio

        entry = self._seed_entry_sync()

        async def _take():
            from ark_api.services.mcp_auth_cache import get_mcp_auth_cache
            cache = get_mcp_auth_cache(600)
            await cache.take_by_state(entry.state)

        asyncio.run(_take())

        response = self.client.get(
            "/v1/mcp/auth/callback",
            params={"state": entry.state, "code": "the-code"},
        )
        self.assertEqual(response.status_code, 400, response.text)

    def test_idp_returns_error_renders_400_and_marks_failed(self):
        entry = self._seed_entry_sync()
        response = self.client.get(
            "/v1/mcp/auth/callback",
            params={
                "state": entry.state,
                "error": "access_denied",
                "error_description": "<script>alert(1)</script>",
            },
        )
        self.assertEqual(response.status_code, 400, response.text)
        self.assertIn("&lt;script&gt;", response.text)
        self.assertNotIn("<script>alert(1)</script>", response.text)

    @patch("ark_api.api.v1.mcp_auth.exchange_code", new_callable=AsyncMock)
    def test_token_400_transitions_cache_to_failed(self, mock_exchange):
        from ark_api.services.oauth_token import TokenExchangeError

        entry = self._seed_entry_sync()
        mock_exchange.side_effect = TokenExchangeError("invalid_grant", error_code="invalid_grant")

        patcher, _ = _patch_ark_client(_build_mcp_dict())
        with patcher:
            response = self.client.get(
                "/v1/mcp/auth/callback",
                params={"state": entry.state, "code": "the-code"},
            )
        self.assertEqual(response.status_code, 400, response.text)

    @patch("ark_api.api.v1.mcp_auth.exchange_code", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.write_token_secret", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.annotate_mcpserver_authorized", new_callable=AsyncMock)
    def test_expires_in_missing_does_not_pass_expires_at(
        self, mock_annotate, mock_write, mock_exchange
    ):
        from ark_api.services.oauth_token import TokenResponse

        entry = self._seed_entry_sync()
        mock_exchange.return_value = TokenResponse(
            access_token="at", refresh_token=None, expires_in=None, raw={}
        )

        patcher, _ = _patch_ark_client(_build_mcp_dict())
        with patcher, self.assertLogs("ark_api.services.mcp_auth_persistence", level="WARNING"):
            response = self.client.get(
                "/v1/mcp/auth/callback",
                params={"state": entry.state, "code": "the-code"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        payload = mock_write.await_args.kwargs["payload"]
        self.assertIsNone(payload.expires_at)


class TestAuthStatus(_AuthBase):
    def _seed_entry_sync(self, **overrides):
        import asyncio
        from ark_api.services.mcp_auth_cache import CacheEntry, get_mcp_auth_cache
        from ark_api.services.pkce import generate_auth_id, generate_state, generate_verifier
        import time as _time

        async def _put():
            cache = get_mcp_auth_cache(600)
            entry = CacheEntry(
                auth_id=overrides.get("auth_id") or generate_auth_id(),
                state=overrides.get("state") or generate_state(),
                mcp_server_name=overrides.get("mcp_server_name", "notion-mcp"),
                namespace=overrides.get("namespace", "default"),
                verifier=generate_verifier(),
                client_id="cid",
                client_secret="csec",
                caller_identity="cli",
                created_at=_time.time(),
                ttl_seconds=600,
                flow_state=overrides.get("flow_state", "pending"),
                message=overrides.get("message"),
                token_expires_at=overrides.get("token_expires_at"),
            )
            await cache.put(entry)
            return entry

        return asyncio.run(_put())

    def test_unknown_auth_id_returns_expired(self):
        patcher, _ = _patch_ark_client(_build_mcp_dict(state="Required"))
        with patcher:
            response = self.client.get(
                "/v1/mcp-servers/notion-mcp/auth/status",
                params={"auth_id": "no-such", "namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["state"], "expired")

    def test_pending_when_cache_pending(self):
        entry = self._seed_entry_sync(flow_state="pending")
        patcher, _ = _patch_ark_client(_build_mcp_dict(state="Required"))
        with patcher:
            response = self.client.get(
                "/v1/mcp-servers/notion-mcp/auth/status",
                params={"auth_id": entry.auth_id, "namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["state"], "pending")

    def test_pending_when_cache_authorized_but_server_not_authorized(self):
        entry = self._seed_entry_sync(
            flow_state="authorized", token_expires_at="2026-01-01T00:00:00Z"
        )
        patcher, _ = _patch_ark_client(_build_mcp_dict(state="Required"))
        with patcher:
            response = self.client.get(
                "/v1/mcp-servers/notion-mcp/auth/status",
                params={"auth_id": entry.auth_id, "namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["state"], "pending")

    def test_authorized_when_both_align(self):
        entry = self._seed_entry_sync(
            flow_state="authorized", token_expires_at="2026-01-01T00:00:00Z"
        )
        patcher, _ = _patch_ark_client(_build_mcp_dict(state="Authorized"))
        with patcher:
            response = self.client.get(
                "/v1/mcp-servers/notion-mcp/auth/status",
                params={"auth_id": entry.auth_id, "namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["state"], "authorized")
        self.assertEqual(body["expires_at"], "2026-01-01T00:00:00Z")

    def test_cache_failed_wins_over_server_authorized(self):
        entry = self._seed_entry_sync(flow_state="failed", message="invalid_grant")
        patcher, _ = _patch_ark_client(_build_mcp_dict(state="Authorized"))
        with patcher:
            response = self.client.get(
                "/v1/mcp-servers/notion-mcp/auth/status",
                params={"auth_id": entry.auth_id, "namespace": "default"},
            )
        self.assertEqual(response.json()["state"], "failed")


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
        patcher, _ = _patch_ark_client(_build_mcp_dict())
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
        patcher, _ = _patch_ark_client(_build_mcp_dict())
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
        patcher, _ = _patch_ark_client(_build_mcp_dict())
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/logout",
                json={"delete_secret": True},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["deleted"])

    def test_mutual_exclusion(self):
        patcher, _ = _patch_ark_client(_build_mcp_dict())
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
        patcher, _ = _patch_ark_client(_build_mcp_dict())
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
        patcher, _ = _patch_ark_client(_build_mcp_dict())
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/logout",
                json={"delete_secret": True},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["noop"])
        mock_strip.assert_awaited_once()


class TestRedaction(_AuthBase):
    def test_logs_do_not_leak_token_material(self):
        # Drive a callback exchange end-to-end and assert no token material in logs.
        import asyncio
        from ark_api.services.mcp_auth_cache import CacheEntry, get_mcp_auth_cache
        from ark_api.services.pkce import generate_auth_id, generate_state
        import time as _time

        async def _put():
            cache = get_mcp_auth_cache(600)
            entry = CacheEntry(
                auth_id=generate_auth_id(),
                state=generate_state(),
                mcp_server_name="notion-mcp",
                namespace="default",
                verifier="V" * 64,
                client_id="cid",
                client_secret="DO-NOT-LEAK-CSEC",
                caller_identity="cli",
                created_at=_time.time(),
                ttl_seconds=600,
            )
            await cache.put(entry)
            return entry

        entry = asyncio.run(_put())

        from ark_api.services.oauth_token import TokenResponse

        with self.assertLogs(level="INFO") as ctx:
            with patch(
                "ark_api.api.v1.mcp_auth.exchange_code", new_callable=AsyncMock
            ) as mock_exchange, patch(
                "ark_api.api.v1.mcp_auth.write_token_secret", new_callable=AsyncMock
            ), patch(
                "ark_api.api.v1.mcp_auth.annotate_mcpserver_authorized", new_callable=AsyncMock
            ):
                mock_exchange.return_value = TokenResponse(
                    access_token="DO-NOT-LEAK-AT",
                    refresh_token="DO-NOT-LEAK-RT",
                    expires_in=3600,
                    raw={},
                )
                patcher, _ = _patch_ark_client(_build_mcp_dict())
                with patcher:
                    response = self.client.get(
                        "/v1/mcp/auth/callback",
                        params={"state": entry.state, "code": "the-code"},
                    )
                self.assertEqual(response.status_code, 200, response.text)

        joined = "\n".join(ctx.output)
        for needle in ("DO-NOT-LEAK-AT", "DO-NOT-LEAK-RT", "DO-NOT-LEAK-CSEC", "V" * 64):
            self.assertNotIn(needle, joined)


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

    def test_invalid_env_returns_503_for_callback(self):
        os.environ["ARK_API_MCP_AUTH_CACHE_TTL_SECONDS"] = "not-an-int"
        mcp_auth_config.reset_mcp_auth_config()
        try:
            response = self.client.get(
                "/v1/mcp/auth/callback",
                params={"state": "anything", "code": "x"},
            )
            self.assertEqual(response.status_code, 503, response.text)
        finally:
            del os.environ["ARK_API_MCP_AUTH_CACHE_TTL_SECONDS"]
            mcp_auth_config.reset_mcp_auth_config()


class TestAuthStartMissingFields(_AuthBase):
    def test_missing_authorization_endpoint_returns_422(self):
        patcher, _ = _patch_ark_client(_build_mcp_dict(authorization_endpoint=None))
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 422, response.text)

    @patch("ark_api.api.v1.mcp_auth.read_cached_client_creds", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.register_client", new_callable=AsyncMock)
    def test_force_registration_falls_back_to_cached_when_endpoint_missing(
        self, mock_register, mock_read_creds
    ):
        from ark_api.services.mcp_auth_persistence import CachedClientCreds

        mock_read_creds.return_value = CachedClientCreds(client_id="cid", client_secret="csec")
        patcher, _ = _patch_ark_client(_build_mcp_dict(registration_endpoint=None))
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={"force_registration": True},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        mock_register.assert_not_called()

    @patch("ark_api.api.v1.mcp_auth.read_cached_client_creds", new_callable=AsyncMock)
    def test_explicit_scopes_override_advertised(self, mock_read_creds):
        from ark_api.services.mcp_auth_persistence import CachedClientCreds

        mock_read_creds.return_value = CachedClientCreds(client_id="cid", client_secret="csec")
        patcher, _ = _patch_ark_client(
            _build_mcp_dict(scopes_supported=["read", "write"])
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

    def test_missing_code_marks_failed(self):
        import asyncio
        from ark_api.services.mcp_auth_cache import CacheEntry, get_mcp_auth_cache
        from ark_api.services.pkce import generate_auth_id, generate_state, generate_verifier
        import time as _time

        async def _put():
            cache = get_mcp_auth_cache(600)
            entry = CacheEntry(
                auth_id=generate_auth_id(),
                state=generate_state(),
                mcp_server_name="notion-mcp",
                namespace="default",
                verifier=generate_verifier(),
                client_id="cid",
                client_secret="csec",
                caller_identity="cli",
                created_at=_time.time(),
                ttl_seconds=600,
            )
            await cache.put(entry)
            return entry

        entry = asyncio.run(_put())
        response = self.client.get("/v1/mcp/auth/callback", params={"state": entry.state})
        self.assertEqual(response.status_code, 400)
        self.assertIn("Missing authorization code", response.text)

        async def _get():
            cache = get_mcp_auth_cache(600)
            return await cache.get_by_auth_id(entry.auth_id)

        refreshed = asyncio.run(_get())
        self.assertEqual(refreshed.flow_state, "failed")

    def test_callback_metadata_missing_marks_failed(self):
        import asyncio
        from ark_api.services.mcp_auth_cache import CacheEntry, get_mcp_auth_cache
        from ark_api.services.pkce import generate_auth_id, generate_state, generate_verifier
        import time as _time

        async def _put():
            cache = get_mcp_auth_cache(600)
            entry = CacheEntry(
                auth_id=generate_auth_id(),
                state=generate_state(),
                mcp_server_name="notion-mcp",
                namespace="default",
                verifier=generate_verifier(),
                client_id="cid",
                client_secret="csec",
                caller_identity="cli",
                created_at=_time.time(),
                ttl_seconds=600,
            )
            await cache.put(entry)
            return entry

        entry = asyncio.run(_put())
        patcher, _ = _patch_ark_client(_build_mcp_dict(token_endpoint=None))
        with patcher:
            response = self.client.get(
                "/v1/mcp/auth/callback",
                params={"state": entry.state, "code": "the-code"},
            )
        self.assertEqual(response.status_code, 400)
        self.assertIn("metadata went missing", response.text)


class TestAuthStatusExpired(_AuthBase):
    def _seed_entry_sync(self, **overrides):
        import asyncio
        from ark_api.services.mcp_auth_cache import CacheEntry, get_mcp_auth_cache
        from ark_api.services.pkce import generate_auth_id, generate_state, generate_verifier
        import time as _time

        async def _put():
            cache = get_mcp_auth_cache(600)
            entry = CacheEntry(
                auth_id=overrides.get("auth_id") or generate_auth_id(),
                state=overrides.get("state") or generate_state(),
                mcp_server_name="notion-mcp",
                namespace="default",
                verifier=generate_verifier(),
                client_id="cid",
                client_secret="csec",
                caller_identity="cli",
                created_at=_time.time(),
                ttl_seconds=600,
                flow_state=overrides.get("flow_state", "pending"),
                message=overrides.get("message"),
            )
            await cache.put(entry)
            return entry

        return asyncio.run(_put())

    def test_expired_flow_state_is_returned(self):
        entry = self._seed_entry_sync(flow_state="expired", message="ttl")
        patcher, _ = _patch_ark_client(_build_mcp_dict(state="Required"))
        with patcher:
            response = self.client.get(
                "/v1/mcp-servers/notion-mcp/auth/status",
                params={"auth_id": entry.auth_id, "namespace": "default"},
            )
        self.assertEqual(response.json()["state"], "expired")


class TestAuthLogoutNoTokenRef(_AuthBase):
    @patch("ark_api.api.v1.mcp_auth.strip_mcpserver_auth_annotations", new_callable=AsyncMock)
    def test_no_token_secret_ref_returns_noop(self, mock_strip):
        patcher, _ = _patch_ark_client(_build_mcp_dict(token_secret_ref={}))
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
    def test_delete_secret_missing_logs_noop_after_strip(self, mock_delete, mock_strip):
        mock_delete.return_value = False
        patcher, _ = _patch_ark_client(_build_mcp_dict())
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/logout",
                json={"delete_secret": True},
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


class TestAuthStartBootstrap(_AuthBase):
    """Tests for auth/start tokenSecretRef auto-provisioning (task 12.x)."""

    @patch("ark_api.api.v1.mcp_auth.bootstrap_token_secret", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_cached_client_creds", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.register_client", new_callable=AsyncMock)
    def test_no_spec_authorization_bootstraps_secret_and_proceeds(
        self, mock_register, mock_read_creds, mock_bootstrap
    ):
        from ark_api.services.mcp_auth_persistence import CachedClientCreds
        from ark_api.services.oauth_dcr import DcrResult

        mock_read_creds.return_value = CachedClientCreds(client_id=None, client_secret=None)
        mock_register.return_value = DcrResult(client_id="cid", client_secret="csec", raw_response={})
        mcp_dict = {
            "metadata": {"name": "notion-mcp", "namespace": "default"},
            "spec": {},
            "status": {
                "authorization": {
                    "state": "Required",
                    "registrationEndpoint": "https://idp.example.com/register",
                    "tokenEndpoint": "https://idp.example.com/token",
                    "authorizationEndpoint": "https://idp.example.com/authorize",
                    "resource": "https://mcp.example/mcp",
                }
            },
        }
        patcher, mock_client = _patch_ark_client(mcp_dict)
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
        mock_bootstrap.assert_awaited_once_with("default", "notion-mcp", "notion-mcp-oauth")
        mock_client.mcpservers.a_patch.assert_awaited_once_with(
            "notion-mcp",
            {"spec": {"authorization": {"tokenSecretRef": {"name": "notion-mcp-oauth"}}}},
            "default",
        )

    @patch("ark_api.api.v1.mcp_auth.bootstrap_token_secret", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_cached_client_creds", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.register_client", new_callable=AsyncMock)
    def test_empty_token_secret_ref_preserves_key_overrides(
        self, mock_register, mock_read_creds, mock_bootstrap
    ):
        from ark_api.services.mcp_auth_persistence import CachedClientCreds
        from ark_api.services.oauth_dcr import DcrResult

        mock_read_creds.return_value = CachedClientCreds(client_id=None, client_secret=None)
        mock_register.return_value = DcrResult(client_id="cid", client_secret="csec", raw_response={})
        mcp_dict = {
            "metadata": {"name": "notion-mcp", "namespace": "default"},
            "spec": {"authorization": {"tokenSecretRef": {"accessTokenKey": "MY_ACCESS"}}},
            "status": {
                "authorization": {
                    "state": "Required",
                    "registrationEndpoint": "https://idp.example.com/register",
                    "tokenEndpoint": "https://idp.example.com/token",
                    "authorizationEndpoint": "https://idp.example.com/authorize",
                    "resource": "https://mcp.example/mcp",
                }
            },
        }
        patcher, mock_client = _patch_ark_client(mcp_dict)
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        mock_bootstrap.assert_awaited_once_with("default", "notion-mcp", "notion-mcp-oauth")
        mock_client.mcpservers.a_patch.assert_awaited_once()
        _, patch_call_args, _ = mock_client.mcpservers.a_patch.mock_calls[0]
        self.assertEqual(patch_call_args[1]["spec"]["authorization"]["tokenSecretRef"]["name"], "notion-mcp-oauth")
        read_call = mock_read_creds.await_args
        self.assertEqual(read_call.args[1], "notion-mcp-oauth")
        keys_arg = read_call.args[2]
        self.assertEqual(keys_arg.access_token, "MY_ACCESS")

    @patch("ark_api.api.v1.mcp_auth.bootstrap_token_secret", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_cached_client_creds", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.register_client", new_callable=AsyncMock)
    def test_bootstrap_existing_labeled_secret_reused(
        self, mock_register, mock_read_creds, mock_bootstrap
    ):
        from ark_api.services.mcp_auth_persistence import CachedClientCreds
        from ark_api.services.oauth_dcr import DcrResult

        mock_read_creds.return_value = CachedClientCreds(client_id=None, client_secret=None)
        mock_register.return_value = DcrResult(client_id="cid", client_secret="csec", raw_response={})
        mcp_dict = {
            "metadata": {"name": "notion-mcp", "namespace": "default"},
            "spec": {},
            "status": {
                "authorization": {
                    "state": "Required",
                    "registrationEndpoint": "https://idp.example.com/register",
                    "tokenEndpoint": "https://idp.example.com/token",
                    "authorizationEndpoint": "https://idp.example.com/authorize",
                    "resource": "https://mcp.example/mcp",
                }
            },
        }
        patcher, _ = _patch_ark_client(mcp_dict)
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        mock_bootstrap.assert_awaited_once()

    @patch("ark_api.api.v1.mcp_auth.bootstrap_token_secret", new_callable=AsyncMock)
    def test_bootstrap_conflict_returns_422(self, mock_bootstrap):
        from ark_api.services.mcp_auth_persistence import BootstrapConflictError

        mock_bootstrap.side_effect = BootstrapConflictError(
            "Secret default/notion-mcp-oauth already exists without binding label"
        )
        mcp_dict = {
            "metadata": {"name": "notion-mcp", "namespace": "default"},
            "spec": {},
            "status": {
                "authorization": {
                    "state": "Required",
                    "registrationEndpoint": "https://idp.example.com/register",
                    "tokenEndpoint": "https://idp.example.com/token",
                    "authorizationEndpoint": "https://idp.example.com/authorize",
                    "resource": "https://mcp.example/mcp",
                }
            },
        }
        patcher, _ = _patch_ark_client(mcp_dict)
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 422, response.text)
        self.assertIn("binding label", response.json()["detail"])

    @patch("ark_api.api.v1.mcp_auth.bootstrap_token_secret", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.read_cached_client_creds", new_callable=AsyncMock)
    @patch("ark_api.api.v1.mcp_auth.register_client", new_callable=AsyncMock)
    def test_bootstrap_runs_regardless_of_force_flags(
        self, mock_register, mock_read_creds, mock_bootstrap
    ):
        from ark_api.services.mcp_auth_persistence import CachedClientCreds
        from ark_api.services.oauth_dcr import DcrResult

        mock_read_creds.return_value = CachedClientCreds(client_id=None, client_secret=None)
        mock_register.return_value = DcrResult(client_id="cid", client_secret="csec", raw_response={})
        mcp_dict = {
            "metadata": {"name": "notion-mcp", "namespace": "default"},
            "spec": {},
            "status": {
                "authorization": {
                    "state": "Required",
                    "registrationEndpoint": "https://idp.example.com/register",
                    "tokenEndpoint": "https://idp.example.com/token",
                    "authorizationEndpoint": "https://idp.example.com/authorize",
                    "resource": "https://mcp.example/mcp",
                }
            },
        }
        patcher, _ = _patch_ark_client(mcp_dict)
        with patcher:
            response = self.client.post(
                "/v1/mcp-servers/notion-mcp/auth/start",
                json={"force": True, "force_registration": True},
                params={"namespace": "default"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        mock_bootstrap.assert_awaited_once_with("default", "notion-mcp", "notion-mcp-oauth")


if __name__ == "__main__":
    unittest.main()
