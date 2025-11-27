"""SQLModel database models.

## Conceptual Overview

### Events vs Messages

**Events** are system telemetry/observability records:
- Track what happened in the system (query started, workflow completed, errors, etc.)
- Structured schema with severity, type, subtype, source_type
- Used for debugging, analytics, audit trails
- Source: Protobuf Event messages from controllers/watchers
- Stored in `events` table

**Messages** are conversation/chat content:
- Store user-assistant conversation turns
- Simple schema: session_id, query_id, message_data
- Used for conversation memory and context
- Source: HTTP API (POST /messages) only
- Stored in `messages` table
"""

import logging
import uuid
from datetime import datetime
from enum import IntEnum
from typing import Any

from pydantic import field_validator
from sqlalchemy import JSON
from sqlmodel import Column, Field, SQLModel

from ark_event_manager.core.types import Protobuf

logger = logging.getLogger(__name__)


class EventSeverity(IntEnum):
    """Event severity levels."""

    UNSPECIFIED = 0
    DEBUG = 1
    INFO = 2
    WARNING = 3
    ERROR = 4
    CRITICAL = 5


class EventSourceType(IntEnum):
    """Event source types."""

    UNSPECIFIED = 0
    ARK_CONTROLLER = 1
    WATCHER = 2
    SERVICE = 3
    USER = 4
    K8S = 5


class Event(SQLModel, table=True):
    """
    Event model for validation and database storage.

    Represents system telemetry/observability events (not conversation messages).
    Examples: query execution started, workflow completed, pod logs, errors.

    Can be used for:
    - Protobuf deserialization and validation (without id/created_at)
    - Database persistence (with id/created_at)

    See models.py docstring for Events vs Messages distinction.
    """

    __tablename__ = "events"

    id: int | None = Field(default=None, primary_key=True)
    event_id: str = Field(..., description="Unique event identifier (UUID)", unique=True, index=True)
    correlation_id: str = Field(default="", description="Correlation ID for grouping events", index=True)
    timestamp: datetime = Field(..., description="Event timestamp", index=True)
    severity: EventSeverity = Field(default=EventSeverity.INFO, description="Event severity")
    type: str = Field(..., description="Event type (e.g., 'query', 'workflow', 'pod')", index=True)
    subtype: str = Field(default="", description="Event subtype")
    source_type: EventSourceType = Field(
        default=EventSourceType.UNSPECIFIED, description="Source type"
    )
    source: str = Field(default="", description="Source identifier")
    version: str = Field(default="v1", description="Schema version")
    payload: dict[str, Any] = Field(
        default_factory=dict, description="Event payload data", sa_column=Column(JSON)
    )
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)

    @field_validator("severity", mode="before")
    @classmethod
    def parse_severity(cls, v: Any) -> EventSeverity:
        """Parse severity from int or string."""
        if isinstance(v, EventSeverity):
            return v
        if isinstance(v, str):
            try:
                return EventSeverity[v.upper()]
            except KeyError:
                return EventSeverity.INFO
        if isinstance(v, int):
            try:
                return EventSeverity(v)
            except ValueError:
                return EventSeverity.INFO
        return EventSeverity.INFO

    @field_validator("source_type", mode="before")
    @classmethod
    def parse_source_type(cls, v: Any) -> EventSourceType:
        """Parse source type from int or string."""
        if isinstance(v, EventSourceType):
            return v
        if isinstance(v, str):
            try:
                return EventSourceType[v.upper()]
            except KeyError:
                return EventSourceType.UNSPECIFIED
        if isinstance(v, int):
            try:
                return EventSourceType(v)
            except ValueError:
                return EventSourceType.UNSPECIFIED
        return EventSourceType.UNSPECIFIED

    @field_validator("timestamp", mode="before")
    @classmethod
    def parse_timestamp(cls, v: Any) -> datetime:
        """Parse timestamp from various formats."""
        if isinstance(v, datetime):
            return v
        if isinstance(v, str):
            try:
                return datetime.fromisoformat(v.replace("Z", "+00:00"))
            except Exception:
                return datetime.utcnow()
        if isinstance(v, dict):
            seconds = v.get("seconds", 0)
            nanos = v.get("nanos", 0)
            return datetime.fromtimestamp(seconds + nanos / 1e9, tz=None)
        return datetime.utcnow()

    @classmethod
    def from_protobuf(cls, event_bytes: Protobuf) -> "Event":
        """
        Create an Event instance from protobuf-serialized bytes.

        Args:
            event_bytes: Protobuf-serialized Event message (Protobuf type)

        Returns:
            Event instance

        Raises:
            ValueError: If event cannot be parsed
        """
        try:
            event_dict: dict[str, Any] = {
                "event_id": str(uuid.uuid4()),
                "timestamp": datetime.utcnow(),
                "payload": {},
            }

            try:
                from google.protobuf.json_format import MessageToDict

                protobuf_message = cls._parse_protobuf_message(event_bytes)
                event_dict = MessageToDict(
                    protobuf_message,
                    including_default_value_fields=True,
                    preserving_proto_field_name=True,
                )
                if "timestamp" in event_dict and isinstance(event_dict["timestamp"], dict):
                    event_dict["timestamp"] = cls._parse_timestamp_from_dict(
                        event_dict["timestamp"]
                    )
            except Exception:
                event_dict = cls._parse_simple_protobuf(event_bytes)

            if not event_dict.get("event_id"):
                event_dict["event_id"] = str(uuid.uuid4())

            if not event_dict.get("timestamp"):
                event_dict["timestamp"] = datetime.utcnow()

            if not event_dict.get("payload"):
                event_dict["payload"] = {}

            return cls.model_validate(event_dict, strict=False)
        except Exception as e:
            logger.error(f"Failed to parse protobuf event: {e}", exc_info=True)
            raise ValueError(f"Invalid protobuf event: {e}") from e

    @staticmethod
    def _parse_protobuf_message(event_bytes: Protobuf) -> Any:
        """Try to parse using protobuf library if available."""
        try:
            from google.protobuf.message import Message

            class DynamicEvent(Message):
                pass

            event = DynamicEvent()
            event.ParseFromString(event_bytes)
            return event
        except Exception:
            raise ValueError("Cannot parse protobuf message")

    @staticmethod
    def _parse_simple_protobuf(event_bytes: Protobuf) -> dict[str, Any]:
        """Fallback simple parser for basic protobuf structure."""
        event_dict: dict[str, Any] = {
            "event_id": str(uuid.uuid4()),
            "correlation_id": "",
            "timestamp": datetime.utcnow(),
            "severity": 2,
            "type": "unknown",
            "subtype": "",
            "source_type": 0,
            "source": "",
            "version": "v1",
            "payload": {},
        }

        try:
            if len(event_bytes) > 0:
                event_dict["payload"] = {"raw_size": len(event_bytes)}
        except Exception:
            pass

        return event_dict

    @staticmethod
    def _parse_timestamp_from_dict(timestamp_dict: dict[str, Any]) -> datetime:
        """Parse timestamp from protobuf JSON format."""
        try:
            seconds = timestamp_dict.get("seconds", 0)
            nanos = timestamp_dict.get("nanos", 0)
            return datetime.fromtimestamp(seconds + nanos / 1e9, tz=None)
        except Exception:
            return datetime.utcnow()

    model_config = {
        "use_enum_values": False,  # Keep enum objects, convert to strings in storage layer
        "json_encoders": {
            datetime: lambda v: v.isoformat(),
            EventSeverity: lambda v: v.name,
            EventSourceType: lambda v: v.name,
        },
    }


class Message(SQLModel, table=True):
    """
    Message model for conversation history storage.

    Represents conversation/chat messages (not system events).
    Examples: user questions, assistant responses, conversation turns.

    See models.py docstring for Events vs Messages distinction.
    """

    __tablename__ = "messages"

    id: int | None = Field(default=None, primary_key=True)
    session_id: str = Field(index=True)
    query_id: str | None = Field(default=None, index=True)
    message_data: dict[str, Any] = Field(sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
