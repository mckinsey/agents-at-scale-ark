"""Tests for the marketplace-sources CRUD and permission probe endpoints."""
import json
import unittest
from contextlib import ExitStack, asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from kubernetes_asyncio.client.rest import ApiException

from src.ark_api.api.v1.marketplace_sources import router

app = FastAPI()
app.include_router(router, prefix="/v1")
client = TestClient(app)

MODULE = "src.ark_api.api.v1.marketplace_sources"


@asynccontextmanager
async def _fake_api_client(impersonation=None):
    yield MagicMock()


def _patch_core(mock_core):
    """Patch the impersonated API client and CoreV1Api to use mock_core."""
    stack = ExitStack()
    stack.enter_context(patch(f"{MODULE}.get_impersonating_api_client", _fake_api_client))
    stack.enter_context(patch(f"{MODULE}.client.CoreV1Api", return_value=mock_core))
    return stack


class TestMarketplaceSourcesCrud(unittest.TestCase):
    def test_list_parses_configmap_entries(self):
        mock_core = MagicMock()
        mock_core.read_namespaced_config_map = AsyncMock(
            return_value=SimpleNamespace(
                data={
                    "internal-mirror": json.dumps(
                        {"url": "https://example.com/marketplace.json", "displayName": "Internal"}
                    )
                }
            )
        )
        with _patch_core(mock_core):
            response = client.get("/v1/namespaces/team-a/marketplace-sources")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            [
                {
                    "name": "internal-mirror",
                    "url": "https://example.com/marketplace.json",
                    "displayName": "Internal",
                }
            ],
        )

    def test_list_returns_empty_when_configmap_absent(self):
        mock_core = MagicMock()
        mock_core.read_namespaced_config_map = AsyncMock(side_effect=ApiException(status=404))
        with _patch_core(mock_core):
            response = client.get("/v1/namespaces/team-a/marketplace-sources")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_create_rejects_non_https_url(self):
        response = client.post(
            "/v1/namespaces/team-a/marketplace-sources",
            json={"name": "x", "url": "http://example.com/marketplace.json"},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("url", response.text)

    def test_create_rejects_malformed_url(self):
        response = client.post(
            "/v1/namespaces/team-a/marketplace-sources",
            json={"name": "x", "url": "https://"},
        )
        self.assertEqual(response.status_code, 422)

    def test_create_when_configmap_absent_uses_server_side_apply(self):
        mock_core = MagicMock()
        mock_core.read_namespaced_config_map = AsyncMock(side_effect=ApiException(status=404))
        mock_core.patch_namespaced_config_map = AsyncMock(return_value=None)
        with _patch_core(mock_core):
            response = client.post(
                "/v1/namespaces/team-a/marketplace-sources",
                json={"name": "internal", "url": "https://example.com/marketplace.json"},
            )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["name"], "internal")
        mock_core.patch_namespaced_config_map.assert_awaited_once()
        kwargs = mock_core.patch_namespaced_config_map.await_args.kwargs
        self.assertEqual(kwargs["_content_type"], "application/apply-patch+yaml")
        self.assertEqual(kwargs["field_manager"], "ark-api-source-internal")
        self.assertTrue(kwargs["force"])

    def test_update_uses_server_side_apply_with_force(self):
        mock_core = MagicMock()
        mock_core.read_namespaced_config_map = AsyncMock(
            return_value=SimpleNamespace(data={"internal": "{}"})
        )
        mock_core.patch_namespaced_config_map = AsyncMock(return_value=None)
        with _patch_core(mock_core):
            response = client.patch(
                "/v1/namespaces/team-a/marketplace-sources/internal",
                json={"url": "https://example.com/marketplace.json"},
            )
        self.assertEqual(response.status_code, 200)
        kwargs = mock_core.patch_namespaced_config_map.await_args.kwargs
        self.assertEqual(kwargs["_content_type"], "application/apply-patch+yaml")
        self.assertEqual(kwargs["field_manager"], "ark-api-source-internal")
        self.assertTrue(kwargs["force"])

    def test_create_existing_key_conflicts(self):
        mock_core = MagicMock()
        mock_core.read_namespaced_config_map = AsyncMock(
            return_value=SimpleNamespace(data={"internal": "{}"})
        )
        with _patch_core(mock_core):
            response = client.post(
                "/v1/namespaces/team-a/marketplace-sources",
                json={"name": "internal", "url": "https://example.com/marketplace.json"},
            )
        self.assertEqual(response.status_code, 409)

    def test_delete_without_permission_propagates_403(self):
        mock_core = MagicMock()
        mock_core.read_namespaced_config_map = AsyncMock(
            return_value=SimpleNamespace(data={"internal": "{}"})
        )
        mock_core.patch_namespaced_config_map = AsyncMock(
            side_effect=ApiException(status=403, reason="Forbidden")
        )
        with _patch_core(mock_core):
            response = client.delete("/v1/namespaces/team-a/marketplace-sources/internal")
        self.assertEqual(response.status_code, 403)

    def test_delete_missing_key_returns_404(self):
        mock_core = MagicMock()
        mock_core.read_namespaced_config_map = AsyncMock(
            return_value=SimpleNamespace(data={"other": "{}"})
        )
        with _patch_core(mock_core):
            response = client.delete("/v1/namespaces/team-a/marketplace-sources/internal")
        self.assertEqual(response.status_code, 404)


class TestMarketplacePermissionProbe(unittest.TestCase):
    def _run(self, allowed=None, raises=None):
        mock_auth = MagicMock()
        if raises is not None:
            mock_auth.create_self_subject_access_review = AsyncMock(side_effect=raises)
        else:
            mock_auth.create_self_subject_access_review = AsyncMock(
                return_value=SimpleNamespace(status=SimpleNamespace(allowed=allowed))
            )
        with patch(f"{MODULE}.get_impersonating_api_client", _fake_api_client), patch(
            f"{MODULE}.client.AuthorizationV1Api", return_value=mock_auth
        ):
            return client.get("/v1/namespaces/team-a/marketplace-sources/permissions")

    def test_can_edit_true(self):
        response = self._run(allowed=True)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"canEdit": True})

    def test_can_edit_false(self):
        response = self._run(allowed=False)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"canEdit": False})

    def test_ssar_failure_fails_closed(self):
        response = self._run(raises=ApiException(status=500, reason="boom"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"canEdit": False})


if __name__ == "__main__":
    unittest.main()
