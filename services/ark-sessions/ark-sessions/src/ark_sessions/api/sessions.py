"""Session API endpoints."""

from typing import Any

from fastapi import APIRouter, Depends, Path
from sqlmodel.ext.asyncio import AsyncSession

from ark_sessions.core.database import get_session
from ark_sessions.storage.messages import MessageStorage
from ark_sessions.storage.sessions import SessionStorage
from ark_sessions.storage.traces import TraceStorage

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("")
async def list_sessions(
    session: AsyncSession = Depends(get_session),
) -> dict[str, list[str]]:
    """List all session IDs."""
    storage = SessionStorage(session)
    sessions = await storage.list_sessions()
    return {"sessions": sessions}


@router.get("/{session_id}")
async def get_session_by_id(
    session_id: str = Path(..., description="Session ID"),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Get session with hierarchical tree structure."""
    session_storage = SessionStorage(session)
    message_storage = MessageStorage(session)
    trace_storage = TraceStorage(session)
    
    # Get session
    session_obj = await session_storage.get_session(session_id)
    if not session_obj:
        return {
            "session_id": session_id,
            "messages": [],
            "traces": [],
            "spans": [],
            "span_events": [],
            "timeline": [],
        }
    
    # Get messages
    messages = await message_storage.get_messages(session_id=session_id)
    
    # Get traces and spans
    traces = await trace_storage.get_traces_by_session(session_id)
    all_spans = []
    all_span_events = []
    
    for trace in traces:
        spans = await trace_storage.get_spans_by_trace(trace.trace_id)
        all_spans.extend(spans)
        
        for span in spans:
            events = await trace_storage.get_span_events_by_span(span.span_id)
            all_span_events.extend(events)
    
    # Build timeline
    timeline = []
    for msg in messages:
        timeline.append({
            "type": "message",
            "timestamp": msg.created_at.isoformat() if msg.created_at else None,
            "data": {
                "id": msg.id,
                "session_id": msg.session_id,
                "query_id": msg.query_id,
                "message_data": msg.message_data,
            },
        })
    
    for trace in traces:
        timeline.append({
            "type": "trace",
            "timestamp": trace.start_time.isoformat() if trace.start_time else None,
            "data": {
                "trace_id": trace.trace_id,
                "session_id": trace.session_id,
                "start_time": trace.start_time.isoformat() if trace.start_time else None,
                "end_time": trace.end_time.isoformat() if trace.end_time else None,
            },
        })
    
    for span in all_spans:
        timeline.append({
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
        })
    
    for event in all_span_events:
        timeline.append({
            "type": "span_event",
            "timestamp": event.time.isoformat() if event.time else None,
            "data": {
                "trace_id": event.trace_id,
                "span_id": event.span_id,
                "name": event.name,
                "attributes": event.attributes,
            },
        })
    
    # Sort timeline by timestamp
    timeline.sort(key=lambda x: x.get("timestamp") or "")
    
    return {
        "session_id": session_id,
        "messages": [
            {
                "id": msg.id,
                "session_id": msg.session_id,
                "query_id": msg.query_id,
                "message_data": msg.message_data,
                "created_at": msg.created_at.isoformat() if msg.created_at else None,
            }
            for msg in messages
        ],
        "traces": [
            {
                "trace_id": trace.trace_id,
                "session_id": trace.session_id,
                "start_time": trace.start_time.isoformat() if trace.start_time else None,
                "end_time": trace.end_time.isoformat() if trace.end_time else None,
            }
            for trace in traces
        ],
        "spans": [
            {
                "trace_id": span.trace_id,
                "span_id": span.span_id,
                "parent_span_id": span.parent_span_id,
                "name": span.name,
                "kind": span.kind,
                "status": span.status,
                "start_time": span.start_time.isoformat() if span.start_time else None,
                "end_time": span.end_time.isoformat() if span.end_time else None,
            }
            for span in all_spans
        ],
        "span_events": [
            {
                "trace_id": event.trace_id,
                "span_id": event.span_id,
                "name": event.name,
                "time": event.time.isoformat() if event.time else None,
                "attributes": event.attributes,
            }
            for event in all_span_events
        ],
        "timeline": timeline,
    }

__all__ = ["router"]

