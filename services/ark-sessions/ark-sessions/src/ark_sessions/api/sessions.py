"""Session API handlers."""

from typing import Any

from fastapi import Depends, Path
from sqlmodel.ext.asyncio import AsyncSession

from ark_sessions.core.database import get_session
from ark_sessions.models import Message
from ark_sessions.storage.messages import MessageStorage
from ark_sessions.storage.sessions import SessionStorage
from ark_sessions.storage.traces import TraceStorage


async def list_sessions(
    session: AsyncSession = Depends(get_session),
) -> dict[str, list[str]]:
    """List all session IDs."""
    storage = SessionStorage(session)
    sessions = await storage.list_sessions()
    return {"sessions": sessions}


def _empty_session_response(session_id: str) -> dict[str, Any]:
    """Return empty session response."""
    return {
        "session_id": session_id,
        "messages": [],
        "traces": [],
        "spans": [],
        "span_events": [],
        "timeline": [],
    }


async def _fetch_session_data(
    session_id: str,
    message_storage: MessageStorage,
    trace_storage: TraceStorage,
) -> tuple[list[Message], list[Any], list[Any], list[Any]]:
    """Fetch all session data (messages, traces, spans, span_events)."""
    messages = await message_storage.get_messages(session_id=session_id)
    traces = await trace_storage.get_traces_by_session(session_id)
    
    all_spans = []
    all_span_events = []
    
    for trace in traces:
        spans = await trace_storage.get_spans_by_trace(trace.trace_id)
        all_spans.extend(spans)
        
        for span in spans:
            events = await trace_storage.get_span_events_by_span(span.span_id)
            all_span_events.extend(events)
    
    return messages, traces, all_spans, all_span_events


def _build_message_timeline_items(messages: list[Message]) -> list[dict[str, Any]]:
    """Build timeline items for messages."""
    return [
        {
            "type": "message",
            "timestamp": msg.created_at.isoformat() if msg.created_at else None,
            "data": {
                "id": msg.id,
                "session_id": msg.session_id,
                "query_id": msg.query_id,
                "message_data": msg.message_data,
            },
        }
        for msg in messages
    ]


def _build_trace_timeline_items(traces: list[Any]) -> list[dict[str, Any]]:
    """Build timeline items for traces."""
    return [
        {
            "type": "trace",
            "timestamp": trace.start_time.isoformat() if trace.start_time else None,
            "data": {
                "trace_id": trace.trace_id,
                "session_id": trace.session_id,
                "start_time": trace.start_time.isoformat() if trace.start_time else None,
                "end_time": trace.end_time.isoformat() if trace.end_time else None,
            },
        }
        for trace in traces
    ]


def _build_span_timeline_items(spans: list[Any]) -> list[dict[str, Any]]:
    """Build timeline items for spans."""
    return [
        {
            "type": "span",
            "timestamp": span.start_time.isoformat() if span.start_time else None,
            "data": {
                "trace_id": span.trace_id,
                "span_id": span.span_id,
                "parent_span_id": span.parent_span_id,
                "name": span.name,
                "kind": span.kind,
                "status": span.status,
            },
        }
        for span in spans
    ]


def _build_span_event_timeline_items(span_events: list[Any]) -> list[dict[str, Any]]:
    """Build timeline items for span events."""
    return [
        {
            "type": "span_event",
            "timestamp": event.time.isoformat() if event.time else None,
            "data": {
                "trace_id": event.trace_id,
                "span_id": event.span_id,
                "name": event.name,
                "attributes": event.attributes,
            },
        }
        for event in span_events
    ]


def _build_timeline(
    messages: list[Message],
    traces: list[Any],
    spans: list[Any],
    span_events: list[Any],
) -> list[dict[str, Any]]:
    """Build sorted timeline from all items."""
    timeline = []
    timeline.extend(_build_message_timeline_items(messages))
    timeline.extend(_build_trace_timeline_items(traces))
    timeline.extend(_build_span_timeline_items(spans))
    timeline.extend(_build_span_event_timeline_items(span_events))
    timeline.sort(key=lambda x: x.get("timestamp") or "")
    return timeline


async def get_session_by_id(
    session_id: str = Path(..., description="Session ID"),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Get session with hierarchical tree structure."""
    session_storage = SessionStorage(session)
    message_storage = MessageStorage(session)
    trace_storage = TraceStorage(session)
    
    session_obj = await session_storage.get_session(session_id)
    if not session_obj:
        return _empty_session_response(session_id)
    
    messages, traces, spans, span_events = await _fetch_session_data(
        session_id, message_storage, trace_storage
    )
    
    timeline = _build_timeline(messages, traces, spans, span_events)
    
    return {
        "session_id": session_id,
        "messages": messages,
        "traces": traces,
        "spans": spans,
        "span_events": span_events,
        "timeline": timeline,
    }

