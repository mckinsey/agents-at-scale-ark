"""Pydantic models for events."""

from datetime import datetime
from enum import IntEnum
from typing import Any

from pydantic import BaseModel, Field, field_validator


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


class EventModel(BaseModel):
    """Pydantic model for deserialized events."""

    event_id: str = Field(..., description="Unique event identifier (UUID)")
    correlation_id: str = Field(default="", description="Correlation ID for grouping events")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Event timestamp")
    severity: EventSeverity = Field(default=EventSeverity.INFO, description="Event severity")
    type: str = Field(..., description="Event type (e.g., 'query', 'workflow', 'pod')")
    subtype: str = Field(default="", description="Event subtype")
    source_type: EventSourceType = Field(
        default=EventSourceType.UNSPECIFIED, description="Source type"
    )
    source: str = Field(default="", description="Source identifier")
    version: str = Field(default="v1", description="Schema version")
    payload: dict[str, Any] = Field(default_factory=dict, description="Event payload data")

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
        "use_enum_values": True,
        "json_encoders": {
            datetime: lambda v: v.isoformat(),
            EventSeverity: lambda v: v.name,
            EventSourceType: lambda v: v.name,
        },
    }

