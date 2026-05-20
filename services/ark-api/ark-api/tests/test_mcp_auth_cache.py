"""Tests for the MCP auth in-flight cache."""
from __future__ import annotations

import asyncio
import time
import unittest

from ark_api.services.mcp_auth_cache import (
    CacheEntry,
    McpAuthCache,
    get_mcp_auth_cache,
    reset_mcp_auth_cache,
)


def _entry(auth_id: str, state: str, ttl: int = 600, now: float | None = None) -> CacheEntry:
    return CacheEntry(
        auth_id=auth_id,
        state=state,
        mcp_server_name="notion",
        namespace="default",
        verifier="v",
        client_id="cid",
        client_secret="csec",
        caller_identity="cli",
        created_at=now if now is not None else time.time(),
        ttl_seconds=ttl,
    )


class TestMcpAuthCache(unittest.TestCase):
    def test_put_then_get_by_auth_id(self):
        cache = McpAuthCache(ttl_seconds=600)

        async def run():
            await cache.put(_entry("a1", "s1"))
            return await cache.get_by_auth_id("a1")

        entry = asyncio.run(run())
        self.assertIsNotNone(entry)
        self.assertEqual(entry.state, "s1")

    def test_take_by_state_deletes_only_state_index(self):
        cache = McpAuthCache(ttl_seconds=600)

        async def run():
            await cache.put(_entry("a1", "s1"))
            first = await cache.take_by_state("s1")
            second_by_state = await cache.take_by_state("s1")
            still_by_auth = await cache.get_by_auth_id("a1")
            return first, second_by_state, still_by_auth

        first, second, still = asyncio.run(run())
        self.assertIsNotNone(first)
        self.assertIsNone(second)
        self.assertIsNotNone(still)

    def test_expired_entry_is_reaped(self):
        cache = McpAuthCache(ttl_seconds=1)

        async def run():
            old = _entry("old", "sold", ttl=1, now=time.time() - 5)
            await cache.put(old)
            return await cache.get_by_auth_id("old")

        self.assertIsNone(asyncio.run(run()))

    def test_mark_authorized_sets_state_and_expires_at(self):
        cache = McpAuthCache(ttl_seconds=600)

        async def run():
            await cache.put(_entry("a1", "s1"))
            await cache.mark_authorized("a1", token_expires_at="2030-01-01T00:00:00Z")
            return await cache.get_by_auth_id("a1")

        entry = asyncio.run(run())
        self.assertEqual(entry.flow_state, "authorized")
        self.assertEqual(entry.token_expires_at, "2030-01-01T00:00:00Z")

    def test_mark_failed_records_message(self):
        cache = McpAuthCache(ttl_seconds=600)

        async def run():
            await cache.put(_entry("a1", "s1"))
            await cache.mark_failed("a1", "invalid_grant")
            return await cache.get_by_auth_id("a1")

        entry = asyncio.run(run())
        self.assertEqual(entry.flow_state, "failed")
        self.assertEqual(entry.message, "invalid_grant")

    def test_ttl_seconds_property(self):
        cache = McpAuthCache(ttl_seconds=123)
        self.assertEqual(cache.ttl_seconds, 123)

    def test_mark_authorized_unknown_auth_id_is_noop(self):
        cache = McpAuthCache(ttl_seconds=600)
        asyncio.run(cache.mark_authorized("no-such", "2030-01-01T00:00:00Z"))
        self.assertIsNone(asyncio.run(cache.get_by_auth_id("no-such")))

    def test_mark_failed_unknown_auth_id_is_noop(self):
        cache = McpAuthCache(ttl_seconds=600)
        asyncio.run(cache.mark_failed("no-such", "msg"))
        self.assertIsNone(asyncio.run(cache.get_by_auth_id("no-such")))

    def test_take_by_state_unknown_returns_none(self):
        cache = McpAuthCache(ttl_seconds=600)
        self.assertIsNone(asyncio.run(cache.take_by_state("unknown")))

    def test_reset_clears_all_entries(self):
        cache = McpAuthCache(ttl_seconds=600)

        async def run():
            await cache.put(_entry("a1", "s1"))
            await cache.reset()
            return await cache.get_by_auth_id("a1")

        self.assertIsNone(asyncio.run(run()))


class TestSingleton(unittest.TestCase):
    def setUp(self):
        reset_mcp_auth_cache()

    def tearDown(self):
        reset_mcp_auth_cache()

    def test_get_returns_same_instance(self):
        first = get_mcp_auth_cache(600)
        second = get_mcp_auth_cache(600)
        self.assertIs(first, second)

    def test_reset_drops_singleton(self):
        first = get_mcp_auth_cache(600)
        reset_mcp_auth_cache()
        second = get_mcp_auth_cache(600)
        self.assertIsNot(first, second)


if __name__ == "__main__":
    unittest.main()
