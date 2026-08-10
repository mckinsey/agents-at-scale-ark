"""Tests for the marketplace-sources CRUD and permission probe endpoints."""
import json
import unittest
from contextlib import ExitStack, asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
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


def _entry(url, display_name=None, auth=None):
    value = {"url": url}
    if display_name:
        value["displayName"] = display_name
    if auth:
        value["auth"] = auth
    return json.dumps(value)


def _patch_core(mock_core, validate_ok=True, can_edit=True):
    """Patch the impersonated API client, CoreV1Api, the SSAR probe, and the validate fetch."""
    stack = ExitStack()
    stack.enter_context(patch(f"{MODULE}.get_impersonating_api_client", _fake_api_client))
    stack.enter_context(patch(f"{MODULE}.client.CoreV1Api", return_value=mock_core))
    mock_auth = MagicMock()
    mock_auth.create_self_subject_access_review = AsyncMock(
        return_value=SimpleNamespace(status=SimpleNamespace(allowed=can_edit))
    )
    stack.enter_context(patch(f"{MODULE}.client.AuthorizationV1Api", return_value=mock_auth))
    if validate_ok is True:
        stack.enter_context(patch(f"{MODULE}.fetch_manifest", AsyncMock(return_value={"items": []})))
    elif validate_ok is not None:
        # validate_ok is an exception instance to raise from the fetch.
        stack.enter_context(patch(f"{MODULE}.fetch_manifest", AsyncMock(side_effect=validate_ok)))
    return stack


class TestMarketplaceSourcesCrud(unittest.TestCase):
    def test_list_parses_configmap_entries(self):
        mock_core = MagicMock()
        mock_core.read_namespaced_config_map = AsyncMock(
            return_value=SimpleNamespace(
                data={
                    "internal-mirror": _entry(
                        "https://example.com/marketplace.json", "Internal"
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
                    "auth": None,
                    "hasCredential": False,
                }
            ],
        )

    def test_list_exposes_auth_scheme_and_flag_not_value(self):
        mock_core = MagicMock()
        mock_core.read_namespaced_config_map = AsyncMock(
            return_value=SimpleNamespace(
                data={
                    "priv": _entry(
                        "https://example.com/marketplace.json",
                        auth={"scheme": "bearer", "secretRef": "marketplace-source-priv-auth"},
                    )
                }
            )
        )
        with _patch_core(mock_core):
            response = client.get("/v1/namespaces/team-a/marketplace-sources")
        self.assertEqual(response.status_code, 200)
        entry = response.json()[0]
        self.assertEqual(entry["auth"], {"scheme": "bearer"})
        self.assertTrue(entry["hasCredential"])
        # The secretRef and any credential value are not leaked to the client.
        self.assertNotIn("secretRef", response.text)

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
        self.assertFalse(response.json()["hasCredential"])
        mock_core.patch_namespaced_config_map.assert_awaited_once()
        kwargs = mock_core.patch_namespaced_config_map.await_args.kwargs
        self.assertEqual(kwargs["_content_type"], "application/apply-patch+yaml")
        self.assertEqual(kwargs["field_manager"], "ark-api-source-internal")
        self.assertTrue(kwargs["force"])

    def test_update_uses_server_side_apply_with_force(self):
        mock_core = MagicMock()
        mock_core.read_namespaced_config_map = AsyncMock(
            return_value=SimpleNamespace(
                data={"internal": _entry("https://old.example.com/marketplace.json")}
            )
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
            return_value=SimpleNamespace(
                data={"internal": _entry("https://example.com/marketplace.json")}
            )
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
            return_value=SimpleNamespace(
                data={"internal": _entry("https://example.com/marketplace.json")}
            )
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
            return_value=SimpleNamespace(
                data={"other": _entry("https://example.com/marketplace.json")}
            )
        )
        with _patch_core(mock_core):
            response = client.delete("/v1/namespaces/team-a/marketplace-sources/internal")
        self.assertEqual(response.status_code, 404)


class TestMarketplaceSourceAuth(unittest.TestCase):
    """Credential storage, validate-before-save, re-auth, lifecycle (7.2/7.6/7.7)."""

    def test_create_with_credential_stores_secret_not_in_configmap(self):
        mock_core = MagicMock()
        mock_core.read_namespaced_config_map = AsyncMock(side_effect=ApiException(status=404))
        mock_core.patch_namespaced_config_map = AsyncMock(return_value=None)
        mock_core.patch_namespaced_secret = AsyncMock(return_value=None)
        with _patch_core(mock_core):
            response = client.post(
                "/v1/namespaces/team-a/marketplace-sources",
                json={
                    "name": "priv",
                    "url": "https://example.com/marketplace.json",
                    "auth": {"scheme": "bearer", "credential": "tok123"},
                },
            )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["auth"], {"scheme": "bearer"})
        self.assertTrue(body["hasCredential"])
        # The credential is never echoed back.
        self.assertNotIn("tok123", response.text)
        # The Secret holds the token...
        secret_args = mock_core.patch_namespaced_secret.await_args
        self.assertEqual(secret_args.args[0], "marketplace-source-priv-auth")
        self.assertEqual(secret_args.args[2]["stringData"]["value"], "tok123")
        # ...and the ConfigMap entry holds only the scheme + ref, never the token.
        cm_body = mock_core.patch_namespaced_config_map.await_args.args[2]
        value_json = cm_body["data"]["priv"]
        self.assertNotIn("tok123", value_json)
        stored = json.loads(value_json)
        self.assertEqual(stored["auth"]["scheme"], "bearer")
        self.assertEqual(stored["auth"]["secretRef"], "marketplace-source-priv-auth")

    def test_create_credential_rejected_blocks_save(self):
        mock_core = MagicMock()
        mock_core.read_namespaced_config_map = AsyncMock(side_effect=ApiException(status=404))
        mock_core.patch_namespaced_config_map = AsyncMock(return_value=None)
        mock_core.patch_namespaced_secret = AsyncMock(return_value=None)
        rejected = httpx.HTTPStatusError(
            "401",
            request=httpx.Request("GET", "https://example.com"),
            response=httpx.Response(401, request=httpx.Request("GET", "https://example.com")),
        )
        with _patch_core(mock_core, validate_ok=rejected):
            response = client.post(
                "/v1/namespaces/team-a/marketplace-sources",
                json={
                    "name": "priv",
                    "url": "https://example.com/marketplace.json",
                    "auth": {"scheme": "bearer", "credential": "bad"},
                },
            )
        self.assertEqual(response.status_code, 400)
        # Nothing persisted.
        mock_core.patch_namespaced_secret.assert_not_awaited()
        mock_core.patch_namespaced_config_map.assert_not_awaited()

    def test_create_auth_without_credential_rejected(self):
        mock_core = MagicMock()
        mock_core.read_namespaced_config_map = AsyncMock(side_effect=ApiException(status=404))
        with _patch_core(mock_core):
            response = client.post(
                "/v1/namespaces/team-a/marketplace-sources",
                json={
                    "name": "priv",
                    "url": "https://example.com/marketplace.json",
                    "auth": {"scheme": "bearer"},
                },
            )
        self.assertEqual(response.status_code, 400)

    def test_create_with_credential_denied_returns_403_before_validate(self):
        mock_core = MagicMock()
        mock_core.read_namespaced_config_map = AsyncMock(side_effect=ApiException(status=404))
        mock_core.patch_namespaced_config_map = AsyncMock(return_value=None)
        mock_core.patch_namespaced_secret = AsyncMock(return_value=None)
        fetch = AsyncMock(return_value={"items": []})
        with _patch_core(mock_core, validate_ok=None, can_edit=False), patch(
            f"{MODULE}.fetch_manifest", fetch
        ):
            response = client.post(
                "/v1/namespaces/team-a/marketplace-sources",
                json={
                    "name": "priv",
                    "url": "https://internal.example.com/marketplace.json",
                    "auth": {"scheme": "bearer", "credential": "tok"},
                },
            )
        self.assertEqual(response.status_code, 403)
        fetch.assert_not_called()
        mock_core.patch_namespaced_secret.assert_not_awaited()
        mock_core.patch_namespaced_config_map.assert_not_awaited()

    def test_update_url_change_requires_resupplied_credential(self):
        mock_core = MagicMock()
        mock_core.read_namespaced_config_map = AsyncMock(
            return_value=SimpleNamespace(
                data={
                    "priv": _entry(
                        "https://old.example.com/marketplace.json",
                        auth={"scheme": "bearer", "secretRef": "marketplace-source-priv-auth"},
                    )
                }
            )
        )
        with _patch_core(mock_core):
            response = client.patch(
                "/v1/namespaces/team-a/marketplace-sources/priv",
                json={
                    "url": "https://new.example.com/marketplace.json",
                    "auth": {"scheme": "bearer"},
                },
            )
        self.assertEqual(response.status_code, 400)
        self.assertIn("URL", response.text)

    def test_update_clearing_credential_deletes_secret(self):
        mock_core = MagicMock()
        mock_core.read_namespaced_config_map = AsyncMock(
            return_value=SimpleNamespace(
                data={
                    "priv": _entry(
                        "https://example.com/marketplace.json",
                        auth={"scheme": "bearer", "secretRef": "marketplace-source-priv-auth"},
                    )
                }
            )
        )
        mock_core.patch_namespaced_config_map = AsyncMock(return_value=None)
        mock_core.delete_namespaced_secret = AsyncMock(return_value=None)
        with _patch_core(mock_core):
            response = client.patch(
                "/v1/namespaces/team-a/marketplace-sources/priv",
                json={"url": "https://example.com/marketplace.json"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["hasCredential"])
        mock_core.delete_namespaced_secret.assert_awaited_once()
        self.assertEqual(
            mock_core.delete_namespaced_secret.await_args.args[0],
            "marketplace-source-priv-auth",
        )

    def test_delete_source_removes_credential_secret(self):
        mock_core = MagicMock()
        mock_core.read_namespaced_config_map = AsyncMock(
            return_value=SimpleNamespace(
                data={
                    "priv": _entry(
                        "https://example.com/marketplace.json",
                        auth={"scheme": "bearer", "secretRef": "marketplace-source-priv-auth"},
                    )
                }
            )
        )
        mock_core.patch_namespaced_config_map = AsyncMock(return_value=None)
        mock_core.delete_namespaced_secret = AsyncMock(return_value=None)
        with _patch_core(mock_core):
            response = client.delete("/v1/namespaces/team-a/marketplace-sources/priv")
        self.assertEqual(response.status_code, 204)
        mock_core.delete_namespaced_secret.assert_awaited_once()
        self.assertEqual(
            mock_core.delete_namespaced_secret.await_args.args[0],
            "marketplace-source-priv-auth",
        )

    def test_delete_anonymous_source_does_not_touch_secrets(self):
        mock_core = MagicMock()
        mock_core.read_namespaced_config_map = AsyncMock(
            return_value=SimpleNamespace(
                data={"open": _entry("https://example.com/marketplace.json")}
            )
        )
        mock_core.patch_namespaced_config_map = AsyncMock(return_value=None)
        mock_core.delete_namespaced_secret = AsyncMock(return_value=None)
        with _patch_core(mock_core):
            response = client.delete("/v1/namespaces/team-a/marketplace-sources/open")
        self.assertEqual(response.status_code, 204)
        mock_core.delete_namespaced_secret.assert_not_awaited()


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
