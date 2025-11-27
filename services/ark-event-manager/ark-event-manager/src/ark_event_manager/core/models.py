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
- Source: HTTP API (POST /messages) or embedded in Events
- Stored in `messages` table

Note: Messages can arrive via Events when event.type="memory" or event.subtype contains "message".
"""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON
from sqlmodel import Column, Field, SQLModel


class Event(SQLModel, table=True):
    """
    Event model for database storage.

    Represents system telemetry/observability events (not conversation messages).
    Examples: query execution started, workflow completed, pod logs, errors.

    See models.py docstring for Events vs Messages distinction.
    """

    __tablename__ = "events"

    id: int | None = Field(default=None, primary_key=True)
    event_id: str = Field(unique=True, index=True)
    correlation_id: str = Field(index=True)
    timestamp: datetime = Field(index=True)
    severity: str
    type: str = Field(index=True)
    subtype: str
    source_type: str
    source: str
    version: str = Field(default="v1")
    payload: dict[str, Any] = Field(
        default_factory=dict, sa_column=Column(JSON)
    )
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


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
