"""Route-level tests for the inline authoring guard.

`test_tools_inline.py` covers the guard function; these cover the four write
paths that call it. The generic `/resources` routes matter as much as the typed
ones: they reach the same Tool CRD, so an ungated generic route would be a way
around the typed endpoint's rule.
"""
from __future__ import annotations

import os
import unittest
from unittest.mock import AsyncMock, Mock, patch

from fastapi.testclient import TestClient

os.environ["AUTH_MODE"] = "open"

from ark_sdk.impersonation import ImpersonationConfig  # noqa: E402

from ark_api.auth.dependencies import get_impersonation_config  # noqa: E402
from ark_api.main import app  # noqa: E402

INLINE_SPEC = {"type": "inline", "description": "count rows", "inline": {"source": "print(1)", "language": "python"}}
HTTP_SPEC = {"type": "http", "description": "fetch", "http": {"url": "https://example.com", "method": "GET"}}


def make_awaitable(return_value):
    async def _awaitable(*_args, **_kwargs):
        return return_value

    return _awaitable


def tool_dict(spec: dict) -> dict:
    return {
        "metadata": {"name": "csv", "namespace": "default"},
        "spec": spec,
        "status": {"state": "Pending"},
    }


class InlineRouteTestCase(unittest.TestCase):
    """Impersonation on, identity supplied per test."""

    def setUp(self):
        os.environ["IMPERSONATION_ENABLED"] = "true"
        self.client = TestClient(app)

    def tearDown(self):
        os.environ.pop("IMPERSONATION_ENABLED", None)
        app.dependency_overrides.pop(get_impersonation_config, None)

    def as_user(self, username: str | None):
        app.dependency_overrides[get_impersonation_config] = lambda: (
            ImpersonationConfig(username=username) if username else None
        )


class TestTypedToolRoutes(InlineRouteTestCase):
    def test_create_without_identity_is_rejected(self):
        self.as_user(None)
        with patch("ark_api.api.v1.tools.with_ark_client") as ark_client:
            response = self.client.post("/v1/tools", json={"name": "csv", "namespace": "default", "spec": INLINE_SPEC})
        self.assertEqual(response.status_code, 403)
        # The write must be refused before any client is built, or a denied
        # inline write could still reach Kubernetes as the service account.
        ark_client.assert_not_called()

    def test_create_with_identity_reaches_kubernetes(self):
        self.as_user("alice")
        created = Mock()
        created.to_dict.return_value = tool_dict(INLINE_SPEC)
        ark = AsyncMock()
        ark.tools.a_create = AsyncMock(return_value=created)

        with patch("ark_api.api.v1.tools.with_ark_client") as ark_client:
            ark_client.return_value.__aenter__.return_value = ark
            response = self.client.post("/v1/tools", json={"name": "csv", "namespace": "default", "spec": INLINE_SPEC})

        self.assertEqual(response.status_code, 200, response.text)
        ark.tools.a_create.assert_awaited_once()

    def test_non_inline_create_needs_no_identity(self):
        self.as_user(None)
        created = Mock()
        created.to_dict.return_value = tool_dict(HTTP_SPEC)
        ark = AsyncMock()
        ark.tools.a_create = AsyncMock(return_value=created)

        with patch("ark_api.api.v1.tools.with_ark_client") as ark_client:
            ark_client.return_value.__aenter__.return_value = ark
            response = self.client.post("/v1/tools", json={"name": "fetch", "namespace": "default", "spec": HTTP_SPEC})

        self.assertEqual(response.status_code, 200, response.text)

    def test_update_that_adds_inline_source_is_rejected(self):
        self.as_user(None)
        existing = Mock()
        existing.to_dict.return_value = tool_dict(HTTP_SPEC)
        ark = AsyncMock()
        ark.tools.a_get = AsyncMock(return_value=existing)
        ark.tools.a_update = AsyncMock()

        with patch("ark_api.api.v1.tools.with_ark_client") as ark_client:
            ark_client.return_value.__aenter__.return_value = ark
            response = self.client.put("/v1/tools/csv", json={"spec": INLINE_SPEC})

        self.assertEqual(response.status_code, 403)
        ark.tools.a_update.assert_not_awaited()

    def test_update_that_removes_inline_source_is_rejected(self):
        # The stored object decides too: dropping inline source is an inline
        # change, and an unauthorized caller must not be able to make it.
        self.as_user(None)
        existing = Mock()
        existing.to_dict.return_value = tool_dict(INLINE_SPEC)
        ark = AsyncMock()
        ark.tools.a_get = AsyncMock(return_value=existing)
        ark.tools.a_update = AsyncMock()

        with patch("ark_api.api.v1.tools.with_ark_client") as ark_client:
            ark_client.return_value.__aenter__.return_value = ark
            response = self.client.put("/v1/tools/csv", json={"spec": HTTP_SPEC})

        self.assertEqual(response.status_code, 403)
        ark.tools.a_update.assert_not_awaited()

    def test_update_with_identity_is_stored(self):
        self.as_user("alice")
        existing = Mock()
        existing.to_dict.return_value = tool_dict(INLINE_SPEC)
        updated = Mock()
        updated.to_dict.return_value = tool_dict(INLINE_SPEC)
        ark = AsyncMock()
        ark.tools.a_get = AsyncMock(return_value=existing)
        ark.tools.a_update = AsyncMock(return_value=updated)

        with patch("ark_api.api.v1.tools.with_ark_client") as ark_client:
            ark_client.return_value.__aenter__.return_value = ark
            response = self.client.put("/v1/tools/csv", json={"spec": INLINE_SPEC})

        self.assertEqual(response.status_code, 200, response.text)
        ark.tools.a_update.assert_awaited_once()


    def test_get_returns_the_inline_source(self):
        self.as_user("alice")
        stored = Mock()
        stored.to_dict.return_value = tool_dict(INLINE_SPEC)
        ark = AsyncMock()
        ark.tools.a_get = AsyncMock(return_value=stored)

        with patch("ark_api.api.v1.tools.with_ark_client") as ark_client:
            ark_client.return_value.__aenter__.return_value = ark
            response = self.client.get("/v1/tools/csv")

        self.assertEqual(response.status_code, 200, response.text)
        # The detail route is the one place the script body is returned.
        self.assertEqual(response.json()["spec"]["inline"], INLINE_SPEC["inline"])

    def test_metadata_only_update_needs_no_inline_identity(self):
        # Labels and annotations are not executable source, so a metadata-only
        # write must not require the authoring grant.
        self.as_user(None)
        existing = Mock()
        existing.to_dict.return_value = tool_dict(INLINE_SPEC)
        updated = Mock()
        updated.to_dict.return_value = tool_dict(INLINE_SPEC)
        ark = AsyncMock()
        ark.tools.a_get = AsyncMock(return_value=existing)
        ark.tools.a_update = AsyncMock(return_value=updated)

        with patch("ark_api.api.v1.tools.with_ark_client") as ark_client:
            ark_client.return_value.__aenter__.return_value = ark
            response = self.client.put(
                "/v1/tools/csv",
                json={"labels": {"team": "a"}, "annotations": {"note": "renamed"}},
            )

        self.assertEqual(response.status_code, 200, response.text)
        ark.tools.a_update.assert_awaited_once()


@patch("ark_api.api.v1.client_utils.create_api_client")
@patch("ark_api.api.v1.resources.DynamicClient")
@patch("ark_api.api.v1.resources.get_context")
class TestGenericResourceRoutes(InlineRouteTestCase):
    """The generic routes must not be a way around the typed endpoint."""

    TOOL_PATH = "/v1/resources/apis/ark.mckinsey.com/v1alpha1/Tool"

    def wire(self, mock_get_context, mock_dynamic_client_cls, mock_api_client, stored_spec=None):
        mock_get_context.return_value = {"namespace": "default"}
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()

        dynamic_client = AsyncMock()
        mock_dynamic_client_cls.side_effect = make_awaitable(dynamic_client)

        api_resource = AsyncMock()
        stored = Mock()
        stored.metadata.resourceVersion = "42"
        stored.to_dict.return_value = tool_dict(stored_spec or INLINE_SPEC)
        result = Mock()
        result.to_dict.return_value = tool_dict(stored_spec or INLINE_SPEC)
        api_resource.get = AsyncMock(return_value=stored)
        api_resource.create = AsyncMock(return_value=result)
        api_resource.replace = AsyncMock(return_value=result)
        dynamic_client.resources.get = AsyncMock(return_value=api_resource)
        return api_resource

    def test_create_without_identity_is_rejected(self, get_ctx, dyn, api_client):
        api_resource = self.wire(get_ctx, dyn, api_client)
        self.as_user(None)

        response = self.client.post(self.TOOL_PATH, json={"metadata": {"name": "csv"}, "spec": INLINE_SPEC})

        self.assertEqual(response.status_code, 403)
        api_resource.create.assert_not_awaited()

    def test_update_without_identity_is_rejected(self, get_ctx, dyn, api_client):
        api_resource = self.wire(get_ctx, dyn, api_client)
        self.as_user(None)

        response = self.client.put(
            f"{self.TOOL_PATH}/csv",
            json={"metadata": {"name": "csv", "resourceVersion": "42"}, "spec": INLINE_SPEC},
        )

        self.assertEqual(response.status_code, 403)
        api_resource.replace.assert_not_awaited()

    def test_update_is_checked_against_the_stored_inline_spec(self, get_ctx, dyn, api_client):
        # Submitted spec is innocent, stored spec is inline: still an inline
        # change, so it needs the identity.
        api_resource = self.wire(get_ctx, dyn, api_client, stored_spec=INLINE_SPEC)
        self.as_user(None)

        response = self.client.put(
            f"{self.TOOL_PATH}/csv",
            json={"metadata": {"name": "csv", "resourceVersion": "42"}, "spec": HTTP_SPEC},
        )

        self.assertEqual(response.status_code, 403)
        api_resource.replace.assert_not_awaited()

    def test_update_with_identity_is_stored(self, get_ctx, dyn, api_client):
        api_resource = self.wire(get_ctx, dyn, api_client)
        self.as_user("alice")

        response = self.client.put(
            f"{self.TOOL_PATH}/csv",
            json={"metadata": {"name": "csv", "resourceVersion": "42"}, "spec": INLINE_SPEC},
        )

        self.assertEqual(response.status_code, 200, response.text)
        api_resource.replace.assert_awaited_once()

    def test_non_tool_resources_are_unaffected(self, get_ctx, dyn, api_client):
        api_resource = self.wire(get_ctx, dyn, api_client, stored_spec=HTTP_SPEC)
        self.as_user(None)

        response = self.client.post(
            "/v1/resources/apis/ark.mckinsey.com/v1alpha1/Agent",
            json={"metadata": {"name": "a1"}, "spec": {"prompt": "hi"}},
        )

        self.assertEqual(response.status_code, 200, response.text)
        api_resource.create.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
