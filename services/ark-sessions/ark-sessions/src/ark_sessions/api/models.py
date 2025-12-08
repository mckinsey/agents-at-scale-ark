"""Pydantic models for API responses."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class TraceResponse(BaseModel):
    """Trace response model."""
    trace_id: str
    session_id: str
    start_time: datetime
    end_time: datetime | None = None


class SpanResponse(BaseModel):
    """Span response model."""
    trace_id: str
    span_id: str
    parent_span_id: str | None = None
    session_id: str
    name: str
    kind: str
    start_time: datetime
    end_time: datetime | None = None
    status: str
    attributes: dict[str, Any]
    resource_attrs: dict[str, Any]


class SpanEventResponse(BaseModel):
    """SpanEvent response model."""
    trace_id: str
    span_id: str
    session_id: str
    name: str
    time: datetime
    attributes: dict[str, Any]

