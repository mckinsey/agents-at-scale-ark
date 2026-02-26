import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from a2a.types import TaskState

from ark_api.api.v1.a2agw.manager import DynamicManager
from ark_api.api.v1.a2agw.execution import ARKAgentExecutor
from ark_api.api.v1.a2agw.message_conversion import QueryPayload
from ark_api.api.v1.a2agw.query import QueryExecutionResult


class TestA2AGatewayExecution(unittest.IsolatedAsyncioTestCase):
    async def test_execute_uses_query_context_id_from_result(self):
        executor = ARKAgentExecutor("test-agent", "default", timeout=1)
        event_queue = SimpleNamespace(enqueue_event=AsyncMock())
        context = SimpleNamespace(task_id="task-1", context_id="ctx-old", message=SimpleNamespace(parts=[]))

        with patch(
            "ark_api.api.v1.a2agw.execution.ARKAgentExecutor._resolve_experimental_enabled",
            new_callable=AsyncMock,
            return_value=False,
        ), patch(
            "ark_api.api.v1.a2agw.execution.build_query_payload",
            return_value=QueryPayload(query_type="user", input_data="hello", preview_text="hello"),
        ), patch(
            "ark_api.api.v1.a2agw.execution.post_query_and_wait",
            new_callable=AsyncMock,
            return_value=QueryExecutionResult(content="done", context_id="ctx-new"),
        ), patch(
            "ark_api.api.v1.a2agw.execution.new_agent_text_message",
            side_effect=lambda text, context_id=None, task_id=None: {
                "text": text,
                "context_id": context_id,
                "task_id": task_id,
            },
        ) as mock_new_message:
            await executor.execute(context, event_queue)

        self.assertGreaterEqual(event_queue.enqueue_event.await_count, 3)
        mock_new_message.assert_any_call("done", context_id="ctx-new", task_id="task-1")
        final_status_event = event_queue.enqueue_event.await_args_list[-1].args[0]
        self.assertEqual(final_status_event.context_id, "ctx-new")

    async def test_execute_generates_context_and_task_ids_when_missing(self):
        executor = ARKAgentExecutor("test-agent", "default", timeout=1)
        event_queue = SimpleNamespace(enqueue_event=AsyncMock())
        context = SimpleNamespace(message=SimpleNamespace(parts=[]))

        with patch(
            "ark_api.api.v1.a2agw.execution.ARKAgentExecutor._resolve_experimental_enabled",
            new_callable=AsyncMock,
            return_value=False,
        ), patch(
            "ark_api.api.v1.a2agw.execution.build_query_payload",
            return_value=QueryPayload(query_type="user", input_data="hello", preview_text="hello"),
        ), patch(
            "ark_api.api.v1.a2agw.execution.post_query_and_wait",
            new_callable=AsyncMock,
            return_value=QueryExecutionResult(content="done", context_id=None),
        ), patch(
            "ark_api.api.v1.a2agw.execution.new_agent_text_message",
            side_effect=lambda text, context_id=None, task_id=None: {
                "text": text,
                "context_id": context_id,
                "task_id": task_id,
            },
        ) as mock_new_message:
            await executor.execute(context, event_queue)

        self.assertGreaterEqual(event_queue.enqueue_event.await_count, 3)
        generated_call = mock_new_message.call_args_list[-1]
        self.assertTrue(generated_call.kwargs["context_id"])
        self.assertTrue(generated_call.kwargs["task_id"])
        self.assertNotEqual(generated_call.kwargs["context_id"], "default")
        self.assertNotEqual(generated_call.kwargs["task_id"], "unknown")

    async def test_execute_passes_experimental_flag_to_query_layer(self):
        executor = ARKAgentExecutor("test-agent", "default", timeout=1)
        event_queue = SimpleNamespace(enqueue_event=AsyncMock())
        context = SimpleNamespace(task_id="task-1", context_id="ctx-old", message=SimpleNamespace(parts=[]))

        with patch(
            "ark_api.api.v1.a2agw.execution.ARKAgentExecutor._resolve_experimental_enabled",
            new_callable=AsyncMock,
            return_value=True,
        ), patch(
            "ark_api.api.v1.a2agw.execution.build_query_payload",
            return_value=QueryPayload(query_type="messages", input_data=[{"role": "user", "parts": []}], preview_text="hello"),
        ) as mock_build_query_payload, patch(
            "ark_api.api.v1.a2agw.execution.post_query_and_wait",
            new_callable=AsyncMock,
            return_value=QueryExecutionResult(content="done", context_id="ctx-new"),
        ) as mock_post_query, patch(
            "ark_api.api.v1.a2agw.execution.new_agent_text_message",
            side_effect=lambda text, context_id=None, task_id=None: {
                "text": text,
                "context_id": context_id,
                "task_id": task_id,
            },
        ):
            await executor.execute(context, event_queue)

        mock_build_query_payload.assert_called_once_with(
            context,
            experimental_enabled=True,
            native_wire_version="v0.3",
        )
        self.assertTrue(mock_post_query.await_args.kwargs["experimental_enabled"])

    async def test_execute_forwards_normalized_wire_version(self):
        executor = ARKAgentExecutor("test-agent", "default", timeout=1)
        event_queue = SimpleNamespace(enqueue_event=AsyncMock())
        context = SimpleNamespace(taskId="task-1", contextId="ctx-old", a2aVersion="v1.0-rc", message=SimpleNamespace(parts=[]))

        with patch(
            "ark_api.api.v1.a2agw.execution.ARKAgentExecutor._resolve_experimental_enabled",
            new_callable=AsyncMock,
            return_value=True,
        ), patch(
            "ark_api.api.v1.a2agw.execution.build_query_payload",
            return_value=QueryPayload(query_type="messages", input_data=[{"role": "user", "parts": []}], preview_text="hello"),
        ) as mock_build_query_payload, patch(
            "ark_api.api.v1.a2agw.execution.post_query_and_wait",
            new_callable=AsyncMock,
            return_value=QueryExecutionResult(content="done", context_id="ctx-new"),
        ), patch(
            "ark_api.api.v1.a2agw.execution.new_agent_text_message",
            side_effect=lambda text, context_id=None, task_id=None: {
                "text": text,
                "context_id": context_id,
                "task_id": task_id,
            },
        ):
            await executor.execute(context, event_queue)

        self.assertEqual(mock_build_query_payload.call_args.kwargs["native_wire_version"], "v1rc")

    async def test_cancel_cancels_active_task(self):
        executor = ARKAgentExecutor("test-agent", "default", timeout=1)
        event_queue = SimpleNamespace(enqueue_event=AsyncMock())

        async def long_task():
            await asyncio.sleep(10)

        task = asyncio.create_task(long_task())
        executor.active_tasks["task-1"] = task
        context = SimpleNamespace(task_id="task-1", context_id="ctx-1")

        await executor.cancel(context, event_queue)
        await asyncio.sleep(0)

        self.assertNotIn("task-1", executor.active_tasks)
        self.assertTrue(task.cancelled() or task.done())

    async def test_cancel_emits_canceled_status(self):
        executor = ARKAgentExecutor("test-agent", "default", timeout=1)
        event_queue = SimpleNamespace(enqueue_event=AsyncMock())

        async def long_task():
            await asyncio.sleep(10)

        task = asyncio.create_task(long_task())
        executor.active_tasks["task-1"] = task
        context = SimpleNamespace(task_id="task-1", context_id="ctx-1")

        await executor.cancel(context, event_queue)
        status_event = event_queue.enqueue_event.await_args_list[-1].args[0]
        self.assertEqual(status_event.status.state, TaskState.canceled)
        self.assertTrue(status_event.final)

    async def test_cancel_accepts_session_and_task_aliases(self):
        executor = ARKAgentExecutor("test-agent", "default", timeout=1)
        event_queue = SimpleNamespace(enqueue_event=AsyncMock())

        async def long_task():
            await asyncio.sleep(10)

        task = asyncio.create_task(long_task())
        executor.active_tasks["task-alias"] = task
        context = SimpleNamespace(taskId="task-alias", sessionId="ctx-alias")

        await executor.cancel(context, event_queue)
        status_event = event_queue.enqueue_event.await_args_list[-1].args[0]
        self.assertEqual(status_event.context_id, "ctx-alias")
        self.assertEqual(status_event.task_id, "task-alias")

    async def test_cancel_all_tasks_clears_registry(self):
        executor = ARKAgentExecutor("test-agent", "default", timeout=1)

        async def long_task():
            await asyncio.sleep(10)

        task_one = asyncio.create_task(long_task())
        task_two = asyncio.create_task(long_task())
        executor.active_tasks["task-1"] = task_one
        executor.active_tasks["task-2"] = task_two

        await executor.cancel_all_tasks()
        await asyncio.sleep(0)

        self.assertEqual(executor.active_tasks, {})
        self.assertTrue(task_one.cancelled() or task_one.done())
        self.assertTrue(task_two.cancelled() or task_two.done())

    async def test_manager_update_routes_reuses_task_store_per_agent(self):
        manager = DynamicManager()
        manager.agents = {"agent-1": SimpleNamespace(name="agent-1")}
        captured_task_stores = []

        class FakeAgentApp:
            def add_route(self, path, handler, methods=None):
                _ = path
                _ = handler
                _ = methods

            async def __call__(self, scope, receive, send):
                _ = scope
                _ = receive
                _ = send

        class FakeA2AStarletteApplication:
            def __init__(self, agent_card, http_handler):
                _ = agent_card
                captured_task_stores.append(http_handler.task_store)

            def build(self):
                return FakeAgentApp()

        with patch(
            "ark_api.api.v1.a2agw.manager.DefaultRequestHandler",
            side_effect=lambda agent_executor, task_store: SimpleNamespace(
                agent_executor=agent_executor,
                task_store=task_store,
            ),
        ), patch(
            "ark_api.api.v1.a2agw.manager.A2AStarletteApplication",
            FakeA2AStarletteApplication,
        ):
            manager._update_routes()
            first_store = manager.task_stores["agent-1"]
            manager._update_routes()
            second_store = manager.task_stores["agent-1"]

        self.assertIs(first_store, second_store)
        self.assertEqual(len(captured_task_stores), 2)
        self.assertIs(captured_task_stores[0], captured_task_stores[1])

    async def test_manager_sync_removes_orphaned_task_stores_after_grace_period(self):
        manager = DynamicManager()
        manager.agents = {"agent-1": SimpleNamespace(name="agent-1")}

        class DummyExecutor:
            async def cancel_all_tasks(self):
                return None

        manager.executors = {"agent-1": DummyExecutor()}
        manager.task_stores = {"agent-1": object()}
        manager.registry = SimpleNamespace(list_agents=AsyncMock(return_value=[]))

        with patch.object(manager, "_update_routes"):
            await manager._sync_with_registry()

        self.assertIn("agent-1", manager.agents)
        self.assertIn("agent-1", manager.task_stores)

        with patch.object(manager, "_update_routes") as mock_update_routes:
            await manager._sync_with_registry()

        self.assertNotIn("agent-1", manager.agents)
        self.assertNotIn("agent-1", manager.executors)
        self.assertNotIn("agent-1", manager.task_stores)
        mock_update_routes.assert_called_once()
