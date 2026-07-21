"""Tests for cursor pagination across list endpoints."""
import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from fastapi.testclient import TestClient

os.environ["AUTH_MODE"] = "open"

from ark_api.api.v1.pagination import DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT


def _page(items, continue_token=None, remaining_item_count=None):
    """Build a fake ListResult page returned by a_list_page."""
    return SimpleNamespace(
        items=items,
        continue_token=continue_token,
        remaining_item_count=remaining_item_count,
    )


def _item(name):
    """Minimal CR object exposing to_dict() with name+namespace."""
    obj = Mock()
    obj.to_dict.return_value = {
        "metadata": {"name": name, "namespace": "default"},
        "spec": {},
        "status": {},
    }
    return obj


class PaginationTestBase(unittest.TestCase):
    def setUp(self):
        from ark_api.main import app
        self.client = TestClient(app)

    def _patch(self, module, attr, page_result):
        """Patch with_ark_client in the given endpoint module.

        Returns the a_list_page AsyncMock so callers can assert on its args.
        """
        list_page = AsyncMock(return_value=page_result)
        resource = SimpleNamespace(a_list_page=list_page)
        ark = SimpleNamespace(**{attr: resource})
        ctx = AsyncMock()
        ctx.__aenter__.return_value = ark
        ctx.__aexit__.return_value = None
        patcher = patch(f"ark_api.api.v1.{module}.with_ark_client", return_value=ctx)
        patcher.start()
        self.addCleanup(patcher.stop)
        return list_page


class TestAgentsPagination(PaginationTestBase):
    """Full coverage on the agents endpoint (representative of all 8)."""

    def test_default_limit_forwarded(self):
        list_page = self._patch("agents", "agents", _page([_item("a1")]))
        r = self.client.get("/v1/agents?namespace=default")
        self.assertEqual(r.status_code, 200)
        _, kwargs = list_page.call_args
        self.assertEqual(kwargs["limit"], DEFAULT_PAGE_LIMIT)
        self.assertIsNone(kwargs["continue_token"])

    def test_explicit_limit_forwarded(self):
        list_page = self._patch("agents", "agents", _page([_item("a1")]))
        r = self.client.get("/v1/agents?namespace=default&limit=5")
        self.assertEqual(r.status_code, 200)
        _, kwargs = list_page.call_args
        self.assertEqual(kwargs["limit"], 5)

    def test_continue_token_forwarded(self):
        list_page = self._patch("agents", "agents", _page([_item("a1")]))
        r = self.client.get("/v1/agents?namespace=default&continue=tok-123")
        self.assertEqual(r.status_code, 200)
        _, kwargs = list_page.call_args
        self.assertEqual(kwargs["continue_token"], "tok-123")

    def test_response_exposes_continue_token(self):
        self._patch(
            "agents", "agents",
            _page([_item("a1"), _item("a2")], continue_token="next", remaining_item_count=7),
        )
        r = self.client.get("/v1/agents?namespace=default")
        body = r.json()
        self.assertEqual(body["count"], 2)
        self.assertEqual(body["continue_token"], "next")
        self.assertEqual(body["remaining_item_count"], 7)

    def test_last_page_continue_token_null(self):
        self._patch("agents", "agents", _page([_item("a1")]))
        r = self.client.get("/v1/agents?namespace=default")
        body = r.json()
        self.assertIsNone(body["continue_token"])
        self.assertIsNone(body["remaining_item_count"])

    def test_limit_zero_rejected(self):
        self._patch("agents", "agents", _page([]))
        r = self.client.get("/v1/agents?namespace=default&limit=0")
        self.assertEqual(r.status_code, 422)

    def test_limit_over_max_rejected(self):
        self._patch("agents", "agents", _page([]))
        r = self.client.get(f"/v1/agents?namespace=default&limit={MAX_PAGE_LIMIT + 1}")
        self.assertEqual(r.status_code, 422)


if __name__ == "__main__":
    unittest.main()
