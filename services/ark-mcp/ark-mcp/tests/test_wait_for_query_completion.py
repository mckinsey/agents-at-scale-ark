"""Tests for wait_for_query_completion_sdk terminal phase handling."""
import unittest
from unittest.mock import AsyncMock, patch

from ark_mcp.tools import wait_for_query_completion_sdk


class TestWaitForQueryCompletion(unittest.IsolatedAsyncioTestCase):
    async def _wait_with_phase(self, phase: str):
        query = {"status": {"phase": phase}}
        with patch("ark_mcp.tools.get_query_sdk", new=AsyncMock(return_value=query)):
            return await wait_for_query_completion_sdk("q", "default", timeout_seconds=1, poll_interval=0)

    async def test_cancelled_is_terminal(self):
        result = await self._wait_with_phase("cancelled")

        self.assertEqual(result["phase"], "cancelled")
        self.assertFalse(result["success"])

    async def test_legacy_canceled_is_terminal(self):
        result = await self._wait_with_phase("canceled")

        self.assertEqual(result["phase"], "canceled")
        self.assertFalse(result["success"])

    async def test_done_is_successful(self):
        result = await self._wait_with_phase("done")

        self.assertTrue(result["success"])


if __name__ == "__main__":
    unittest.main()
