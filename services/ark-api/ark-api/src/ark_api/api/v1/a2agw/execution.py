import asyncio
import logging
import os
from datetime import UTC, datetime
from typing import Any

from a2a.server.agent_execution import AgentExecutor
from a2a.server.agent_execution.context import RequestContext
from a2a.server.events.event_queue import EventQueue
from a2a.types import TaskState, TaskStatus, TaskStatusUpdateEvent
from a2a.utils import new_agent_text_message

from .message_conversion import build_query_payload
from .query import QueryExecutionResult, post_query_and_wait

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = int(os.getenv('A2A_DEFAULT_TIMEOUT', '300'))

class ARKAgentExecutor(AgentExecutor):
    def __init__(self, target_name, namespace, timeout=None):
        super().__init__()
        self.target_name = target_name
        self.namespace = namespace
        self.timeout = timeout if timeout is not None else DEFAULT_TIMEOUT
        self.tasks_lock = asyncio.Lock()
        self.active_tasks: dict[str, asyncio.Task] = {}

    def _extract_message_text(self, message) -> str:
        """Extract text content from a message object.
        
        Args:
            message: The message object containing parts
            
        Returns:
            The extracted text or "No message" if not found
        """
        if not message or not hasattr(message, 'parts'):
            return "No message"
            
        for part in message.parts:
            # Check if it's a Part wrapper object
            if hasattr(part, 'root'):
                part_root = part.root
                if hasattr(part_root, 'kind') and part_root.kind == 'text' and hasattr(part_root, 'text'):
                    return part_root.text
            # Or if it's directly a text part
            elif hasattr(part, 'kind') and part.kind == 'text' and hasattr(part, 'text'):
                return part.text
                
        return "No message"
    
    def _create_status_event(
        self,
        context_id: str | None,
        task_id: str | None,
        state: TaskState,
        final: bool = False,
        error_msg: str | None = None,
    ) -> TaskStatusUpdateEvent:
        """Create a task status update event.
        
        Args:
            context_id: The context ID
            task_id: The task ID
            state: The task state
            final: Whether this is the final status
            error_msg: Optional error message for failed states
            
        Returns:
            A TaskStatusUpdateEvent
        """
        status = TaskStatus(
            state=state,
            timestamp=datetime.now(UTC).isoformat()
        )
        
        if error_msg and state == TaskState.failed:
            status.message = new_agent_text_message(f"Task failed: {error_msg}")
            
        return TaskStatusUpdateEvent(
            contextId=context_id or "default",
            taskId=task_id or "unknown",
            status=status,
            final=final
        )
    
    async def _send_task_update(
        self,
        event_queue: EventQueue,
        context_id: str | None,
        task_id: str | None,
        state: TaskState,
        final: bool = False,
    ):
        """Send a task status update to the event queue.
        
        Args:
            event_queue: The event queue
            context_id: The context ID
            task_id: The task ID
            state: The task state
            final: Whether this is the final status
        """
        status_event = self._create_status_event(context_id, task_id, state, final)
        await event_queue.enqueue_event(status_event)
    
    async def _process_query(
        self,
        query_input: str | list[dict[str, Any]],
        query_type: str,
        context_id: str | None,
    ) -> QueryExecutionResult:
        """Process the query and return the result.
        
        Args:
            query_input: The query payload
            query_type: The query payload type
            context_id: A2A context id
            
        Returns:
            The query result
        """
        return await post_query_and_wait(
            self.namespace,
            'agent',
            self.target_name,
            query_input,
            query_type=query_type,
            timeout=self.timeout,
            context_id=context_id,
        )
    
    async def execute(
            self, context: RequestContext, event_queue: EventQueue
    ) -> None:
        """Execute the agent's logic for a given request context.

        Args:
            context: The request context containing the message, task ID, etc.
            event_queue: The queue to publish events to.
        """
        # Extract IDs from context
        task_id_raw = getattr(context, 'task_id', None)
        context_id_raw = getattr(context, 'context_id', None)
        task_id = task_id_raw if isinstance(task_id_raw, str) and task_id_raw else "unknown"
        context_id = context_id_raw if isinstance(context_id_raw, str) and context_id_raw else None
        
        try:
            # Extract and log the message
            query_payload = build_query_payload(context)
            logger.info(f"Task {task_id} Context {context_id} - Processing query: {query_payload.preview_text}")
            logger.info(f"Task {task_id} - Using timeout: {self.timeout} seconds")
            
            # Send starting status
            await self._send_task_update(event_queue, context_id, task_id, TaskState.working, final=False)

            try:
                # Process the query with timeout
                result_task = asyncio.create_task(
                    self._process_query(
                        query_payload.input_data,
                        query_payload.query_type,
                        context_id,
                    )
                )

                async with self.tasks_lock:
                    self.active_tasks[task_id] = result_task

                try:
                    # Wait up to configured timeout for result
                    result = await asyncio.wait_for(asyncio.shield(result_task), timeout=self.timeout)

                    response_context_id = result.context_id or context_id
                    # Send the result
                    result_msg = new_agent_text_message(
                        result.content,
                        context_id=response_context_id,
                        task_id=task_id,
                    )
                    await event_queue.enqueue_event(result_msg)

                    # Send completion status
                    await self._send_task_update(event_queue, context_id, task_id, TaskState.completed, final=True)

                    logger.info(f"Task {task_id} - Query completed successfully")
                    
                except TimeoutError:
                    logger.error(f"Task {task_id} - Query timed out after {self.timeout} seconds")

                    if not result_task.done():
                        result_task.cancel()
                    
                    # Send timeout error
                    timeout_msg = new_agent_text_message(
                        f"Query timed out after {self.timeout} seconds",
                        context_id=context_id,
                        task_id=task_id
                    )
                    await event_queue.enqueue_event(timeout_msg)
                    
                    # Send failure status
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
        context_id: str | None,
        task_id: str | None,
    ):
        """Handle errors during query processing.
        
        Args:
            error: The exception that occurred
            event_queue: The event queue
            context_id: The context ID
            task_id: The task ID
        """
        logger.error(f"Task {task_id} - Error processing query: {str(error)}")
        
        # Send error message
        error_message = new_agent_text_message(f"Error: {str(error)}", 
                                             context_id=context_id, 
                                             task_id=task_id)
        await event_queue.enqueue_event(error_message)
        
        # Send failure status
        failure_event = self._create_status_event(
            context_id, task_id, TaskState.failed, 
            final=True, error_msg=str(error)
        )
        await event_queue.enqueue_event(failure_event)

    async def cancel(
            self, context: RequestContext, event_queue: EventQueue
    ) -> None:
        """Request the agent to cancel an ongoing task.

        Args:
            context: The request context containing the task ID to cancel.
            event_queue: The queue to publish the cancellation status update to.
        """
        task_id_raw = getattr(context, 'task_id', "unknown")
        context_id_raw = getattr(context, 'context_id', None)
        task_id = task_id_raw if isinstance(task_id_raw, str) and task_id_raw else "unknown"
        context_id = context_id_raw if isinstance(context_id_raw, str) and context_id_raw else None
        
        async with self.tasks_lock:
            task = self.active_tasks.pop(task_id, None)

        if task:
            logger.info(f"Cancellation requested for active task {task_id}")

            if not task.done():
                task.cancel()
                logger.info(f"Cancelled task {task_id}")
            
            # Send cancellation status
            await self._send_task_update(event_queue, context_id, task_id, TaskState.canceled, final=True)
        else:
            logger.warning(f"Cancellation requested for task {task_id}, but task is not active")

    async def cancel_all_tasks(self) -> None:
        async with self.tasks_lock:
            tasks = list(self.active_tasks.values())
            self.active_tasks.clear()

        for task in tasks:
            if not task.done():
                task.cancel()