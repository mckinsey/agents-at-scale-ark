"""Tests for streaming tool invocations from an executor to the broker."""

import asyncio
import datetime
import json
import pathlib
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from ark_sdk.broker import BrokerClient
from ark_sdk.executor import (
    AgentConfig,
    BaseExecutor,
    ExecutionEngineRequest,
    Message,
    Model,
)
from ark_sdk.executor_app import A2AExecutorAdapter
from ark_sdk.extensions.query import QueryRef


def _make_request(
    conversation_id: str = "conv-1", agent_name: str = "test-agent"
) -> ExecutionEngineRequest:
    return ExecutionEngineRequest(
        agent=AgentConfig(
            name=agent_name,
            namespace="default",
            prompt="You are helpful.",
            model=Model(name="claude", type="anthropic"),
        ),
        userInput=Message(role="user", content="list the files"),
        conversationId=conversation_id,
    )


class ToolCallingExecutor(BaseExecutor):
    async def execute_agent(self, request: ExecutionEngineRequest) -> list[Message]:
        await self.stream_tool_call(
            name="Bash",
            arguments={"command": "ls"},
            tool_call_id="toolu_1",
        )
        await self.stream_tool_call(
            name="Read",
            arguments={"path": "/tmp/out.txt"},
            tool_call_id="toolu_2",
        )
        return [Message(role="assistant", content="done")]


_REAL_ASYNC_CLIENT = httpx.AsyncClient


def _capturing_transport(captured: list):
    def handler(request: httpx.Request) -> httpx.Response:
        captured.append((str(request.url), request.content))
        return httpx.Response(200)

    def factory(*args, **kwargs):
        return _REAL_ASYNC_CLIENT(transport=httpx.MockTransport(handler))

    return factory


def _stream_chunks(captured: list) -> list[dict]:
    chunks = []
    for url, body in captured:
        if "/stream/" not in url or url.endswith("/complete"):
            continue
        for line in body.decode().splitlines():
            if line.strip():
                chunks.append(json.loads(line))
    return chunks


async def _run_executor(executor: BaseExecutor, captured: list) -> None:
    adapter = A2AExecutorAdapter(executor)

    context = MagicMock()
    context.get_user_input.return_value = "list the files"
    context.message.context_id = "conv-1"
    context.message.message_id = "msg-1"

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
        "ark_sdk.executor_app.QueryStatusUpdater",
        return_value=MagicMock(),
    ), patch(
        "ark_sdk.broker.httpx.AsyncClient",
        _capturing_transport(captured),
    ):
        await adapter._do_execute(context, AsyncMock())


class TestToolCallsOnTheWire:
    @pytest.mark.anyio
    async def test_tool_calls_reach_the_broker(self):
        captured: list = []
        await _run_executor(ToolCallingExecutor("test"), captured)

        tool_chunks = [
            c for c in _stream_chunks(captured)
            if c["choices"][0]["delta"].get("tool_calls")
        ]
        assert len(tool_chunks) == 2

        first = tool_chunks[0]["choices"][0]["delta"]["tool_calls"][0]
        assert first["id"] == "toolu_1"
        assert first["type"] == "function"
        assert first["function"]["name"] == "Bash"
        assert json.loads(first["function"]["arguments"]) == {"command": "ls"}

        second = tool_chunks[1]["choices"][0]["delta"]["tool_calls"][0]
        assert second["id"] == "toolu_2"
        assert second["function"]["name"] == "Read"

    @pytest.mark.anyio
    async def test_tool_call_indices_are_distinct(self):
        captured: list = []
        await _run_executor(ToolCallingExecutor("test"), captured)

        indices = [
            c["choices"][0]["delta"]["tool_calls"][0]["index"]
            for c in _stream_chunks(captured)
            if c["choices"][0]["delta"].get("tool_calls")
        ]
        assert indices == [0, 1]

    @pytest.mark.anyio
    async def test_text_fallback_still_sent_when_only_tool_calls_streamed(self):
        captured: list = []
        await _run_executor(ToolCallingExecutor("test"), captured)

        text_chunks = [
            c for c in _stream_chunks(captured)
            if c["choices"][0]["delta"].get("content")
        ]
        assert len(text_chunks) == 1
        assert text_chunks[0]["choices"][0]["delta"]["content"] == "done"
        assert text_chunks[0]["choices"][0]["finish_reason"] == "stop"

    @pytest.mark.anyio
    async def test_final_chunk_and_complete_still_sent(self):
        captured: list = []
        await _run_executor(ToolCallingExecutor("test"), captured)

        final = [c for c in _stream_chunks(captured) if c["id"] == "chatcmpl-final"]
        assert len(final) == 1
        assert final[0]["ark"]["completedQuery"]["status"]["phase"] == "done"

        assert any(url.endswith("/complete") for url, _ in captured)

    @pytest.mark.anyio
    async def test_index_resets_between_executions(self):
        executor = ToolCallingExecutor("test")

        first: list = []
        await _run_executor(executor, first)
        second: list = []
        await _run_executor(executor, second)

        indices = [
            c["choices"][0]["delta"]["tool_calls"][0]["index"]
            for c in _stream_chunks(second)
            if c["choices"][0]["delta"].get("tool_calls")
        ]
        assert indices == [0, 1]


class InterleavingExecutor(BaseExecutor):
    async def execute_agent(self, request: ExecutionEngineRequest) -> list[Message]:
        agent = request.agent.name
        await self.stream_tool_call(name=f"first-{agent}")
        await asyncio.sleep(0.05)
        await self.stream_tool_call(name=f"second-{agent}")
        return [Message(role="assistant", content="done")]


async def _run_concurrently(executor: BaseExecutor, query_names: list[str]) -> list:
    captured: list = []

    def extract(message):
        return QueryRef(name=message.query_name, namespace="ns")

    async def resolve(query_ref, user_text, conversation_id=""):
        return _make_request(agent_name=f"agent-{query_ref.name}")

    async def one(query_name: str) -> None:
        context = MagicMock()
        context.get_user_input.return_value = "go"
        context.message.context_id = "conv-1"
        context.message.message_id = "msg-1"
        context.message.query_name = query_name
        await A2AExecutorAdapter(executor)._do_execute(context, AsyncMock())

    with patch(
        "ark_sdk.executor_app.extract_query_ref", side_effect=extract
    ), patch(
        "ark_sdk.executor_app.resolve_query", side_effect=resolve
    ), patch(
        "ark_sdk.executor_app.discover_broker_url",
        new=AsyncMock(return_value="http://broker"),
    ), patch(
        "ark_sdk.executor_app.QueryStatusUpdater", return_value=MagicMock()
    ), patch(
        "ark_sdk.broker.httpx.AsyncClient", _capturing_transport(captured)
    ):
        await asyncio.gather(*(one(q) for q in query_names))

    return captured


def _tool_calls_on_stream(captured: list, query_name: str) -> list[dict]:
    calls = []
    for url, body in captured:
        if not url.endswith(f"/stream/{query_name}"):
            continue
        for line in body.decode().splitlines():
            if not line.strip():
                continue
            delta = json.loads(line)["choices"][0]["delta"]
            if delta.get("tool_calls"):
                calls.append(delta["tool_calls"][0])
    return calls


class TestConcurrentRequests:
    @pytest.mark.anyio
    async def test_tool_calls_do_not_cross_query_streams(self):
        captured = await _run_concurrently(
            InterleavingExecutor("test"), ["query-a", "query-b"]
        )

        for query_name in ("query-a", "query-b"):
            names = [
                c["function"]["name"]
                for c in _tool_calls_on_stream(captured, query_name)
            ]
            assert names == [
                f"first-agent-{query_name}",
                f"second-agent-{query_name}",
            ]

    @pytest.mark.anyio
    async def test_indices_are_independent_per_request(self):
        captured = await _run_concurrently(
            InterleavingExecutor("test"), ["query-a", "query-b"]
        )

        for query_name in ("query-a", "query-b"):
            indices = [
                c["index"] for c in _tool_calls_on_stream(captured, query_name)
            ]
            assert indices == [0, 1]


class TestChildTaskPropagation:
    @pytest.mark.anyio
    async def test_streamed_flag_set_in_gathered_task_is_visible(self):
        executor = ToolCallingExecutor("test")
        executor._broker_client = AsyncMock()
        executor._streamed = False

        await asyncio.gather(executor.stream_chunk("hi"))

        assert executor._streamed is True

    @pytest.mark.anyio
    async def test_streamed_flag_set_in_created_task_is_visible(self):
        executor = ToolCallingExecutor("test")
        executor._broker_client = AsyncMock()
        executor._streamed = False

        await asyncio.create_task(executor.stream_chunk("hi"))

        assert executor._streamed is True

    @pytest.mark.anyio
    async def test_broker_client_visible_in_child_task(self):
        executor = ToolCallingExecutor("test")
        broker = AsyncMock()
        executor._broker_client = broker

        await asyncio.gather(executor.stream_tool_call(name="Bash"))

        broker.send_chunk.assert_awaited_once()

    @pytest.mark.anyio
    async def test_tool_call_index_advances_across_child_tasks(self):
        executor = ToolCallingExecutor("test")
        broker = AsyncMock()
        executor._broker_client = broker

        await asyncio.gather(executor.stream_tool_call(name="one"))
        await asyncio.gather(executor.stream_tool_call(name="two"))

        indices = [
            call.kwargs["tool_calls"][0]["index"]
            for call in broker.send_chunk.await_args_list
        ]
        assert indices == [0, 1]

    @pytest.mark.anyio
    async def test_concurrent_tool_calls_in_one_gather_get_distinct_indices(self):
        executor = ToolCallingExecutor("test")
        broker = AsyncMock()
        executor._broker_client = broker

        await asyncio.gather(
            executor.stream_tool_call(name="a", arguments={"x": 1}),
            executor.stream_tool_call(name="b", arguments={"y": 2}),
            executor.stream_tool_call(name="c", arguments={"z": 3}),
        )

        indices = sorted(
            call.kwargs["tool_calls"][0]["index"]
            for call in broker.send_chunk.await_args_list
        )
        assert indices == [0, 1, 2]

    @pytest.mark.anyio
    async def test_interleaved_tool_calls_get_distinct_indices(self):
        executor = ToolCallingExecutor("test")
        broker = AsyncMock()
        executor._broker_client = broker

        async def delayed(name: str, delay: float) -> None:
            await asyncio.sleep(delay)
            await executor.stream_tool_call(name=name)

        await asyncio.gather(
            delayed("a", 0.03), delayed("b", 0.01), delayed("c", 0.02)
        )

        indices = sorted(
            call.kwargs["tool_calls"][0]["index"]
            for call in broker.send_chunk.await_args_list
        )
        assert indices == [0, 1, 2]

    @pytest.mark.anyio
    async def test_state_readable_from_worker_thread(self):
        executor = ToolCallingExecutor("test")
        broker = AsyncMock()
        executor._broker_client = broker

        seen = await asyncio.to_thread(lambda: executor._broker_client)

        assert seen is broker

    @pytest.mark.anyio
    async def test_streaming_from_worker_thread_sends_nothing(self):
        executor = ToolCallingExecutor("test")
        broker = AsyncMock()
        executor._broker_client = broker

        text_coro = await asyncio.to_thread(executor.stream_chunk, "hi")
        tool_coro = await asyncio.to_thread(executor.stream_tool_call, "Bash")

        assert asyncio.iscoroutine(text_coro)
        assert asyncio.iscoroutine(tool_coro)
        assert broker.send_chunk.await_count == 0

        text_coro.close()
        tool_coro.close()

    @pytest.mark.anyio
    async def test_no_fallback_resend_when_child_task_streamed_text(self):
        class ChildTaskExecutor(BaseExecutor):
            async def execute_agent(self, request: ExecutionEngineRequest) -> list[Message]:
                await asyncio.gather(self.stream_chunk("streamed text"))
                return [Message(role="assistant", content="streamed text")]

        captured: list = []
        await _run_executor(ChildTaskExecutor("test"), captured)

        texts = [
            c["choices"][0]["delta"]["content"]
            for c in _stream_chunks(captured)
            if c["choices"][0]["delta"].get("content")
        ]
        assert texts == ["streamed text"]


class TestStreamToolCall:
    @pytest.mark.anyio
    async def test_noop_without_broker_client(self):
        executor = ToolCallingExecutor("test")
        executor._broker_client = None

        await executor.stream_tool_call(name="Bash", arguments={"command": "ls"})

    @pytest.mark.anyio
    async def test_string_arguments_passed_through_unchanged(self):
        executor = ToolCallingExecutor("test")
        broker = AsyncMock()
        executor._broker_client = broker

        await executor.stream_tool_call(name="Bash", arguments='{"command":"ls"}')

        tool_calls = broker.send_chunk.await_args.kwargs["tool_calls"]
        assert tool_calls[0]["function"]["arguments"] == '{"command":"ls"}'

    @pytest.mark.anyio
    async def test_explicit_index_overrides_counter(self):
        executor = ToolCallingExecutor("test")
        broker = AsyncMock()
        executor._broker_client = broker

        await executor.stream_tool_call(name="Bash", index=7)

        tool_calls = broker.send_chunk.await_args.kwargs["tool_calls"]
        assert tool_calls[0]["index"] == 7

    @pytest.mark.anyio
    async def test_explicit_index_advances_the_counter(self):
        executor = ToolCallingExecutor("test")
        broker = AsyncMock()
        executor._broker_client = broker

        await executor.stream_tool_call(name="Bash", index=0)
        await executor.stream_tool_call(name="Read")

        indices = [
            call.kwargs["tool_calls"][0]["index"]
            for call in broker.send_chunk.await_args_list
        ]
        assert indices == [0, 1]

    @pytest.mark.anyio
    async def test_id_generated_when_omitted(self):
        executor = ToolCallingExecutor("test")
        broker = AsyncMock()
        executor._broker_client = broker

        await executor.stream_tool_call(name="Bash")
        await executor.stream_tool_call(name="Read")

        ids = [
            call.kwargs["tool_calls"][0]["id"]
            for call in broker.send_chunk.await_args_list
        ]
        assert all(i.startswith("call_") for i in ids)
        assert ids[0] != ids[1]

    @pytest.mark.anyio
    async def test_supplied_id_is_preserved(self):
        executor = ToolCallingExecutor("test")
        broker = AsyncMock()
        executor._broker_client = broker

        await executor.stream_tool_call(name="Bash", tool_call_id="toolu_9")

        tool_calls = broker.send_chunk.await_args.kwargs["tool_calls"]
        assert tool_calls[0]["id"] == "toolu_9"

    @pytest.mark.anyio
    async def test_non_json_arguments_are_coerced(self):
        executor = ToolCallingExecutor("test")
        broker = AsyncMock()
        executor._broker_client = broker

        await executor.stream_tool_call(
            name="Write",
            arguments={
                "when": datetime.datetime(2026, 1, 1),
                "path": pathlib.Path("/tmp/x"),
                "blob": b"raw",
            },
        )

        sent = json.loads(broker.send_chunk.await_args.kwargs["tool_calls"][0]["function"]["arguments"])
        assert sent["when"] == "2026-01-01 00:00:00"
        assert sent["path"] == "/tmp/x"

    @pytest.mark.anyio
    async def test_unserializable_arguments_do_not_raise(self):
        class Exploding:
            def __str__(self):
                raise RuntimeError("boom")

        executor = ToolCallingExecutor("test")
        broker = AsyncMock()
        executor._broker_client = broker

        await executor.stream_tool_call(name="Write", arguments={"bad": Exploding()})

        tool_calls = broker.send_chunk.await_args.kwargs["tool_calls"]
        assert tool_calls[0]["function"]["arguments"] == "{}"
        assert tool_calls[0]["function"]["name"] == "Write"

    @pytest.mark.anyio
    async def test_does_not_set_streamed_flag(self):
        executor = ToolCallingExecutor("test")
        executor._broker_client = AsyncMock()

        await executor.stream_tool_call(name="Bash")

        assert executor._streamed is False


class TestBuildChunkBackwardCompatibility:
    def test_text_chunk_delta_has_no_tool_calls_key(self):
        client = BrokerClient("http://broker", "q", "sess", "agent")
        chunk = json.loads(client._build_chunk("hello").decode())

        assert chunk["choices"][0]["delta"] == {
            "role": "assistant",
            "content": "hello",
        }

    def test_empty_tool_calls_omitted(self):
        client = BrokerClient("http://broker", "q", "sess", "agent")
        chunk = json.loads(client._build_chunk("hello", tool_calls=[]).decode())

        assert "tool_calls" not in chunk["choices"][0]["delta"]
