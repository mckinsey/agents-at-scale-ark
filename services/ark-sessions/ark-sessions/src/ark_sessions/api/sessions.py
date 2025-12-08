"""Session API handlers."""

from typing import Any

from fastapi import Depends, Path
from pydantic import BaseModel
from sqlmodel.ext.asyncio import AsyncSession

from ark_sessions.core.database import get_session
from ark_sessions.models import Message, SessionEvent
from ark_sessions.storage.events import EventStorage
from ark_sessions.storage.messages import MessageStorage
from ark_sessions.storage.sessions import SessionStorage


class Query(BaseModel):
    """Query model - derived from events."""
    id: str
    name: str
    status: str  # "in_progress" or "completed"
    duration_ms: float | None = None


class Conversation(BaseModel):
    """Conversation model - derived from messages."""
    id: str
    firstMessage: dict[str, Any] | None = None
    lastMessage: dict[str, Any] | None = None


class Session(BaseModel):
    """Session model - derived state from events (event sourcing pattern)."""
    id: str
    queries: list[Query]
    conversations: list[Conversation]


class SessionsList(BaseModel):
    """List of sessions response."""
    sessions: list[str]


async def list_sessions(
    session: AsyncSession = Depends(get_session),
) -> SessionsList:
    """List all session IDs."""
    storage = SessionStorage(session)
    sessions = await storage.list_sessions()
    return SessionsList(sessions=sessions)


def _empty_session_response(session_id: str) -> Session:
    """Return empty session response per spec."""
    return Session(id=session_id, queries=[], conversations=[])


def _derive_queries_from_events(events: list[SessionEvent]) -> list[Query]:
    """Derive queries from events (QueryStart/QueryComplete)."""
    queries = {}
    
    for event in events:
        if event.reason in ("QueryStart", "QueryComplete") and event.query_id:
            query_id = event.query_id
            if query_id not in queries:
                queries[query_id] = Query(
                    id=query_id,
                    name=event.query_name or "",
                    status="in_progress",
                )
            
            if event.reason == "QueryComplete":
                queries[query_id].status = "completed"
                if event.duration_ms is not None:
                    queries[query_id].duration_ms = event.duration_ms
    
    return list(queries.values())


def _derive_conversations_from_messages(messages: list[Message]) -> list[Conversation]:
    """Derive conversations from messages."""
    conversations = {}
    
    for msg in messages:
        conv_id = msg.conversation_id or "default"
        if conv_id not in conversations:
            conversations[conv_id] = Conversation(
                id=conv_id,
                firstMessage=None,
                lastMessage=None,
            )
        
        msg_data = msg.message_data
        if not conversations[conv_id].firstMessage:
            conversations[conv_id].firstMessage = msg_data
        conversations[conv_id].lastMessage = msg_data
    
    return list(conversations.values())


async def get_session_by_id(
    session_id: str = Path(..., description="Session ID"),
    session: AsyncSession = Depends(get_session),
) -> Session:
    """Get session with derived state (queries and conversations) per spec."""
    session_storage = SessionStorage(session)
    event_storage = EventStorage(session)
    message_storage = MessageStorage(session)
    
    session_obj = await session_storage.get_session(session_id)
    if not session_obj:
        return _empty_session_response(session_id)
    
    # Get events (event sourcing pattern)
    events = await event_storage.get_events_by_session(session_id)
    
    # Get messages for conversations
    messages = await message_storage.get_messages(session_id=session_id)
    
    # Derive state from events
    queries = _derive_queries_from_events(events)
    conversations = _derive_conversations_from_messages(messages)
    
    return Session(
        id=session_id,
        queries=queries,
        conversations=conversations,
    )

