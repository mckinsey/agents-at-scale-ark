"""Tests for memory-messages endpoint."""
import os
import unittest
from unittest.mock import patch, AsyncMock, MagicMock

os.environ["AUTH_MODE"] = "open"

from fastapi.testclient import TestClient
from ark_api.main import app

client = TestClient(app)


def _make_memory_dict(name: str, address: str = "http://broker:3000") -> dict:
    return {
        "metadata": {"name": name},
        "status": {"lastResolvedAddress": address},
    }


class TestListMemoryMessages(unittest.TestCase):

    @patch("ark_api.api.v1.memories.fetch_memory_service_data", new_callable=AsyncMock)
    @patch("ark_api.api.v1.memories.get_all_memory_resources", new_callable=AsyncMock)
    @patch("ark_api.api.v1.memories.with_ark_client")
    def test_reads_items_key_from_broker_response(
        self, mock_with_client, mock_get_memories, mock_fetch
    ):
        mock_ctx = MagicMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=MagicMock())
        mock_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_with_client.return_value = mock_ctx

        mock_get_memories.return_value = [_make_memory_dict("mem-1")]
        mock_fetch.return_value = {
            "items": [
                {
                    "timestamp": "2026-06-11T10:00:00",
                    "conversation_id": "conv-1",
                    "query_id": "q-1",
                    "message": {"role": "user", "content": "hello"},
                    "sequence": 1,
                }
            ],
            "total": 1,
            "hasMore": False,
            "nextCursor": None,
        }

        response = client.get("/v1/memory-messages")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["items"]), 1)
        self.assertEqual(data["items"][0]["memoryName"], "mem-1")
        self.assertEqual(data["items"][0]["conversationId"], "conv-1")

    @patch("ark_api.api.v1.memories.fetch_memory_service_data", new_callable=AsyncMock)
    @patch("ark_api.api.v1.memories.get_all_memory_resources", new_callable=AsyncMock)
    @patch("ark_api.api.v1.memories.with_ark_client")
    def test_legacy_messages_key_is_ignored(
        self, mock_with_client, mock_get_memories, mock_fetch
    ):
        mock_ctx = MagicMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=MagicMock())
        mock_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_with_client.return_value = mock_ctx

        mock_get_memories.return_value = [_make_memory_dict("mem-1")]
        mock_fetch.return_value = {
            "messages": [
                {
                    "timestamp": "2026-06-11T10:00:00",
                    "conversation_id": "conv-1",
                    "query_id": "q-1",
                    "message": {"role": "user", "content": "hello"},
                    "sequence": 1,
                }
            ]
        }

        response = client.get("/v1/memory-messages")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["items"]), 0)

    @patch("ark_api.api.v1.memories.fetch_memory_service_data", new_callable=AsyncMock)
    @patch("ark_api.api.v1.memories.get_all_memory_resources", new_callable=AsyncMock)
    @patch("ark_api.api.v1.memories.with_ark_client")
    def test_empty_broker_response_returns_empty_list(
        self, mock_with_client, mock_get_memories, mock_fetch
    ):
        mock_ctx = MagicMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=MagicMock())
        mock_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_with_client.return_value = mock_ctx

        mock_get_memories.return_value = [_make_memory_dict("mem-1")]
        mock_fetch.return_value = {"items": [], "total": 0, "hasMore": False, "nextCursor": None}

        response = client.get("/v1/memory-messages")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["items"], [])
