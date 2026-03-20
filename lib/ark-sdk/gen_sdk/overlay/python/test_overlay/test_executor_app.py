"""Tests for ExecutorApp agent card extension declaration."""

import unittest
from unittest.mock import AsyncMock

from ark_sdk.executor import BaseExecutor, ExecutionEngineRequest, Message
from ark_sdk.executor_app import ExecutorApp
from ark_sdk.extensions.query import QUERY_EXTENSION_URI


class StubExecutor(BaseExecutor):
    async def execute_agent(self, request: ExecutionEngineRequest) -> list[Message]:
        return [Message(role="assistant", content="stub")]


class TestExecutorAppAgentCard(unittest.TestCase):
    def test_agent_card_includes_query_extension(self):
        app = ExecutorApp(
            executor=StubExecutor("test"),
            engine_name="test-engine",
        )
        card = app.agent_card
        self.assertIsNotNone(card.capabilities)
        self.assertIsNotNone(card.capabilities.extensions)
        self.assertEqual(len(card.capabilities.extensions), 1)

        ext = card.capabilities.extensions[0]
        self.assertEqual(ext.uri, QUERY_EXTENSION_URI)
        self.assertFalse(ext.required)

    def test_agent_card_has_correct_name(self):
        app = ExecutorApp(
            executor=StubExecutor("test"),
            engine_name="My-Engine",
        )
        self.assertEqual(app.agent_card.name, "my-engine")


if __name__ == "__main__":
    unittest.main()
