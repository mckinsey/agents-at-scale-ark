"""Memory storage implementation (for conversation history)."""

import logging
from typing import Any

logger = logging.getLogger(__name__)


class MemoryStorage:
    """
    Storage for conversation messages (implements MemoryInterface).

    This is a backend-agnostic in-memory implementation.
    Can be swapped with PostgreSQL or other backends in the future.
    """

    def __init__(self):
        """Initialize memory storage."""
        self.messages: dict[str, list[dict[str, Any]]] = {}
        logger.info("MemoryStorage initialized (in-memory backend)")

    async def get_messages(self, session_id: str) -> list[dict[str, Any]]:
        """
        Get messages for a session.

        Args:
            session_id: Session ID

        Returns:
            List of message records
        """
        messages = self.messages.get(session_id, [])
        logger.debug(f"Retrieved {len(messages)} messages for session {session_id}")
        return messages

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
        if session_id not in self.messages:
            self.messages[session_id] = []
        self.messages[session_id].extend(messages)
        logger.debug(
            f"Added {len(messages)} messages to session {session_id} (query: {query_id})"
        )



