"""SQLModel database models."""

from datetime import datetime
from typing import Any, Optional

from sqlmodel import JSON, Column, Field, SQLModel


class Session(SQLModel, table=True):
    """Session model - represents a session (corresponds to ARK session_id)."""
    
    __tablename__ = "sessions"
    
    id: str = Field(primary_key=True, description="Session ID")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Creation timestamp")
    updated_at: datetime = Field(default_factory=datetime.utcnow, description="Last update timestamp")


class Trace(SQLModel, table=True):
    """Trace model - represents an OTEL trace."""
    
    __tablename__ = "traces"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    trace_id: str = Field(index=True, description="OTEL Trace ID")
    session_id: str = Field(index=True, description="Session ID for ARK joins")
    start_time: datetime = Field(index=True, description="Trace start time")
    end_time: Optional[datetime] = Field(default=None, description="Trace end time")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Span(SQLModel, table=True):
    """Span model - represents an OTEL span."""
    
    __tablename__ = "spans"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    trace_id: str = Field(index=True, description="OTEL Trace ID")
    span_id: str = Field(index=True, description="OTEL Span ID")
    parent_span_id: Optional[str] = Field(default=None, index=True, description="OTEL Parent Span ID")
    session_id: str = Field(index=True, description="Session ID for ARK joins")
    name: str = Field(description="Span name")
    kind: str = Field(description="Span kind")
    start_time: datetime = Field(index=True, description="Span start time")
    end_time: Optional[datetime] = Field(default=None, description="Span end time")
    status: str = Field(default="ok", description="Span status (ok, error)")
    attributes: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON), description="Span attributes")
    resource_attrs: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON), description="Resource attributes")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SpanEvent(SQLModel, table=True):
    """SpanEvent model - represents an event within a span."""
    
    __tablename__ = "span_events"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    trace_id: str = Field(index=True, description="OTEL Trace ID")
    span_id: str = Field(index=True, description="OTEL Span ID")
    session_id: str = Field(index=True, description="Session ID for ARK joins")
    name: str = Field(description="Event name")
    time: datetime = Field(index=True, description="Event timestamp")
    attributes: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON), description="Event attributes")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Message(SQLModel, table=True):
    """Message model - represents an ARK conversation message."""
    
    __tablename__ = "messages"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: str = Field(index=True, description="Session ID")
    query_id: Optional[str] = Field(default=None, index=True, description="Query ID")
    message_data: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON), description="Message data")
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)

