"""Tests for /v1/queries pagination and search."""
import os
import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

os.environ["AUTH_MODE"] = "open"


def _query_item(name: str, input_text, offset_seconds: int = 0):
    """Build a fake ark_client query list item (has to_dict)."""
    item = AsyncMock()
    created = (datetime(2026, 1, 1, tzinfo=timezone.utc)
               + timedelta(seconds=offset_seconds)).isoformat().replace("+00:00", "Z")
    item.to_dict = lambda: {
        "metadata": {
            "name": name,
            "namespace": "default",
            "creationTimestamp": created,
        },
        "spec": {"type": "user", "input": input_text},
        "status": {"phase": "done"},
    }
    return item


class TestQueriesPagination(unittest.TestCase):
    def setUp(self):
        from ark_api.main import app
        self.client = TestClient(app)

    def _patch_ark_client(self, items):
        """Patch with_ark_client so queries.a_list returns the given items."""
        ark = AsyncMock()
        ark.queries.a_list = AsyncMock(return_value=items)
        ctx = AsyncMock()
        ctx.__aenter__.return_value = ark
        ctx.__aexit__.return_value = None
        return patch("ark_api.api.v1.queries.with_ark_client", return_value=ctx)

    def test_default_page_and_size(self):
        items = [_query_item(f"q-{i}", f"input {i}", i) for i in range(30)]
        with self._patch_ark_client(items):
            r = self.client.get("/v1/queries")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["page"], 1)
        self.assertEqual(body["page_size"], 25)
        self.assertEqual(body["total"], 30)
        self.assertEqual(body["count"], 25)
        self.assertEqual(len(body["items"]), 25)

    def test_page_two_returns_remainder(self):
        items = [_query_item(f"q-{i}", f"input {i}", i) for i in range(30)]
        with self._patch_ark_client(items):
            r = self.client.get("/v1/queries?page=2")
        body = r.json()
        self.assertEqual(body["page"], 2)
        self.assertEqual(body["count"], 5)
        self.assertEqual(len(body["items"]), 5)

    def test_page_size_max_100_accepted(self):
        items = [_query_item(f"q-{i}", "x", i) for i in range(200)]
        with self._patch_ark_client(items):
            r = self.client.get("/v1/queries?page_size=100")
        body = r.json()
        self.assertEqual(body["page_size"], 100)
        self.assertEqual(len(body["items"]), 100)

    def test_page_size_over_100_returns_422(self):
        with self._patch_ark_client([]):
            r = self.client.get("/v1/queries?page_size=500")
        self.assertEqual(r.status_code, 422)

    def test_page_zero_returns_422(self):
        with self._patch_ark_client([]):
            r = self.client.get("/v1/queries?page=0")
        self.assertEqual(r.status_code, 422)

    def test_page_size_zero_returns_422(self):
        with self._patch_ark_client([]):
            r = self.client.get("/v1/queries?page_size=0")
        self.assertEqual(r.status_code, 422)

    def test_page_beyond_range_returns_empty_items(self):
        items = [_query_item(f"q-{i}", f"input {i}", i) for i in range(30)]
        with self._patch_ark_client(items):
            r = self.client.get("/v1/queries?page=999")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["total"], 30)
        self.assertEqual(body["count"], 0)
        self.assertEqual(body["items"], [])
        self.assertEqual(body["page"], 999)

    def test_search_over_max_length_returns_422(self):
        with self._patch_ark_client([]):
            r = self.client.get("/v1/queries?search=" + "a" * 201)
        self.assertEqual(r.status_code, 422)

    def test_sort_newest_first(self):
        items = [
            _query_item("old", "old", 0),
            _query_item("new", "new", 1000),
            _query_item("mid", "mid", 500),
        ]
        with self._patch_ark_client(items):
            r = self.client.get("/v1/queries")
        names = [it["name"] for it in r.json()["items"]]
        self.assertEqual(names, ["new", "mid", "old"])

    def test_search_string_input_case_insensitive(self):
        items = [
            _query_item("q1", "Hello World", 0),
            _query_item("q2", "goodbye", 1),
            _query_item("q3", "HELLO there", 2),
        ]
        with self._patch_ark_client(items):
            r = self.client.get("/v1/queries?search=hello")
        body = r.json()
        self.assertEqual(body["total"], 2)
        names = sorted(it["name"] for it in body["items"])
        self.assertEqual(names, ["q1", "q3"])

    def test_search_chat_messages_input(self):
        messages = [
            {"role": "user", "content": "what is the weather?"},
            {"role": "assistant", "content": "I don't know"},
        ]
        items = [
            _query_item("q1", messages, 0),
            _query_item("q2", [{"role": "user", "content": "unrelated"}], 1),
        ]
        with self._patch_ark_client(items):
            r = self.client.get("/v1/queries?search=weather")
        body = r.json()
        self.assertEqual(body["total"], 1)
        self.assertEqual(body["items"][0]["name"], "q1")

    def test_total_reflects_filtered_count(self):
        items = [_query_item(f"q-{i}", "match" if i < 3 else "no", i) for i in range(10)]
        with self._patch_ark_client(items):
            r = self.client.get("/v1/queries?search=match&page=1&page_size=2")
        body = r.json()
        self.assertEqual(body["total"], 3)
        self.assertEqual(body["count"], 2)

    def test_empty_namespace_returns_empty_page(self):
        with self._patch_ark_client([]):
            r = self.client.get("/v1/queries")
        body = r.json()
        self.assertEqual(body["total"], 0)
        self.assertEqual(body["items"], [])
        self.assertEqual(r.status_code, 200)

    def test_search_multimodal_content_parts(self):
        messages = [
            {"role": "user", "content": [
                {"type": "text", "text": "please describe this"},
                {"type": "image_url", "image_url": {"url": "http://x"}},
            ]}
        ]
        items = [
            _query_item("q1", messages, 0),
            _query_item("q2", [{"role": "user", "content": [{"type": "text", "text": "other"}]}], 1),
        ]
        with self._patch_ark_client(items):
            r = self.client.get("/v1/queries?search=describe")
        body = r.json()
        self.assertEqual(body["total"], 1)
        self.assertEqual(body["items"][0]["name"], "q1")
