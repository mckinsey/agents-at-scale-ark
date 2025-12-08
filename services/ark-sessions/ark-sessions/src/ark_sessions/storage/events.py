"""Event storage operations for event sourcing pattern."""

from sqlmodel import select
from sqlmodel.ext.asyncio import AsyncSession

from ark_sessions.models import SessionEvent
from ark_sessions.storage.sessions import SessionStorage


class EventStorage:
    """Storage for session events (event sourcing pattern)."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.session_storage = SessionStorage(session)
    
    async def append_event(self, event: SessionEvent) -> None:
        """Append an event (append-only, event sourcing pattern)."""
        # Ensure session exists (implicit session creation)
        await self.session_storage.create_session(event.session_id)
        
        # Append event
        self.session.add(event)
        await self.session.commit()
    
    async def get_events_by_session(self, session_id: str) -> list[SessionEvent]:
        """Get all events for a session, ordered by timestamp."""
        statement = (
            select(SessionEvent)
            .where(SessionEvent.session_id == session_id)
            .order_by(SessionEvent.timestamp)
        )
        result = await self.session.exec(statement)
        return list(result.all())
    
    async def get_events_by_query(self, query_id: str) -> list[SessionEvent]:
        """Get all events for a query, ordered by timestamp."""
        statement = (
            select(SessionEvent)
            .where(SessionEvent.query_id == query_id)
            .order_by(SessionEvent.timestamp)
        )
        result = await self.session.exec(statement)
        return list(result.all())

