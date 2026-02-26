import asyncio
import contextlib
import logging
import os
import time
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from a2a.server.agent_execution import AgentExecutor
from a2a.server.agent_execution.context import RequestContext
from a2a.server.events.event_queue import EventQueue
from a2a.types import TaskState, TaskStatus, TaskStatusUpdateEvent
from a2a.utils import new_agent_text_message
from ark_sdk.client import V1_ALPHA1, with_ark_client

from .message_conversion import build_query_payload, normalize_a2a_wire_version
from .query import QueryExecutionResult, post_query_and_wait
from .registry import _safe_metadata
from ark_api.constants.annotations import (
    A2A_EXPERIMENTAL_ENABLED_ANNOTATION,
    parse_bool_annotation,
)

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = int(os.getenv('A2A_DEFAULT_TIMEOUT', '300'))
_EXPERIMENTAL_CACHE_TTL = 30

class ARKAgentExecutor(AgentExecutor):
    def __init__(self, target_name, namespace, timeout=None):
        super().__init__()
        self.target_name = target_name
        self.namespace = namespace
        self.timeout = timeout if timeout is not None else DEFAULT_TIMEOUT
        self.tasks_lock = asyncio.Lock()
        self.active_tasks: dict[str, asyncio.Task] = {}
        self._experimental_enabled: bool = False
        self._experimental_resolved_at: float = 0

    def _resolve_task_id(self, task_id: object) -> str:
        if isinstance(task_id, str) and task_id.strip():
            return task_id.strip()
        return f"task-{uuid4()}"

    def _resolve_context_id(self, context_id: object) -> str:
        if isinstance(context_id, str) and context_id.strip():
            return context_id.strip()
        return str(uuid4())

    def _extract_request_task_id(self, context: RequestContext) -> object:
        return getattr(context, "task_id", None) or getattr(context, "taskId", None)

    def _extract_request_context_id(self, context: RequestContext) -> object:
        return (
            getattr(context, "context_id", None)
            or getattr(context, "contextId", None)
            or getattr(context, "session_id", None)
            or getattr(context, "sessionId", None)
        )

    def _resolve_wire_version(self, context: RequestContext) -> str:
        raw_version = (
            getattr(context, "a2a_version", None)
            or getattr(context, "a2aVersion", None)
            or getattr(context, "protocol_version", None)
            or getattr(context, "protocolVersion", None)
        )
        return normalize_a2a_wire_version(raw_version if isinstance(raw_version, str) else None)

    def _create_status_event(
        self,
        context_id: str,
        task_id: str,
        state: TaskState,
        final: bool = False,
        error_msg: str | None = None,
    ) -> TaskStatusUpdateEvent:
        status = TaskStatus(
            state=state,
            timestamp=datetime.now(UTC).isoformat()
        )

        if error_msg and state == TaskState.failed:
            status.message = new_agent_text_message(f"Task failed: {error_msg}")

        return TaskStatusUpdateEvent(
            contextId=context_id,
            taskId=task_id,
            status=status,
            final=final
        )

    async def _send_task_update(
        self,
        event_queue: EventQueue,
        context_id: str,
        task_id: str,
        state: TaskState,
        final: bool = False,
    ):
        status_event = self._create_status_event(context_id, task_id, state, final)
        await event_queue.enqueue_event(status_event)

    async def _process_query(
        self,
        query_input: str | list[dict[str, Any]],
        query_type: str,
        context_id: str | None,
        experimental_enabled: bool,
    ) -> QueryExecutionResult:
        return await post_query_and_wait(
            self.namespace,
            'agent',
            self.target_name,
            query_input,
            query_type=query_type,
            timeout=self.timeout,
            context_id=context_id,
            experimental_enabled=experimental_enabled,
        )

    async def _resolve_experimental_enabled(self) -> bool:
        now = time.monotonic()
        if now - self._experimental_resolved_at < _EXPERIMENTAL_CACHE_TTL:
            return self._experimental_enabled
        try:
            async with with_ark_client(self.namespace, V1_ALPHA1) as ark_client:
                agent = await ark_client.agents.a_get(self.target_name)
                metadata = _safe_metadata(agent)
                annotations = metadata.get("annotations") or {}
                if not isinstance(annotations, dict):
                    self._experimental_enabled = False
                else:
                    self._experimental_enabled = parse_bool_annotation(
                        annotations.get(A2A_EXPERIMENTAL_ENABLED_ANNOTATION),
                        False,
                    )
                self._experimental_resolved_at = now
        except Exception as exc:
            logger.warning("Failed to resolve experimental A2A flag for %s: %s", self.target_name, exc)
            self._experimental_enabled = False
            self._experimental_resolved_at = now
        return self._experimental_enabled

    async def execute(
            self, context: RequestContext, event_queue: EventQueue
    ) -> None:
        task_id = self._resolve_task_id(self._extract_request_task_id(context))
        context_id = self._resolve_context_id(self._extract_request_context_id(context))

        try:
            experimental_enabled = await self._resolve_experimental_enabled()
            wire_version = self._resolve_wire_version(context)
            query_payload = build_query_payload(
                context,
                experimental_enabled=experimental_enabled,
                native_wire_version=wire_version,
            )
            logger.info("Task %s Context %s - Processing query: %s", task_id, context_id, query_payload.preview_text)
            logger.info("Task %s - Using timeout: %s seconds", task_id, self.timeout)

            await self._send_task_update(event_queue, context_id, task_id, TaskState.working, final=False)

            try:
                result_task = asyncio.create_task(
                    self._process_query(
                        query_payload.input_data,
                        query_payload.query_type,
                        context_id,
                        experimental_enabled,
                    )
                )

                async with self.tasks_lock:
                    self.active_tasks[task_id] = result_task

                try:
                    result = await asyncio.wait_for(asyncio.shield(result_task), timeout=self.timeout)

                    response_context_id = result.context_id or context_id
                    result_msg = new_agent_text_message(
                        result.content,
                        context_id=response_context_id,
                        task_id=task_id,
                    )
                    await event_queue.enqueue_event(result_msg)

                    await self._send_task_update(event_queue, response_context_id, task_id, TaskState.completed, final=True)

                    logger.info("Task %s - Query completed successfully", task_id)

                except TimeoutError:
                    logger.error("Task %s - Query timed out after %s seconds", task_id, self.timeout)

                    if not result_task.done():
                        result_task.cancel()
                    with contextlib.suppress(asyncio.CancelledError, Exception):
                        await result_task

                    timeout_msg = new_agent_text_message(
                        f"Query timed out after {self.timeout} seconds",
                        context_id=context_id,
                        task_id=task_id
                    )
                    await event_queue.enqueue_event(timeout_msg)

                    failure_event = self._create_status_event(
                        context_id, task_id, TaskState.failed,
                        final=True, error_msg=f"Query timeout after {self.timeout}s"
                    )
                    await event_queue.enqueue_event(failure_event)

            finally:
                async with self.tasks_lock:
                    self.active_tasks.pop(task_id, None)

        except Exception as e:
            await self._handle_error(e, event_queue, context_id, task_id)

    async def _handle_error(
        self,
        error: Exception,
        event_queue: EventQueue,
        context_id: str,
        task_id: str,
    ):
        logger.error("Task %s - Error processing query: %s", task_id, error)

        error_message = new_agent_text_message(f"Error: {error}",
                                             context_id=context_id,
                                             task_id=task_id)
        await event_queue.enqueue_event(error_message)

        failure_event = self._create_status_event(
            context_id, task_id, TaskState.failed,
            final=True, error_msg=str(error)
        )
        await event_queue.enqueue_event(failure_event)

    async def cancel(
            self, context: RequestContext, event_queue: EventQueue
    ) -> None:
        task_id_raw = self._extract_request_task_id(context)
        context_id_raw = self._extract_request_context_id(context)
        task_id = self._resolve_task_id(task_id_raw)
        context_id = self._resolve_context_id(context_id_raw)

        async with self.tasks_lock:
            task = self.active_tasks.pop(task_id, None)

        if task:
            logger.info("Cancellation requested for active task %s", task_id)

            if not task.done():
                task.cancel()
                logger.info("Cancelled task %s", task_id)

            await self._send_task_update(event_queue, context_id, task_id, TaskState.canceled, final=True)
        else:
            logger.warning("Cancellation requested for task %s, but task is not active", task_id)

    async def cancel_all_tasks(self) -> None:
        async with self.tasks_lock:
            tasks = list(self.active_tasks.values())
            self.active_tasks.clear()

        for task in tasks:
            if not task.done():
                task.cancel()
