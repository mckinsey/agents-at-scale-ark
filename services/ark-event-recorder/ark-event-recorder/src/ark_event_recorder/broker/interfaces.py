"""Event broker interfaces for abstraction layer."""

from abc import ABC, abstractmethod
from typing import Protocol


class EventPublisher(Protocol):
    """Interface for publishing events to a broker."""

    @abstractmethod
    async def publish(self, event: bytes, correlation_id: str) -> None:
        """
        Publish an event to the broker.

        Args:
            event: Protobuf Event object serialized as binary
            correlation_id: Used for partitioning/ordering (e.g., session_id, query_id)
        """
        pass


class EventConsumer(Protocol):
    """Interface for consuming events from a broker."""

    @abstractmethod
    async def consume_batch(
        self, max_events: int = 100, timeout: float = 1.0
    ) -> list[tuple[bytes, str]]:
        """
        Consume a batch of events.

        Args:
            max_events: Maximum number of events to return
            timeout: Maximum time to wait for events (seconds)

        Returns:
            List of (event_bytes, correlation_id) tuples
        """
        pass

    @abstractmethod
    async def commit(self) -> None:
        """
        Commit processed events (for at-least-once delivery semantics).
        Only called after successful database write.
        """
        pass

