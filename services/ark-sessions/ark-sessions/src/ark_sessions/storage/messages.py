"""Message storage operations."""

from typing import Any, Optional

from sqlmodel import select
from sqlmodel.ext.asyncio import AsyncSession

from ark_sessions.models import Message
from ark_sessions.storage.sessions import SessionStorage


class MessageStorage:
    """Storage for message operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.session_storage = SessionStorage(session)
    
    async def add_messages(
        self,
        session_id: str,
        messages: list[dict[str, Any]],
        query_id: Optional[str] = None,
    ) -> None:
        """Add messages to a session."""
        # Ensure session exists
        await self.session_storage.create_session(session_id)
        
        # Create message records
        for msg_data in messages:
            message = Message(
                session_id=session_id,
                query_id=query_id,
                message_data=msg_data,
            )
            self.session.add(message)
        
        await self.session.commit()
    
    async def get_messages(
        self,
        session_id: Optional[str] = None,
        query_id: Optional[str] = None,
    ) -> list[Message]:
        """Get messages, optionally filtered by session_id or query_id."""
        statement = select(Message)
        
        if session_id:
            statement = statement.where(Message.session_id == session_id)
        if query_id:
            statement = statement.where(Message.query_id == query_id)
        
        statement = statement.order_by(Message.created_at)
        
        result = await self.session.exec(statement)
        return list(result.all())

