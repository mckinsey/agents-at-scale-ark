"""Storage interfaces for abstraction layer."""

from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator

from ark_event_manager.core.event_model import EventModel


class MemoryInterface(ABC):
    """Interface for conversation message storage."""

    @abstractmethod
    async def get_messages(self, session_id: str) -> list[dict[str, Any]]:
        """
        Get messages for a session.

        Args:
            session_id: Session ID

        Returns:
            List of message records
        """
        pass

    @abstractmethod
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
        pass


class StreamInterface(ABC):
    """Interface for real-time event streaming."""

    @abstractmethod
    async def read_stream(
        self,
        query_id: str,
        from_beginning: bool = False,
        wait_for_query: str | None = None,
    ) -> AsyncGenerator[str, None]:
        """
        Read stream for a query.

        Args:
            query_id: Query ID
            from_beginning: If true, send all existing cached messages first
            wait_for_query: Optional timeout to wait for query execution

        Yields:
            JSON-encoded chunk strings
        """
        pass

    @abstractmethod
    async def write_stream(self, query_id: str, chunks: dict | list) -> None:
        """
        Write chunks to a stream.

        Args:
            query_id: Query ID
            chunks: NDJSON chunks or single chunk dict
        """
        pass

    @abstractmethod
    async def complete_stream(self, query_id: str) -> None:
        """
        Mark stream as complete.

        Args:
            query_id: Query ID
        """
        pass


class EventStorageInterface(ABC):
    """Interface for event persistence."""

    @abstractmethod
    async def persist_event(self, event: EventModel) -> None:
        """
        Persist an event to storage.

        Args:
            event: Event model instance
        """
        pass

