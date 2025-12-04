"""SQLModel database models.

## Conceptual Overview

### Events vs Messages

**Events** are system telemetry/observability records:
- Track what happened in the system (query started, workflow completed, errors, etc.)
- Structured schema with severity, type, subtype, source_type
- Used for debugging, analytics, audit trails
- Source: JSON Event messages from controllers/watchers via HTTP API
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
    - JSON deserialization and validation (without id/created_at)
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
