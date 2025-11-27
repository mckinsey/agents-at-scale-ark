"""Database storage implementation using SQLModel."""

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ark_event_manager.core import AsyncSessionLocal, Message
from ark_event_manager.storage.interfaces import MemoryInterface

logger = logging.getLogger(__name__)


class DatabaseStorage(MemoryInterface):
    """
    Database storage for conversation messages using SQLModel.

    This implementation uses SQLModel for type-safe database operations.
    Works with SQLite (default) or other SQLAlchemy-supported databases.
    """

    def __init__(self):
        """Initialize database storage."""
        logger.info("DatabaseStorage initialized (SQLModel backend)")

    async def get_messages(self, session_id: str) -> list[dict[str, Any]]:
        """
        Get messages for a session.

        Args:
            session_id: Session ID

        Returns:
            List of message records
        """
        async with AsyncSessionLocal() as db_session:
            stmt = select(Message).where(Message.session_id == session_id).order_by(Message.created_at)
            result = await db_session.execute(stmt)
            messages = result.scalars().all()

            message_dicts = [msg.message_data for msg in messages]
            logger.debug(
                f"Retrieved {len(message_dicts)} messages for session {session_id}"
            )
            return message_dicts

    async def add_messages(
        self, session_id: str, query_id: str | None, messages: list[dict[str, Any]]
    ) -> None:
        """
        Add messages to a session.

        Args:
            session_id: Session ID
            query_id: Optional query ID
            messages: List of message objects
        """
        async with AsyncSessionLocal() as db_session:
            for message_data in messages:
                message = Message(
                    session_id=session_id,
                    query_id=query_id,
                    message_data=message_data,
                )
                db_session.add(message)

            await db_session.commit()
            logger.debug(
                f"Added {len(messages)} messages to session {session_id} (query: {query_id})"
            )

