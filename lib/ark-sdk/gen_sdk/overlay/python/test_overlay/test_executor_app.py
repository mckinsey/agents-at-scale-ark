"""Tests for ExecutorApp agent card extension declaration."""

import unittest
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from google.protobuf.json_format import MessageToDict

from ark_sdk.executor import (
    AgentConfig,
    BaseExecutor,
    ExecutionEngineRequest,
    Message,
    Model,
    TokenUsage,
    begin_request_state,
)
from ark_sdk.executor_app import A2AExecutorAdapter, ExecutorApp
from ark_sdk.extensions.query import (
    QUERY_EXTENSION_METADATA_KEY,
    QUERY_EXTENSION_URI,
    QueryRef,
    QueryTargetRef,
)


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


def _make_request(user_text: str = "hi", conversation_id: str = "conv-1") -> ExecutionEngineRequest:
    return ExecutionEngineRequest(
        agent=AgentConfig(
            name="test-agent",
            namespace="default",
            prompt="You are helpful.",
            model=Model(name="gpt-4", type="openai"),
        ),
        userInput=Message(role="user", content=user_text),
        conversationId=conversation_id,
    )


class TestAdapterBrokerMessages:
    @pytest.mark.anyio
    async def test_posts_user_and_response_messages(self):
        executor = StubExecutor("test")
        adapter = A2AExecutorAdapter(executor)

        context = MagicMock()
        context.get_user_input.return_value = "hi"
        context.message.context_id = "conv-1"
        context.message.message_id = "msg-1"
        event_queue = AsyncMock()

        broker = AsyncMock()
        broker.send_messages = AsyncMock()
        broker.send_chunk = AsyncMock()
        broker.send_final_chunk = AsyncMock()
        broker.complete = AsyncMock()

        with patch(
            "ark_sdk.executor_app.extract_query_ref",
            return_value=QueryRef(name="q", namespace="ns"),
        ), patch(
            "ark_sdk.executor_app.resolve_query",
            new=AsyncMock(return_value=_make_request()),
        ), patch(
            "ark_sdk.executor_app.discover_broker_url",
            new=AsyncMock(return_value="http://broker"),
        ), patch(
            "ark_sdk.executor_app.BrokerClient",
            return_value=broker,
        ), patch(
            "ark_sdk.executor_app.QueryStatusUpdater",
            return_value=MagicMock(),
        ):
            await adapter._do_execute(context, event_queue)

        broker.send_messages.assert_awaited_once()
        conv_id, messages = broker.send_messages.await_args.args
        assert conv_id == "conv-1"
        assert messages[0]["role"] == "user"
        assert messages[0]["content"] == "hi"
        assert messages[-1]["role"] == "assistant"
        assert messages[-1]["content"] == "stub"

    @pytest.mark.anyio
    async def test_skipped_when_no_conversation_id(self):
        executor = StubExecutor("test")
        adapter = A2AExecutorAdapter(executor)

        context = MagicMock()
        context.get_user_input.return_value = "hi"
        context.message.context_id = ""
        context.message.message_id = "msg-1"
        event_queue = AsyncMock()

        broker = AsyncMock()
        broker.send_messages = AsyncMock()
        broker.send_chunk = AsyncMock()
        broker.send_final_chunk = AsyncMock()
        broker.complete = AsyncMock()

        with patch(
            "ark_sdk.executor_app.extract_query_ref",
            return_value=QueryRef(name="q", namespace="ns"),
        ), patch(
            "ark_sdk.executor_app.resolve_query",
            new=AsyncMock(return_value=_make_request(conversation_id="")),
        ), patch(
            "ark_sdk.executor_app.discover_broker_url",
            new=AsyncMock(return_value="http://broker"),
        ), patch(
            "ark_sdk.executor_app.BrokerClient",
            return_value=broker,
        ), patch(
            "ark_sdk.executor_app.QueryStatusUpdater",
            return_value=MagicMock(),
        ):
            await adapter._do_execute(context, event_queue)

        broker.send_messages.assert_not_awaited()

    @pytest.mark.anyio
    async def test_skipped_when_broker_not_configured(self):
        executor = StubExecutor("test")
        adapter = A2AExecutorAdapter(executor)

        context = MagicMock()
        context.get_user_input.return_value = "hi"
        context.message.context_id = "conv-1"
        context.message.message_id = "msg-1"
        event_queue = AsyncMock()

        with patch(
            "ark_sdk.executor_app.extract_query_ref",
            return_value=QueryRef(name="q", namespace="ns"),
        ), patch(
            "ark_sdk.executor_app.resolve_query",
            new=AsyncMock(return_value=_make_request()),
        ), patch(
            "ark_sdk.executor_app.discover_broker_url",
            new=AsyncMock(return_value=None),
        ), patch(
            "ark_sdk.executor_app.QueryStatusUpdater",
            return_value=MagicMock(),
        ):
            await adapter._do_execute(context, event_queue)


class TestAdapterBrokerFinalChunk:
    @pytest.mark.anyio
    async def test_sends_final_chunk_before_complete(self):
        executor = StubExecutor("test")
        adapter = A2AExecutorAdapter(executor)

        context = MagicMock()
        context.get_user_input.return_value = "hi"
        context.message.context_id = "conv-1"
        context.message.message_id = "msg-1"
        event_queue = AsyncMock()

        call_order: list[str] = []

        broker = AsyncMock()
        broker.send_messages = AsyncMock(side_effect=lambda *a, **k: call_order.append("messages"))
        broker.send_chunk = AsyncMock(side_effect=lambda *a, **k: call_order.append("chunk"))
        broker.send_final_chunk = AsyncMock(side_effect=lambda *a, **k: call_order.append("final"))
        broker.complete = AsyncMock(side_effect=lambda *a, **k: call_order.append("complete"))

        with patch(
            "ark_sdk.executor_app.extract_query_ref",
            return_value=QueryRef(name="q", namespace="ns"),
        ), patch(
            "ark_sdk.executor_app.resolve_query",
            new=AsyncMock(return_value=_make_request()),
        ), patch(
            "ark_sdk.executor_app.discover_broker_url",
            new=AsyncMock(return_value="http://broker"),
        ), patch(
            "ark_sdk.executor_app.BrokerClient",
            return_value=broker,
        ), patch(
            "ark_sdk.executor_app.QueryStatusUpdater",
            return_value=MagicMock(),
        ):
            await adapter._do_execute(context, event_queue)

        broker.send_final_chunk.assert_awaited_once()
        kwargs = broker.send_final_chunk.await_args.kwargs
        assert kwargs["response_text"] == "stub"
        assert kwargs["response_messages"][-1]["role"] == "assistant"
        assert kwargs["response_messages"][-1]["content"] == "stub"

        assert call_order.index("final") < call_order.index("complete")
        assert call_order.index("chunk") < call_order.index("final")

    @pytest.mark.anyio
    async def test_skipped_when_broker_not_configured(self):
        executor = StubExecutor("test")
        adapter = A2AExecutorAdapter(executor)

        context = MagicMock()
        context.get_user_input.return_value = "hi"
        context.message.context_id = "conv-1"
        context.message.message_id = "msg-1"
        event_queue = AsyncMock()

        with patch(
            "ark_sdk.executor_app.extract_query_ref",
            return_value=QueryRef(name="q", namespace="ns"),
        ), patch(
            "ark_sdk.executor_app.resolve_query",
            new=AsyncMock(return_value=_make_request()),
        ), patch(
            "ark_sdk.executor_app.discover_broker_url",
            new=AsyncMock(return_value=None),
        ), patch(
            "ark_sdk.executor_app.QueryStatusUpdater",
            return_value=MagicMock(),
        ):
            await adapter._do_execute(context, event_queue)


class TestAdapterSubTargetInvocation:
    """A target override means the caller owns the query's stream and status."""

    @pytest.mark.anyio
    async def test_sub_target_skips_broker_and_status_updater(self):
        executor = StubExecutor("test")
        adapter = A2AExecutorAdapter(executor)

        context = MagicMock()
        context.get_user_input.return_value = "hi"
        context.message.context_id = "conv-1"
        context.message.message_id = "msg-1"
        event_queue = AsyncMock()

        discover = AsyncMock(return_value="http://broker")
        broker_cls = MagicMock()
        status_cls = MagicMock()

        with patch(
            "ark_sdk.executor_app.extract_query_ref",
            return_value=QueryRef(
                name="q",
                namespace="ns",
                target=QueryTargetRef(type="agent", name="member-a"),
            ),
        ), patch(
            "ark_sdk.executor_app.resolve_query",
            new=AsyncMock(return_value=_make_request()),
        ), patch(
            "ark_sdk.executor_app.discover_broker_url",
            new=discover,
        ), patch(
            "ark_sdk.executor_app.BrokerClient",
            broker_cls,
        ), patch(
            "ark_sdk.executor_app.QueryStatusUpdater",
            status_cls,
        ):
            await adapter._do_execute(context, event_queue)

        discover.assert_not_awaited()
        broker_cls.assert_not_called()
        status_cls.assert_not_called()
        event_queue.enqueue_event.assert_awaited_once()

    @pytest.mark.anyio
    async def test_top_level_uses_broker_and_status_updater(self):
        executor = StubExecutor("test")
        adapter = A2AExecutorAdapter(executor)

        context = MagicMock()
        context.get_user_input.return_value = "hi"
        context.message.context_id = "conv-1"
        context.message.message_id = "msg-1"
        event_queue = AsyncMock()

        discover = AsyncMock(return_value="http://broker")
        broker_cls = MagicMock(return_value=AsyncMock())
        status_cls = MagicMock()

        with patch(
            "ark_sdk.executor_app.extract_query_ref",
            return_value=QueryRef(name="q", namespace="ns"),
        ), patch(
            "ark_sdk.executor_app.resolve_query",
            new=AsyncMock(return_value=_make_request()),
        ), patch(
            "ark_sdk.executor_app.discover_broker_url",
            new=discover,
        ), patch(
            "ark_sdk.executor_app.BrokerClient",
            broker_cls,
        ), patch(
            "ark_sdk.executor_app.QueryStatusUpdater",
            status_cls,
        ):
            await adapter._do_execute(context, event_queue)

        discover.assert_awaited_once()
        broker_cls.assert_called_once()
        status_cls.assert_called_once()


class TestAdapterConversationScope:
    """Each team member carries its own conversation scope in the query ref."""

    @pytest.mark.anyio
    async def test_ref_conversation_id_wins_over_context_id(self):
        executor = StubExecutor("test")
        adapter = A2AExecutorAdapter(executor)

        context = MagicMock()
        context.get_user_input.return_value = "hi"
        context.message.context_id = "parent-context"
        context.message.message_id = "msg-1"
        event_queue = AsyncMock()

        resolve = AsyncMock(return_value=_make_request())

        with patch(
            "ark_sdk.executor_app.extract_query_ref",
            return_value=QueryRef(
                name="q",
                namespace="ns",
                target=QueryTargetRef(type="agent", name="member-a"),
                conversation_id="9f2c4e1a7b8d3f50",
            ),
        ), patch(
            "ark_sdk.executor_app.resolve_query",
            new=resolve,
        ):
            await adapter._do_execute(context, event_queue)

        assert resolve.await_args.kwargs["conversation_id"] == "9f2c4e1a7b8d3f50"

    @pytest.mark.anyio
    async def test_falls_back_to_context_id_when_ref_scope_absent(self):
        executor = StubExecutor("test")
        adapter = A2AExecutorAdapter(executor)

        context = MagicMock()
        context.get_user_input.return_value = "hi"
        context.message.context_id = "parent-context"
        context.message.message_id = "msg-1"
        event_queue = AsyncMock()

        resolve = AsyncMock(return_value=_make_request())

        with patch(
            "ark_sdk.executor_app.extract_query_ref",
            return_value=QueryRef(
                name="q",
                namespace="ns",
                target=QueryTargetRef(type="agent", name="member-a"),
            ),
        ), patch(
            "ark_sdk.executor_app.resolve_query",
            new=resolve,
        ):
            await adapter._do_execute(context, event_queue)

        assert resolve.await_args.kwargs["conversation_id"] == "parent-context"

    @pytest.mark.anyio
    async def test_top_level_broker_session_uses_context_id(self):
        executor = StubExecutor("test")
        adapter = A2AExecutorAdapter(executor)

        context = MagicMock()
        context.get_user_input.return_value = "hi"
        context.message.context_id = "conv-1"
        context.message.message_id = "msg-1"
        event_queue = AsyncMock()

        broker_cls = MagicMock(return_value=AsyncMock())

        with patch(
            "ark_sdk.executor_app.extract_query_ref",
            return_value=QueryRef(name="q", namespace="ns"),
        ), patch(
            "ark_sdk.executor_app.resolve_query",
            new=AsyncMock(return_value=_make_request()),
        ), patch(
            "ark_sdk.executor_app.discover_broker_url",
            new=AsyncMock(return_value="http://broker"),
        ), patch(
            "ark_sdk.executor_app.BrokerClient",
            broker_cls,
        ), patch(
            "ark_sdk.executor_app.QueryStatusUpdater",
            return_value=MagicMock(),
        ):
            await adapter._do_execute(context, event_queue)

        assert broker_cls.call_args.kwargs["session_id"] == "conv-1"


class UsageReportingExecutor(BaseExecutor):
    async def execute_agent(self, request: ExecutionEngineRequest) -> list[Message]:
        self.report_usage(prompt_tokens=100, completion_tokens=20, cached_tokens=40)
        self.report_usage(prompt_tokens=50, completion_tokens=10)
        return [Message(role="assistant", content="stub")]


class FailingUsageReportingExecutor(BaseExecutor):
    async def execute_agent(self, request: ExecutionEngineRequest) -> list[Message]:
        self.report_usage(prompt_tokens=100, completion_tokens=20)
        raise RuntimeError("boom")


class FailingExecutor(BaseExecutor):
    async def execute_agent(self, request: ExecutionEngineRequest) -> list[Message]:
        raise RuntimeError("boom")


class TestReportUsage:
    @pytest.mark.anyio
    async def test_accumulates_across_calls(self):
        begin_request_state()
        executor = StubExecutor("test")

        executor.report_usage(prompt_tokens=100, completion_tokens=20, cached_tokens=40)
        executor.report_usage(prompt_tokens=50, completion_tokens=10)

        assert executor._token_usage == TokenUsage(
            promptTokens=150, completionTokens=30, totalTokens=180, cachedTokens=40
        )

    @pytest.mark.anyio
    async def test_unset_by_default(self):
        begin_request_state()
        assert StubExecutor("test")._token_usage is None

    def test_engine_metadata_uses_snake_case_keys(self):
        usage = TokenUsage(promptTokens=3, completionTokens=2, totalTokens=5, cachedTokens=1)
        assert usage.to_engine_metadata() == {
            "prompt_tokens": 3,
            "completion_tokens": 2,
            "total_tokens": 5,
            "cached_tokens": 1,
        }


async def _run_adapter(executor: BaseExecutor, conversation_id: str = "conv-1"):
    adapter = A2AExecutorAdapter(executor)

    context = MagicMock()
    context.get_user_input.return_value = "hi"
    context.message.context_id = conversation_id
    context.message.message_id = "msg-1"
    event_queue = AsyncMock()

    broker = AsyncMock()

    with patch(
        "ark_sdk.executor_app.extract_query_ref",
        return_value=QueryRef(name="q", namespace="ns"),
    ), patch(
        "ark_sdk.executor_app.resolve_query",
        new=AsyncMock(return_value=_make_request(conversation_id=conversation_id)),
    ), patch(
        "ark_sdk.executor_app.discover_broker_url",
        new=AsyncMock(return_value="http://broker"),
    ), patch(
        "ark_sdk.executor_app.BrokerClient",
        return_value=broker,
    ), patch(
        "ark_sdk.executor_app.QueryStatusUpdater",
        return_value=MagicMock(),
    ):
        await adapter._do_execute(context, event_queue)

    response_msg = event_queue.enqueue_event.await_args.args[0]
    return broker, MessageToDict(response_msg.metadata).get(QUERY_EXTENSION_METADATA_KEY, {})


class TestAdapterResponseMetadata:
    @pytest.mark.anyio
    async def test_reports_token_usage_to_controller(self):
        _, meta = await _run_adapter(UsageReportingExecutor("test"))

        assert meta["tokenUsage"] == {
            "prompt_tokens": 150,
            "completion_tokens": 30,
            "total_tokens": 180,
            "cached_tokens": 40,
        }

    @pytest.mark.anyio
    async def test_reports_response_messages_and_conversation_id(self):
        _, meta = await _run_adapter(StubExecutor("test"))

        assert meta["messages"] == [{"role": "assistant", "content": "stub"}]
        assert meta["conversationId"] == "conv-1"

    @pytest.mark.anyio
    async def test_omits_token_usage_when_not_reported(self):
        _, meta = await _run_adapter(StubExecutor("test"))

        assert "tokenUsage" not in meta

    @pytest.mark.anyio
    async def test_omits_conversation_id_when_unthreaded(self):
        _, meta = await _run_adapter(StubExecutor("test"), conversation_id="")

        assert "conversationId" not in meta

    @pytest.mark.anyio
    async def test_reports_token_usage_to_broker(self):
        broker, _ = await _run_adapter(UsageReportingExecutor("test"))

        assert broker.send_final_chunk.await_args.kwargs["token_usage"] == {
            "promptTokens": 150,
            "completionTokens": 30,
            "totalTokens": 180,
            "cachedTokens": 40,
        }

    @pytest.mark.anyio
    async def test_broker_token_usage_none_when_not_reported(self):
        broker, _ = await _run_adapter(StubExecutor("test"))

        assert broker.send_final_chunk.await_args.kwargs["token_usage"] is None

    @pytest.mark.anyio
    async def test_reports_token_usage_on_execution_error(self):
        _, meta = await _run_adapter(FailingUsageReportingExecutor("test"))

        assert meta == {
            "tokenUsage": {
                "prompt_tokens": 100,
                "completion_tokens": 20,
                "total_tokens": 120,
                "cached_tokens": 0,
            },
        }

    @pytest.mark.anyio
    async def test_omits_metadata_on_execution_error_without_usage(self):
        _, meta = await _run_adapter(FailingExecutor("test"))

        assert meta == {}

    @pytest.mark.anyio
    async def test_usage_does_not_leak_after_execution_error(self):
        executor = FailingUsageReportingExecutor("test")
        await _run_adapter(executor)

        assert executor._token_usage is None

    @pytest.mark.anyio
    async def test_usage_does_not_leak_into_next_request(self):
        executor = UsageReportingExecutor("test")
        await _run_adapter(executor)

        assert executor._token_usage is None


if __name__ == "__main__":
    unittest.main()
