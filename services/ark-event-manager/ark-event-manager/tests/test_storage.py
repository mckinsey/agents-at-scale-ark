"""Unit tests for storage implementations."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from ark_event_manager.core.models import Event, EventSeverity, EventSourceType
from ark_event_manager.storage.events import EventStorage
from ark_event_manager.storage.memory import MemoryStorage


@pytest.mark.unit
class TestEventStorage:
    """Unit tests for EventStorage."""

    @pytest.fixture
    def storage(self):
        """Create an EventStorage instance."""
        return EventStorage()

    @pytest.fixture
    def sample_event(self):
        """Create a sample event for testing."""
        return Event(
            event_id="test-event-123",
            correlation_id="test-correlation-456",
            timestamp=MagicMock(),
            severity=EventSeverity.INFO,
            type="query",
            subtype="execution_start",
            source_type=EventSourceType.ARK_CONTROLLER,
            source="test-source",
            version="v1",
            payload={"key": "value"},
        )

    @pytest.mark.asyncio
    async def test_persist_event_success(self, storage, sample_event):
        """Test successfully persisting an event."""
        with patch(
            "ark_event_manager.storage.events.AsyncSessionLocal"
        ) as mock_session_local:
            mock_session = AsyncMock()
            mock_session_local.return_value.__aenter__.return_value = mock_session
            mock_session_local.return_value.__aexit__ = AsyncMock(return_value=None)
            
            await storage.persist_event(sample_event)
            
            # Verify event was added to session
            mock_session.add.assert_called_once()
            mock_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_persist_event_failure(self, storage, sample_event):
        """Test handling of persistence failure."""
        with patch(
            "ark_event_manager.storage.events.AsyncSessionLocal"
        ) as mock_session_local:
            mock_session = AsyncMock()
            mock_session.commit.side_effect = Exception("Database error")
            mock_session_local.return_value.__aenter__.return_value = mock_session
            mock_session_local.return_value.__aexit__ = AsyncMock(return_value=None)
            
            with pytest.raises(Exception, match="Database error"):
                await storage.persist_event(sample_event)


@pytest.mark.unit
class TestMemoryStorage:
    """Unit tests for MemoryStorage."""

    @pytest.fixture
    def storage(self):
        """Create a MemoryStorage instance."""
        return MemoryStorage()

    @pytest.mark.asyncio
    async def test_add_messages(self, storage):
        """Test adding messages to memory storage."""
        session_id = "session-123"
        query_id = "query-456"
        messages = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there!"},
        ]
        
        await storage.add_messages(session_id, query_id, messages)
        
        # Verify messages were stored
        retrieved = await storage.get_messages(session_id)
        assert len(retrieved) == 2
        assert retrieved[0]["role"] == "user"
        assert retrieved[1]["role"] == "assistant"

    @pytest.mark.asyncio
    async def test_get_messages_empty(self, storage):
        """Test getting messages from empty storage."""
        messages = await storage.get_messages("non-existent-session")
        assert messages == []

    @pytest.mark.asyncio
    async def test_get_messages_by_session(self, storage):
        """Test getting messages filtered by session."""
        await storage.add_messages("session-1", "query-1", [{"role": "user", "content": "Msg 1"}])
        await storage.add_messages("session-2", "query-2", [{"role": "user", "content": "Msg 2"}])
        
        messages = await storage.get_messages("session-1")
        assert len(messages) == 1
        assert messages[0]["content"] == "Msg 1"
        
        messages = await storage.get_messages("session-2")
        assert len(messages) == 1
        assert messages[0]["content"] == "Msg 2"

    @pytest.mark.asyncio
    async def test_add_messages_append(self, storage):
        """Test that adding messages appends to existing ones."""
        session_id = "session-123"
        query_id = "query-456"
        
        await storage.add_messages(session_id, query_id, [{"role": "user", "content": "First"}])
        await storage.add_messages(session_id, query_id, [{"role": "assistant", "content": "Second"}])
        
        messages = await storage.get_messages(session_id)
        assert len(messages) == 2
        assert messages[0]["content"] == "First"
        assert messages[1]["content"] == "Second"

