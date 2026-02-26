import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from ark_api.api.v1.a2agw.query import post_query, post_query_and_wait, wait_for_query
from ark_api.constants.annotations import A2A_CONTEXT_ID_ANNOTATION


class TestA2AGatewayQuery(unittest.IsolatedAsyncioTestCase):
    @patch("ark_api.api.v1.a2agw.query.with_ark_client")
    async def test_post_query_adds_context_annotation(self, mock_with_ark_client):
        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        mock_client.queries.a_create = AsyncMock()

        await post_query(
            namespace="default",
            target_type="agent",
            target="test-agent",
            query_input="hello",
            context_id="ctx-123",
        )

        query_resource = mock_client.queries.a_create.call_args[0][0]
        self.assertIn("annotations", query_resource.metadata)
        self.assertEqual(
            query_resource.metadata["annotations"][A2A_CONTEXT_ID_ANNOTATION],
            "ctx-123",
        )

    @patch("ark_api.api.v1.a2agw.query.with_ark_client")
    async def test_post_query_with_messages_payload(self, mock_with_ark_client):
        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        mock_client.queries.a_create = AsyncMock()
        messages = [{"role": "user", "content": "hello"}]

        await post_query(
            namespace="default",
            target_type="agent",
            target="test-agent",
            query_input=messages,
            query_type="messages",
        )

        query_resource = mock_client.queries.a_create.call_args[0][0]
        spec = query_resource.spec.to_dict() if hasattr(query_resource.spec, "to_dict") else query_resource.spec.__dict__
        self.assertEqual(spec["type"], "messages")
        self.assertEqual(spec["input"], messages)

    @patch("ark_api.api.v1.a2agw.query.with_ark_client")
    async def test_wait_for_query_returns_context_id(self, mock_with_ark_client):
        response = SimpleNamespace(content="done", a2a=SimpleNamespace(contextId="ctx-new"))
        status = SimpleNamespace(phase="done", response=response)
        query_status = SimpleNamespace(status=status)

        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        mock_client.queries.a_get = AsyncMock(return_value=query_status)

        result = await wait_for_query("default", "query-1", timeout=1)

        self.assertEqual(result.content, "done")
        self.assertEqual(result.context_id, "ctx-new")

    @patch("ark_api.api.v1.a2agw.query.with_ark_client")
    async def test_wait_for_query_accepts_session_id_alias(self, mock_with_ark_client):
        response = SimpleNamespace(content="done", a2a={"sessionId": "ctx-from-session"})
        status = SimpleNamespace(phase="done", response=response)
        query_status = SimpleNamespace(status=status)

        mock_client = AsyncMock()
        mock_with_ark_client.return_value.__aenter__.return_value = mock_client
        mock_client.queries.a_get = AsyncMock(return_value=query_status)

        result = await wait_for_query("default", "query-1", timeout=1)

        self.assertEqual(result.content, "done")
        self.assertEqual(result.context_id, "ctx-from-session")

    @patch("ark_api.api.v1.a2agw.query.wait_for_query", new_callable=AsyncMock)
    @patch("ark_api.api.v1.a2agw.query.post_query", new_callable=AsyncMock)
    async def test_post_query_and_wait_passes_context(self, mock_post_query, mock_wait_for_query):
        mock_post_query.return_value = "query-1"
        mock_wait_for_query.return_value = SimpleNamespace(content="ok", context_id="ctx-1")

        result = await post_query_and_wait(
            namespace="default",
            target_type="agent",
            target="test-agent",
            query_input="hello",
            query_type="user",
            context_id="ctx-1",
        )

        self.assertEqual(result.context_id, "ctx-1")
        call_kwargs = mock_post_query.call_args.kwargs
        self.assertEqual(call_kwargs["context_id"], "ctx-1")
