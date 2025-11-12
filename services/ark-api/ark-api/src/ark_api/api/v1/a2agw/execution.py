import asyncio
import logging
import os
from datetime import UTC, datetime

from a2a.server.agent_execution import AgentExecutor
from a2a.server.agent_execution.context import RequestContext
from a2a.server.events.event_queue import EventQueue
from a2a.types import TaskState, TaskStatus, TaskStatusUpdateEvent
from a2a.utils import new_agent_text_message

from .query import post_query_and_wait

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = int(os.getenv('A2A_DEFAULT_TIMEOUT', '300'))

class ARKAgentExecutor(AgentExecutor):
    def __init__(self, target_name, namespace, timeout=None):
        super().__init__()
        self.target_name = target_name
        self.namespace = namespace
        self.timeout = timeout if timeout is not None else DEFAULT_TIMEOUT
        self.tasks_lock = asyncio.Lock()
        self.active_coroutines = {}  # task_id -> coroutine mapping

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
    
    def _create_status_event(self, context_id: str, task_id: str, state: TaskState, 
                           final: bool = False, error_msg: str = None) -> TaskStatusUpdateEvent:
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
    
    async def _send_task_update(self, event_queue: EventQueue, context_id: str, 
                               task_id: str, state: TaskState, final: bool = False):
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
    
    async def _process_query(self, user_message: str) -> str:
        """Process the query and return the result.
        
        Args:
            user_message: The user's query message
            
        Returns:
            The query result
        """
        return await post_query_and_wait(self.namespace, 'agent', self.target_name, user_message, timeout=self.timeout)
    
    async def execute(
            self, context: RequestContext, event_queue: EventQueue
    ) -> None:
        """Execute the agent's logic for a given request context.

        Args:
            context: The request context containing the message, task ID, etc.
            event_queue: The queue to publish events to.
        """
        # Extract IDs from context
        task_id = getattr(context, 'task_id', None)
        context_id = getattr(context, 'context_id', None)
        
        try:
            # Extract and log the message
            user_message = self._extract_message_text(context.message)
            logger.info(f"Task {task_id} Context {context_id} - Processing query: {user_message}")
            logger.info(f"Task {task_id} - Using timeout: {self.timeout} seconds")
            
            # Send starting status
            await self._send_task_update(event_queue, context_id, task_id, TaskState.working, final=False)

            try:
                # Process the query with timeout
                result_co = self._process_query(user_message)
                
                # Store the coroutine for potential cancellation
                async with self.tasks_lock:
                    self.active_coroutines[task_id] = result_co
                
                try:
                    # Wait up to configured timeout for result
                    result = await asyncio.wait_for(result_co, timeout=self.timeout)
                    
                    # Send the result
                    result_msg = new_agent_text_message(result, context_id=context_id, task_id=task_id)
                    await event_queue.enqueue_event(result_msg)

                    # Send completion status
                    await self._send_task_update(event_queue, context_id, task_id, TaskState.completed, final=True)

                    logger.info(f"Task {task_id} - Query completed successfully")
                    
                except TimeoutError:
                    logger.error(f"Task {task_id} - Query timed out after {self.timeout} seconds")
                    
                    # Cancel the coroutine if still running
                    if isinstance(result_co, asyncio.Task):
                        result_co.cancel()
                    
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
                # Remove task and coroutine with lock
                async with self.tasks_lock:
                    self.active_coroutines.pop(task_id, None)  # Remove coroutine reference

        except Exception as e:
            await self._handle_error(e, event_queue, context_id, task_id)
    
    async def _handle_error(self, error: Exception, event_queue: EventQueue, 
                           context_id: str, task_id: str):
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
        task_id = getattr(context, 'task_id', "unknown")
        context_id = getattr(context, 'context_id', None)
        
        # Check if task is active and get coroutine
        async with self.tasks_lock:
            coroutine = self.active_coroutines.get(task_id)
            
        if coroutine:
            logger.info(f"Cancellation requested for active task {task_id}")
            
            # Cancel the coroutine if it exists
            if coroutine and isinstance(coroutine, asyncio.Task):
                coroutine.cancel()
                logger.info(f"Cancelled coroutine for task {task_id}")
            
            # Remove from tracking
            async with self.tasks_lock:
                self.active_coroutines.pop(task_id, None)
            
            # Send cancellation status
            await self._send_task_update(event_queue, context_id, task_id, TaskState.canceled, final=True)
        else:
            logger.warning(f"Cancellation requested for task {task_id}, but task is not active")