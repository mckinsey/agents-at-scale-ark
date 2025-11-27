"""SQLModel database models."""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON
from sqlmodel import Column, Field, SQLModel


class Event(SQLModel, table=True):
    """Event model for database storage."""

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
    """Message model for conversation history storage."""

    __tablename__ = "messages"

    id: int | None = Field(default=None, primary_key=True)
    session_id: str = Field(index=True)
    query_id: str | None = Field(default=None, index=True)
    message_data: dict[str, Any] = Field(sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)

