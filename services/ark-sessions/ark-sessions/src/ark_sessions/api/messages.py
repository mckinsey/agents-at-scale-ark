"""Message API handlers."""

from typing import Any, Optional

from fastapi import Depends, Query
from pydantic import BaseModel
from sqlmodel.ext.asyncio import AsyncSession

from ark_sessions.core.database import get_session
from ark_sessions.storage.messages import MessageStorage


class AddMessageRequest(BaseModel):
    """Request model for adding messages."""
    
    session_id: str
    query_id: Optional[str] = None
    messages: list[dict[str, Any]]


async def add_messages(
    request: AddMessageRequest,
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    """Add messages to a session."""
    storage = MessageStorage(session)
    await storage.add_messages(
        session_id=request.session_id,
        messages=request.messages,
        query_id=request.query_id,
    )
    return {"status": "ok"}


async def get_messages(
    session_id: Optional[str] = Query(None, description="Filter by session ID"),
    query_id: Optional[str] = Query(None, description="Filter by query ID"),
    session: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    """Get messages, optionally filtered by session_id or query_id."""
    storage = MessageStorage(session)
    messages = await storage.get_messages(session_id=session_id, query_id=query_id)
    
    return {
        "messages": [
            {
                "id": msg.id,
                "session_id": msg.session_id,
                "query_id": msg.query_id,
                "message_data": msg.message_data,
                "created_at": msg.created_at.isoformat() if msg.created_at else None,
            }
            for msg in messages
        ]
    }

