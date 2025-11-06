import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from a2a.types import TaskState, TaskStatusUpdateEvent

from src.a2agw.execution import ARKAgentExecutor


class TestARKAgentExecutor(unittest.IsolatedAsyncioTestCase):
    """Test the ARKAgentExecutor class"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.executor = ARKAgentExecutor(target_name="test-agent", namespace="test-namespace")
        
        # Mock context with proper attributes
        self.mock_context = MagicMock()
        self.mock_context.task_id = "test-task-123"
        self.mock_context.context_id = "test-context-456"
        
        # Mock message with parts structure
        self.mock_message = MagicMock()
        self.mock_part = MagicMock()
        self.mock_part.root = MagicMock()
        self.mock_part.root.kind = "text"
        self.mock_part.root.text = "Test query message"
        self.mock_message.parts = [self.mock_part]
        self.mock_context.message = self.mock_message
        
        # Mock event queue
        self.mock_event_queue = AsyncMock()
        
    def test_extract_message_text_with_root_structure(self):
        """Test extracting text from message with root structure"""
        text = self.executor._extract_message_text(self.mock_message)
        self.assertEqual(text, "Test query message")
    
    def test_extract_message_text_direct_structure(self):
        """Test extracting text from message with direct structure"""
        # Create message with direct text part using spec to control attributes
        direct_part = MagicMock(spec=['kind', 'text'])
        direct_part.kind = "text"
        direct_part.text = "Direct text message"
        mock_message = MagicMock()
        mock_message.parts = [direct_part]
        
        text = self.executor._extract_message_text(mock_message)
        self.assertEqual(text, "Direct text message")
    
    def test_extract_message_text_no_message(self):
        """Test extracting text when no message provided"""
        text = self.executor._extract_message_text(None)
        self.assertEqual(text, "No message")
    
    def test_extract_message_text_no_parts(self):
        """Test extracting text when message has no parts"""
        mock_message = MagicMock()
        mock_message.parts = []
        text = self.executor._extract_message_text(mock_message)
        self.assertEqual(text, "No message")
    
    def test_create_status_event_basic(self):
        """Test creating a basic status event"""
        event = self.executor._create_status_event(
            context_id="ctx-123",
            task_id="task-456",
            state=TaskState.working,
            final=False
        )
        
        self.assertIsInstance(event, TaskStatusUpdateEvent)
        self.assertEqual(event.context_id, "ctx-123")
        self.assertEqual(event.task_id, "task-456")
        self.assertEqual(event.status.state, TaskState.working)
        self.assertFalse(event.final)
    
    def test_create_status_event_with_error(self):
        """Test creating a status event with error message"""
        event = self.executor._create_status_event(
            context_id="ctx-123",
            task_id="task-456",
            state=TaskState.failed,
            final=True,
            error_msg="Something went wrong"
        )
        
        self.assertEqual(event.status.state, TaskState.failed)
        self.assertTrue(event.final)
        # The error message should be wrapped in an agent message
        self.assertIsNotNone(event.status.message)
    
    def test_create_status_event_defaults(self):
        """Test creating status event with None IDs"""
        event = self.executor._create_status_event(
            context_id=None,
            task_id=None,
            state=TaskState.completed,
            final=True
        )
        
        self.assertEqual(event.context_id, "default")
        self.assertEqual(event.task_id, "unknown")
    
    async def test_send_task_update(self):
        """Test sending task update to event queue"""
        await self.executor._send_task_update(
            self.mock_event_queue,
            "ctx-123",
            "task-456",
            TaskState.working,
            final=False
        )
        
        # Verify event was enqueued
        self.mock_event_queue.enqueue_event.assert_called_once()
        enqueued_event = self.mock_event_queue.enqueue_event.call_args[0][0]
        self.assertIsInstance(enqueued_event, TaskStatusUpdateEvent)
        self.assertEqual(enqueued_event.status.state, TaskState.working)
    
    @patch('src.a2agw.execution.post_query_and_wait')
    async def test_process_query(self, mock_post_query):
        """Test processing a query"""
        mock_post_query.return_value = "Query result"
        
        result = await self.executor._process_query("Test query")
        
        self.assertEqual(result, "Query result")
        mock_post_query.assert_called_once_with(
            "test-namespace", "agent", "test-agent", "Test query", timeout=300
        )
    
    @patch('src.a2agw.execution.post_query_and_wait')
    async def test_execute_success(self, mock_post_query):
        """Test successful execution of a query"""
        mock_post_query.return_value = "Success result"
        
        await self.executor.execute(self.mock_context, self.mock_event_queue)
        
        # Verify the sequence of events
        calls = self.mock_event_queue.enqueue_event.call_args_list
        
        # Should have: working status, result message, completed status
        self.assertEqual(len(calls), 3)
        
        # First call: working status
        first_event = calls[0][0][0]
        self.assertIsInstance(first_event, TaskStatusUpdateEvent)
        self.assertEqual(first_event.status.state, TaskState.working)
        
        # Third call: completed status
        third_event = calls[2][0][0]
        self.assertIsInstance(third_event, TaskStatusUpdateEvent)
        self.assertEqual(third_event.status.state, TaskState.completed)
        self.assertTrue(third_event.final)
    
    @patch('src.a2agw.execution.post_query_and_wait')
    async def test_execute_with_error(self, mock_post_query):
        """Test execution with an error"""
        mock_post_query.side_effect = Exception("Query failed")
        
        await self.executor.execute(self.mock_context, self.mock_event_queue)
        
        # Verify error handling
        calls = self.mock_event_queue.enqueue_event.call_args_list
        
        # Should have: working status, error message, failed status
        self.assertGreaterEqual(len(calls), 3)
        
        # Last call should be failure status
        last_event = calls[-1][0][0]
        self.assertIsInstance(last_event, TaskStatusUpdateEvent)
        self.assertEqual(last_event.status.state, TaskState.failed)
        self.assertTrue(last_event.final)
    
    @patch('src.a2agw.execution.post_query_and_wait')
    async def test_execute_timeout(self, mock_post_query):
        """Test execution with timeout"""
        # Create a future that will never complete
        never_complete = asyncio.Future()
        mock_post_query.return_value = never_complete
        
        # Mock wait_for to simulate timeout
        async def mock_wait_for(coro, timeout):
            # Cancel the future to clean up
            if asyncio.iscoroutine(coro):
                coro.close()
            elif hasattr(coro, 'cancel'):
                coro.cancel()
            raise TimeoutError()
        
        # Patch the timeout
        with patch('asyncio.wait_for', side_effect=mock_wait_for):
            await self.executor.execute(self.mock_context, self.mock_event_queue)
        
        # Verify timeout handling
        calls = self.mock_event_queue.enqueue_event.call_args_list
        
        # Should have timeout message and failed status
        self.assertGreaterEqual(len(calls), 2)
        
        # Check for failure event
        failure_found = False
        for call in calls:
            event = call[0][0]
            if isinstance(event, TaskStatusUpdateEvent) and event.status.state == TaskState.failed:
                failure_found = True
                self.assertTrue(event.final)
                break
        
        self.assertTrue(failure_found, "Failed status event not found")
    
    async def test_execute_tracks_active_coroutines(self):
        """Test that execute properly tracks active coroutines"""
        # Create a coroutine that we can control
        completion_event = asyncio.Event()
        
        async def controlled_query(*args, **kwargs):
            await completion_event.wait()
            return "Controlled result"
        
        with patch('src.a2agw.execution.post_query_and_wait', side_effect=controlled_query):
            # Start execution in background
            exec_task = asyncio.create_task(self.executor.execute(self.mock_context, self.mock_event_queue))
            
            # Give it time to register the coroutine
            await asyncio.sleep(0.1)
            
            # Check that task is tracked
            async with self.executor.tasks_lock:
                self.assertIn("test-task-123", self.executor.active_coroutines)
            
            # Complete the query
            completion_event.set()
            await exec_task
            
            # Check that task is removed
            async with self.executor.tasks_lock:
                self.assertNotIn("test-task-123", self.executor.active_coroutines)
    
    async def test_cancel_active_task(self):
        """Test cancelling an active task"""
        # Create a mock asyncio.Task
        mock_task = MagicMock(spec=asyncio.Task)
        mock_task.cancel = MagicMock()
        
        # Add to active coroutines
        async with self.executor.tasks_lock:
            self.executor.active_coroutines["test-task-123"] = mock_task
        
        # Cancel the task
        await self.executor.cancel(self.mock_context, self.mock_event_queue)
        
        # Verify task was cancelled
        mock_task.cancel.assert_called_once()
        
        # Verify task was removed
        async with self.executor.tasks_lock:
            self.assertNotIn("test-task-123", self.executor.active_coroutines)
        
        # Verify cancellation event was sent
        self.mock_event_queue.enqueue_event.assert_called()
        last_event = self.mock_event_queue.enqueue_event.call_args[0][0]
        self.assertIsInstance(last_event, TaskStatusUpdateEvent)
        self.assertEqual(last_event.status.state, TaskState.canceled)
        self.assertTrue(last_event.final)
    
    async def test_cancel_inactive_task(self):
        """Test cancelling a task that's not active"""
        # Ensure no active tasks
        async with self.executor.tasks_lock:
            self.executor.active_coroutines.clear()
        
        # Try to cancel
        await self.executor.cancel(self.mock_context, self.mock_event_queue)
        
        # Should not send any events for inactive task
        self.mock_event_queue.enqueue_event.assert_not_called()
    
    async def test_handle_error(self):
        """Test error handling method"""
        error = ValueError("Test error")
        
        await self.executor._handle_error(
            error, 
            self.mock_event_queue,
            "ctx-123",
            "task-456"
        )
        
        # Should send error message and failure status
        calls = self.mock_event_queue.enqueue_event.call_args_list
        self.assertEqual(len(calls), 2)
        
        # Last event should be failure status
        last_event = calls[-1][0][0]
        self.assertIsInstance(last_event, TaskStatusUpdateEvent)
        self.assertEqual(last_event.status.state, TaskState.failed)
        self.assertTrue(last_event.final)
    
    def test_init_parameters(self):
        """Test initialization parameters are stored correctly"""
        executor = ARKAgentExecutor(target_name="my-agent", namespace="my-namespace")
        self.assertEqual(executor.target_name, "my-agent")
        self.assertEqual(executor.namespace, "my-namespace")
        self.assertIsNotNone(executor.tasks_lock)
        self.assertEqual(executor.active_coroutines, {})


if __name__ == "__main__":
    unittest.main()