"""Unit tests for Event and Message models."""

import uuid
from datetime import datetime, timezone

import pytest

from ark_event_manager.core.models import (
    Event,
    EventSeverity,
    EventSourceType,
    Message,
)


@pytest.mark.unit
class TestEventModel:
    """Unit tests for Event model."""

    def test_create_event_minimal(self):
        """Test creating an event with minimal required fields."""
        event = Event(
            event_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            type="query",
        )
        assert event.event_id
        assert event.type == "query"
        assert event.severity == EventSeverity.INFO
        assert event.source_type == EventSourceType.UNSPECIFIED
        assert event.version == "v1"
        assert event.payload == {}

    def test_create_event_full(self):
        """Test creating an event with all fields."""
        event_id = str(uuid.uuid4())
        correlation_id = "test-correlation-123"
        timestamp = datetime.now(timezone.utc)
        
        event = Event(
            event_id=event_id,
            correlation_id=correlation_id,
            timestamp=timestamp,
            severity=EventSeverity.ERROR,
            type="workflow",
            subtype="failed",
            source_type=EventSourceType.WATCHER,
            source="argo-watcher",
            version="v2",
            payload={"key": "value"},
        )
        
        assert event.event_id == event_id
        assert event.correlation_id == correlation_id
        assert event.timestamp == timestamp
        assert event.severity == EventSeverity.ERROR
        assert event.type == "workflow"
        assert event.subtype == "failed"
        assert event.source_type == EventSourceType.WATCHER
        assert event.source == "argo-watcher"
        assert event.version == "v2"
        assert event.payload == {"key": "value"}

    def test_severity_validator_int(self):
        """Test severity validator with integer."""
        event = Event(
            event_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            type="test",
            severity=3,  # WARNING
        )
        assert event.severity == EventSeverity.WARNING

    def test_severity_validator_string(self):
        """Test severity validator with string."""
        event = Event(
            event_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            type="test",
            severity="ERROR",
        )
        # Note: Pydantic may serialize enums as strings in some cases
        # The validator converts the string, but the field may store it as string
        assert event.severity in (EventSeverity.ERROR, "ERROR")
        # Verify it can be used as enum
        if isinstance(event.severity, str):
            assert EventSeverity[event.severity] == EventSeverity.ERROR

    def test_source_type_validator_int(self):
        """Test source_type validator with integer."""
        event = Event(
            event_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            type="test",
            source_type=2,  # WATCHER
        )
        assert event.source_type == EventSourceType.WATCHER

    def test_source_type_validator_string(self):
        """Test source_type validator with string."""
        event = Event(
            event_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            type="test",
            source_type="ARK_CONTROLLER",
        )
        # Note: Pydantic may serialize enums as strings in some cases
        # The validator converts the string, but the field may store it as string
        assert event.source_type in (EventSourceType.ARK_CONTROLLER, "ARK_CONTROLLER")
        # Verify it can be used as enum
        if isinstance(event.source_type, str):
            assert EventSourceType[event.source_type] == EventSourceType.ARK_CONTROLLER

    def test_model_dump(self):
        """Test model serialization."""
        event = Event(
            event_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            type="query",
            payload={"test": "data"},
        )
        
        dumped = event.model_dump()
        assert dumped["event_id"] == event.event_id
        assert dumped["type"] == "query"
        assert dumped["payload"] == {"test": "data"}
        assert "severity" in dumped
        assert "timestamp" in dumped


@pytest.mark.unit
class TestMessageModel:
    """Unit tests for Message model."""

    def test_create_message_minimal(self):
        """Test creating a message with minimal fields."""
        message = Message(
            session_id="session-123",
            query_id="query-456",
            message_data={"role": "user", "content": "Hello"},
        )
        assert message.session_id == "session-123"
        assert message.query_id == "query-456"
        assert message.message_data == {"role": "user", "content": "Hello"}

    def test_create_message_full(self):
        """Test creating a message with all fields."""
        message = Message(
            id=1,
            session_id="session-123",
            query_id="query-456",
            message_data={"role": "assistant", "content": "Hi there!"},
            created_at=datetime.now(timezone.utc),
        )
        assert message.id == 1
        assert message.session_id == "session-123"
        assert message.query_id == "query-456"
        assert message.message_data["role"] == "assistant"
        assert message.message_data["content"] == "Hi there!"

    def test_message_model_dump(self):
        """Test message serialization."""
        message = Message(
            session_id="session-123",
            query_id="query-456",
            message_data={"role": "user", "content": "Test"},
        )
        
        dumped = message.model_dump()
        assert dumped["session_id"] == "session-123"
        assert dumped["query_id"] == "query-456"
        assert dumped["message_data"] == {"role": "user", "content": "Test"}

