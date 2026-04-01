"""Tests for streaming support check logic."""

import os
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

os.environ["AUTH_MODE"] = "open"

from ark_api.utils.streaming_support import check_streaming_support


class TestCheckStreamingSupport(unittest.IsolatedAsyncioTestCase):

    async def test_non_agent_target_returns_true(self):
        result = await check_streaming_support("model", "gpt-4", "default")
        self.assertTrue(result)

    async def test_team_target_returns_true(self):
        result = await check_streaming_support("team", "my-team", "default")
        self.assertTrue(result)

    @patch("ark_api.utils.streaming_support.with_ark_client")
    async def test_agent_without_execution_engine_returns_true(self, mock_with_ark_client):
        mock_client = AsyncMock()
        mock_agent = MagicMock()
        mock_agent.to_dict.return_value = {"spec": {}}
        mock_client.agents.a_get = AsyncMock(return_value=mock_agent)
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client

        result = await check_streaming_support("agent", "test-agent", "default")
        self.assertTrue(result)

    @patch("ark_api.utils.streaming_support.with_ark_client")
    async def test_agent_with_a2a_engine_returns_true(self, mock_with_ark_client):
        mock_client = AsyncMock()
        mock_agent = MagicMock()
        mock_agent.to_dict.return_value = {
            "spec": {"executionEngine": {"name": "a2a"}}
        }
        mock_client.agents.a_get = AsyncMock(return_value=mock_agent)
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client

        result = await check_streaming_support("agent", "test-agent", "default")
        self.assertTrue(result)

    @patch("ark_api.utils.streaming_support.with_ark_client")
    async def test_named_engine_without_annotation_returns_false(self, mock_with_ark_client):
        mock_v1alpha1_client = AsyncMock()
        mock_agent = MagicMock()
        mock_agent.to_dict.return_value = {
            "spec": {"executionEngine": {"name": "executor-langchain"}}
        }
        mock_v1alpha1_client.agents.a_get = AsyncMock(return_value=mock_agent)

        mock_prealpha1_client = AsyncMock()
        mock_engine = MagicMock()
        mock_engine.to_dict.return_value = {
            "metadata": {"annotations": {}}
        }
        mock_prealpha1_client.executionengines.a_get = AsyncMock(return_value=mock_engine)

        call_count = 0
        async def mock_ctx(namespace, version):
            nonlocal call_count
            call_count += 1
            ctx = AsyncMock()
            if call_count == 1:
                ctx.__aenter__.return_value = mock_v1alpha1_client
            else:
                ctx.__aenter__.return_value = mock_prealpha1_client
            return ctx

        mock_with_ark_client.side_effect = lambda ns, v: (
            _make_ctx(mock_v1alpha1_client) if v == "v1alpha1" else _make_ctx(mock_prealpha1_client)
        )

        result = await check_streaming_support("agent", "test-agent", "default")
        self.assertFalse(result)

    @patch("ark_api.utils.streaming_support.with_ark_client")
    async def test_named_engine_with_streaming_annotation_returns_true(self, mock_with_ark_client):
        mock_v1alpha1_client = AsyncMock()
        mock_agent = MagicMock()
        mock_agent.to_dict.return_value = {
            "spec": {"executionEngine": {"name": "executor-custom"}}
        }
        mock_v1alpha1_client.agents.a_get = AsyncMock(return_value=mock_agent)

        mock_prealpha1_client = AsyncMock()
        mock_engine = MagicMock()
        mock_engine.to_dict.return_value = {
            "metadata": {
                "annotations": {"ark.mckinsey.com/streaming-supported": "true"}
            }
        }
        mock_prealpha1_client.executionengines.a_get = AsyncMock(return_value=mock_engine)

        mock_with_ark_client.side_effect = lambda ns, v: (
            _make_ctx(mock_v1alpha1_client) if v == "v1alpha1" else _make_ctx(mock_prealpha1_client)
        )

        result = await check_streaming_support("agent", "test-agent", "default")
        self.assertTrue(result)

    @patch("ark_api.utils.streaming_support.with_ark_client")
    async def test_named_engine_with_null_annotations_returns_false(self, mock_with_ark_client):
        mock_v1alpha1_client = AsyncMock()
        mock_agent = MagicMock()
        mock_agent.to_dict.return_value = {
            "spec": {"executionEngine": {"name": "executor-langchain"}}
        }
        mock_v1alpha1_client.agents.a_get = AsyncMock(return_value=mock_agent)

        mock_prealpha1_client = AsyncMock()
        mock_engine = MagicMock()
        mock_engine.to_dict.return_value = {
            "metadata": {"annotations": None}
        }
        mock_prealpha1_client.executionengines.a_get = AsyncMock(return_value=mock_engine)

        mock_with_ark_client.side_effect = lambda ns, v: (
            _make_ctx(mock_v1alpha1_client) if v == "v1alpha1" else _make_ctx(mock_prealpha1_client)
        )

        result = await check_streaming_support("agent", "test-agent", "default")
        self.assertFalse(result)

    @patch("ark_api.utils.streaming_support.with_ark_client")
    async def test_agent_fetch_failure_returns_true(self, mock_with_ark_client):
        mock_client = AsyncMock()
        mock_client.agents.a_get = AsyncMock(side_effect=Exception("not found"))
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client

        result = await check_streaming_support("agent", "missing-agent", "default")
        self.assertTrue(result)

    @patch("ark_api.utils.streaming_support.with_ark_client")
    async def test_named_engine_with_custom_namespace(self, mock_with_ark_client):
        mock_v1alpha1_client = AsyncMock()
        mock_agent = MagicMock()
        mock_agent.to_dict.return_value = {
            "spec": {"executionEngine": {"name": "executor-custom", "namespace": "other-ns"}}
        }
        mock_v1alpha1_client.agents.a_get = AsyncMock(return_value=mock_agent)

        mock_prealpha1_client = AsyncMock()
        mock_engine = MagicMock()
        mock_engine.to_dict.return_value = {
            "metadata": {"annotations": {}}
        }
        mock_prealpha1_client.executionengines.a_get = AsyncMock(return_value=mock_engine)

        calls = []
        mock_with_ark_client.side_effect = lambda ns, v: (
            calls.append((ns, v)) or
            _make_ctx(mock_v1alpha1_client) if v == "v1alpha1" else _make_ctx(mock_prealpha1_client)
        )

        result = await check_streaming_support("agent", "test-agent", "default")
        self.assertFalse(result)
        engine_call = [c for c in calls if c[1] == "v1prealpha1"]
        if engine_call:
            self.assertEqual(engine_call[0][0], "other-ns")


def _make_ctx(client):
    ctx = AsyncMock()
    ctx.__aenter__.return_value = client
    return ctx
