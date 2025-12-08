"""SSE endpoints for session events and queries."""

import json
from typing import Any

from fastapi import Depends, Path
from fastapi.responses import StreamingResponse
from sqlmodel.ext.asyncio import AsyncSession

from ark_sessions.core.database import get_session
from ark_sessions.models import SessionEvent
from ark_sessions.storage.events import EventStorage
from ark_sessions.storage.sessions import SessionStorage


async def stream_session_events(
    session_id: str = Path(..., description="Session ID"),
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    """Stream all events for a session via SSE."""
    event_storage = EventStorage(session)
    session_storage = SessionStorage(session)
    
    # Check if session exists
    session_obj = await session_storage.get_session(session_id)
    if not session_obj:
        # Return empty stream
        async def empty_generator():
            yield f"data: {json.dumps({'type': 'error', 'message': 'Session not found'})}\n\n"
        
        return StreamingResponse(
            empty_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        )
    
    async def event_generator():
        # Send initial events
        events = await event_storage.get_events_by_session(session_id)
        for event in events:
            yield f"data: {json.dumps(event.model_dump(mode='json'))}\n\n"
        
        # TODO: Implement pub/sub for real-time updates using PostgreSQL LISTEN/NOTIFY
        # For now, just send initial events
        
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


async def stream_session_queries(
    session_id: str = Path(..., description="Session ID"),
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    """Stream query events for a session via SSE."""
    event_storage = EventStorage(session)
    session_storage = SessionStorage(session)
    
    # Check if session exists
    session_obj = await session_storage.get_session(session_id)
    if not session_obj:
        async def empty_generator():
            yield f"data: {json.dumps({'type': 'error', 'message': 'Session not found'})}\n\n"
        
        return StreamingResponse(
            empty_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        )
    
    async def query_generator():
        # Get only query-related events (QueryStart, QueryComplete)
        events = await event_storage.get_events_by_session(session_id)
        query_events = [
            event for event in events
            if event.reason in ("QueryStart", "QueryComplete")
        ]
        
        for event in query_events:
            yield f"data: {json.dumps(event.model_dump(mode='json'))}\n\n"
        
        # TODO: Implement pub/sub for real-time updates using PostgreSQL LISTEN/NOTIFY
        
    return StreamingResponse(
        query_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )

