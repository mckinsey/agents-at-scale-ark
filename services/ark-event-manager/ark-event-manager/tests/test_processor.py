"""Unit tests for EventProcessor."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from ark_event_manager.core.models import Event, EventSeverity, EventSourceType
from ark_event_manager.core.processor import EventProcessor


@pytest.mark.unit
class TestEventProcessor:
    """Unit tests for EventProcessor."""

    @pytest.fixture
    def mock_consumer(self):
        """Create a mock event consumer."""
        consumer = AsyncMock()
        consumer.consume_batch = AsyncMock(return_value=[])
        consumer.commit = AsyncMock()
        return consumer

    @pytest.fixture
    def mock_stream_storage(self):
        """Create a mock stream storage."""
        storage = AsyncMock()
        storage.write_stream = AsyncMock()
        return storage

    @pytest.fixture
    def mock_event_storage(self):
        """Create a mock event storage."""
        storage = AsyncMock()
        storage.persist_event = AsyncMock()
        return storage

    @pytest.fixture
    def processor(self, mock_consumer, mock_stream_storage, mock_event_storage):
        """Create an EventProcessor with mocked dependencies."""
        return EventProcessor(
            consumer=mock_consumer,
            stream_storage=mock_stream_storage,
            event_storage=mock_event_storage,
            batch_size=10,
            timeout=0.1,
        )

    async def test_process_event_routes_to_stream_storage(
        self, processor, mock_stream_storage, mock_event_storage
    ):
        """Test that query events are routed to stream storage."""
        from unittest.mock import patch
        
        # Create a mock event
        event = Event(
            event_id="test-123",
            timestamp=MagicMock(),
            type="query",
            subtype="execution_start",
            correlation_id="query-456",
            payload={"queryId": "query-456"},
        )
        
        # Create event dict for processing
        event_dict = event.model_dump()
        await processor._process_event(event_dict, "query-456")
        
        # Verify stream storage was called
        mock_stream_storage.write_stream.assert_called_once()
        call_args = mock_stream_storage.write_stream.call_args
        assert call_args[0][0] == "query-456"  # query_id
        assert "event_id" in call_args[0][1]  # event dict
        
        # Verify event storage was called
        mock_event_storage.persist_event.assert_called_once_with(event)

    async def test_process_event_sets_correlation_id(
        self, processor, mock_stream_storage, mock_event_storage
    ):
        """Test that correlation_id from header is set if event doesn't have one."""
        from unittest.mock import patch
        
        event = Event(
            event_id="test-123",
            timestamp=MagicMock(),
            type="workflow",
            correlation_id="",  # Empty correlation_id
        )
        
        # Create event dict without correlation_id
        event_dict = event.model_dump()
        event_dict.pop("correlation_id", None)
        await processor._process_event(event_dict, "header-correlation-123")
        
        # Verify correlation_id was set
        assert event.correlation_id == "header-correlation-123"
        mock_event_storage.persist_event.assert_called_once()

    async def test_route_event_query_execution_start(
        self, processor, mock_stream_storage
    ):
        """Test routing query execution_start events to stream storage."""
        from datetime import datetime, timezone
        
        event = Event(
            event_id="test-123",
            timestamp=datetime.now(timezone.utc),
            type="query",
            subtype="execution_start",
            payload={"queryId": "query-789"},
        )
        
        await processor._route_event(event)
        
        # Verify write_stream was called with correct query_id
        mock_stream_storage.write_stream.assert_called_once()
        call_args = mock_stream_storage.write_stream.call_args
        assert call_args[0][0] == "query-789"  # query_id
        assert isinstance(call_args[0][1], dict)  # event dict

    async def test_route_event_query_execution_complete(
        self, processor, mock_stream_storage
    ):
        """Test routing query execution_complete events to stream storage."""
        from datetime import datetime, timezone
        
        event = Event(
            event_id="test-123",
            timestamp=datetime.now(timezone.utc),
            type="query",
            subtype="execution_complete",
            correlation_id="query-999",  # Use correlation_id as fallback
        )
        
        await processor._route_event(event)
        
        # Verify write_stream was called with correct query_id (from correlation_id)
        mock_stream_storage.write_stream.assert_called_once()
        call_args = mock_stream_storage.write_stream.call_args
        assert call_args[0][0] == "query-999"  # query_id from correlation_id
        assert isinstance(call_args[0][1], dict)  # event dict

    async def test_route_event_non_query_skips_stream(
        self, processor, mock_stream_storage
    ):
        """Test that non-query events are not routed to stream storage."""
        event = Event(
            event_id="test-123",
            timestamp=MagicMock(),
            type="workflow",
            subtype="succeeded",
        )
        
        await processor._route_event(event)
        
        mock_stream_storage.write_stream.assert_not_called()

    async def test_route_event_no_stream_storage(self, processor):
        """Test routing when stream storage is not configured."""
        processor.stream_storage = None
        
        event = Event(
            event_id="test-123",
            timestamp=MagicMock(),
            type="query",
            subtype="execution_start",
            payload={"queryId": "query-123"},
        )
        
        # Should not raise an error
        await processor._route_event(event)

    def test_stop_processor(self, processor):
        """Test stopping the processor."""
        assert processor.running is False
        processor.running = True
        processor.stop()
        assert processor.running is False

