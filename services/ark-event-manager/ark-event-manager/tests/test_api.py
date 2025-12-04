"""Unit tests for API endpoints."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import Request
from fastapi.testclient import TestClient

from ark_event_manager.api.events import receive_event, set_consumer
from ark_event_manager.api.memory import add_messages, get_messages, set_storage


@pytest.mark.unit
class TestEventsAPI:
    """Unit tests for events API endpoints."""

    @pytest.fixture
    def mock_consumer(self):
        """Create a mock event consumer."""
        consumer = AsyncMock()
        consumer.enqueue = AsyncMock()
        return consumer

    @pytest.fixture
    def mock_request(self):
        """Create a mock FastAPI request."""
        request = MagicMock(spec=Request)
        request.json = AsyncMock(return_value={
            "event_id": "test-123",
            "type": "query",
            "subtype": "execution_start",
            "severity": "INFO",
            "source_type": "ARK_CONTROLLER",
            "source": "test",
            "version": "v1",
            "payload": {}
        })
        return request

    @pytest.mark.asyncio
    async def test_receive_event_success(self, mock_consumer, mock_request):
        """Test successfully receiving an event."""
        set_consumer(mock_consumer)
        
        response = await receive_event(mock_request, "test-correlation-123")
        
        assert response.status_code == 202
        assert b"accepted" in response.body
        mock_consumer.enqueue.assert_called_once()

    @pytest.mark.asyncio
    async def test_receive_event_empty_body(self, mock_consumer):
        """Test receiving an event with empty body."""
        set_consumer(mock_consumer)
        request = MagicMock(spec=Request)
        request.json = AsyncMock(return_value={})
        
        from fastapi import HTTPException
        
        with pytest.raises(HTTPException) as exc_info:
            await receive_event(request, "test-correlation")
        
        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_receive_event_no_consumer(self, mock_request):
        """Test receiving an event when consumer is not initialized."""
        set_consumer(None)
        
        from fastapi import HTTPException
        
        with pytest.raises(HTTPException) as exc_info:
            await receive_event(mock_request, "test-correlation")
        
        assert exc_info.value.status_code == 503

    @pytest.mark.asyncio
    async def test_receive_event_enqueue_error(self, mock_consumer, mock_request):
        """Test handling of errors during event enqueue."""
        set_consumer(mock_consumer)
        mock_consumer.enqueue.side_effect = Exception("Enqueue failed")
        
        from fastapi import HTTPException
        
        with pytest.raises(HTTPException) as exc_info:
            await receive_event(mock_request, "test-correlation")
        
        assert exc_info.value.status_code == 500


@pytest.mark.unit
class TestMemoryAPI:
    """Unit tests for memory API endpoints."""

    @pytest.fixture
    def mock_memory_storage(self):
        """Create a mock memory storage."""
        storage = AsyncMock()
        storage.add_messages = AsyncMock()
        storage.get_messages = AsyncMock(return_value=[])
        return storage

    @pytest.mark.asyncio
    async def test_add_messages_success(self, mock_memory_storage):
        """Test successfully adding messages."""
        set_storage(mock_memory_storage)
        
        data = {
            "session_id": "session-123",
            "query_id": "query-456",
            "messages": [{"role": "user", "content": "Hello"}],
        }
        
        response = await add_messages(data)
        
        assert response["status"] == "ok"
        mock_memory_storage.add_messages.assert_called_once_with(
            "session-123", "query-456", [{"role": "user", "content": "Hello"}]
        )

    @pytest.mark.asyncio
    async def test_add_messages_missing_session_id(self, mock_memory_storage):
        """Test adding messages without session_id."""
        set_storage(mock_memory_storage)
        
        from fastapi import HTTPException
        
        data = {
            "query_id": "query-456",
            "messages": [{"role": "user", "content": "Hello"}],
        }
        
        with pytest.raises(HTTPException) as exc_info:
            await add_messages(data)
        
        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_add_messages_empty_messages(self, mock_memory_storage):
        """Test adding messages with empty messages array."""
        set_storage(mock_memory_storage)
        
        from fastapi import HTTPException
        
        data = {
            "session_id": "session-123",
            "query_id": "query-456",
            "messages": [],
        }
        
        with pytest.raises(HTTPException) as exc_info:
            await add_messages(data)
        
        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_get_messages_success(self, mock_memory_storage):
        """Test successfully getting messages."""
        set_storage(mock_memory_storage)
        
        session_id = "session-123"
        mock_messages = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi!"},
        ]
        mock_memory_storage.get_messages.return_value = mock_messages
        
        response = await get_messages(session_id)
        
        assert response["messages"] == mock_messages
        mock_memory_storage.get_messages.assert_called_once_with(session_id)

    @pytest.mark.asyncio
    async def test_get_messages_no_storage(self):
        """Test getting messages when storage is not initialized."""
        set_storage(None)
        
        from fastapi import HTTPException
        
        with pytest.raises(HTTPException) as exc_info:
            await get_messages("session-123")
        
        assert exc_info.value.status_code == 503

