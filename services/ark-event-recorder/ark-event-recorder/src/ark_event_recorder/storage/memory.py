"""Memory storage implementation (for conversation history)."""

import logging
from typing import Any

logger = logging.getLogger(__name__)


class MemoryStorage:
    """Storage for conversation messages (implements MemoryInterface)."""

    def __init__(self):
        """Initialize memory storage."""
        # TODO: Initialize PostgreSQL connection
        self.messages: dict[str, list[dict[str, Any]]] = {}

    async def get_messages(self, session_id: str) -> list[dict[str, Any]]:
        """
        Get messages for a session.

        Args:
            session_id: Session ID

        Returns:
            List of message records
        """
        # TODO: Query PostgreSQL
        return self.messages.get(session_id, [])

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
        # TODO: Insert into PostgreSQL
        if session_id not in self.messages:
            self.messages[session_id] = []
        self.messages[session_id].extend(messages)
        logger.debug(
            f"Added {len(messages)} messages to session {session_id} (query: {query_id})"
        )

