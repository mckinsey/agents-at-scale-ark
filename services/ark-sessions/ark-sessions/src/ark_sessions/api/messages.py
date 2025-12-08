"""Message API handlers."""

from typing import Any

from fastapi import Depends, Query
from pydantic import BaseModel
from sqlmodel.ext.asyncio import AsyncSession

from ark_sessions.core.database import get_session
from ark_sessions.models import Message
from ark_sessions.storage.messages import MessageStorage


class AddMessageRequest(BaseModel):
    """Request model for adding messages."""
    
    session_id: str
    query_id: str | None = None
    messages: list[dict[str, Any]]


class StatusResponse(BaseModel):
    """Standard status response."""
    status: str


async def add_messages(
    request: AddMessageRequest,
    session: AsyncSession = Depends(get_session),
) -> StatusResponse:
    """Add messages to a session."""
    storage = MessageStorage(session)
    await storage.add_messages(
        session_id=request.session_id,
        messages=request.messages,
        query_id=request.query_id,
    )
    return StatusResponse(status="ok")


async def get_messages(
    session_id: str | None = Query(None, description="Filter by session ID"),
    query_id: str | None = Query(None, description="Filter by query ID"),
    session: AsyncSession = Depends(get_session),
) -> list[Message]:
    """Get messages, optionally filtered by session_id or query_id."""
    storage = MessageStorage(session)
    return await storage.get_messages(session_id=session_id, query_id=query_id)

