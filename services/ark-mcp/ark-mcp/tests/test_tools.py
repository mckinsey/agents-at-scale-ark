"""Tests for Query creation in ark_mcp.tools."""
import unittest
from contextlib import asynccontextmanager
from unittest import mock

from ark_mcp.tools import QueryCreate, QueryTarget, create_query_sdk


class TestCreateQuerySdk(unittest.IsolatedAsyncioTestCase):
    async def test_sends_single_target_in_spec(self):
        ark_client = mock.MagicMock()
        ark_client.queries.a_create = mock.AsyncMock(return_value=mock.MagicMock(to_dict=lambda: {}))

        @asynccontextmanager
        async def fake_ark_client(namespace, version):
            yield ark_client

        query = QueryCreate(
            name="test-query",
            input="What is 2+2?",
            namespace="test-namespace",
            target=QueryTarget(type="agent", name="simple-agent"),
        )
        with mock.patch("ark_mcp.tools.with_ark_client", fake_ark_client):
            await create_query_sdk(query)

        spec = ark_client.queries.a_create.await_args.args[0].to_dict()["spec"]
        self.assertEqual(spec["target"], {"type": "agent", "name": "simple-agent"})
        self.assertNotIn("targets", spec)


if __name__ == "__main__":
    unittest.main()
