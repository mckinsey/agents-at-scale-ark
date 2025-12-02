"""Memory storage implementation (for conversation history)."""

import logging
from typing import Any

from ark_event_manager.storage.interfaces import MemoryInterface

logger = logging.getLogger(__name__)


class MemoryStorage(MemoryInterface):
    """
    Storage for conversation messages (implements MemoryInterface).

    Stores conversation/chat messages (user-assistant turns), NOT system events.
    Messages arrive via direct HTTP API: POST /messages

    This is a backend-agnostic in-memory implementation.
    Can be swapped with database or other backends in the future.
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

    async def get_all_messages(
        self, session_id: str | None = None, query_id: str | None = None
    ) -> list[dict[str, Any]]:
        """
        Get all messages with optional filtering.

        Args:
            session_id: Optional session ID filter
            query_id: Optional query ID filter

        Returns:
            List of message records with timestamp, session_id, query_id, message fields
        """
        all_messages = []
        for sess_id, msgs in self.messages.items():
            if session_id and sess_id != session_id:
                continue
            for msg in msgs:
                # In-memory storage doesn't track query_id per message, so we include all
                # This is a limitation of the in-memory implementation
                all_messages.append({
                    "timestamp": msg.get("timestamp"),
                    "session_id": sess_id,
                    "query_id": query_id,  # Note: in-memory doesn't track this per message
                    "message": msg,
                })
        logger.debug(f"Retrieved {len(all_messages)} messages (session_id={session_id}, query_id={query_id})")
        return all_messages

    async def get_sessions(self) -> list[str]:
        """
        Get all session IDs.

        Returns:
            List of session IDs
        """
        sessions = list(self.messages.keys())
        logger.debug(f"Retrieved {len(sessions)} sessions")
        return sessions

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



