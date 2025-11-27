"""Event transport interfaces for abstraction layer."""

from abc import ABC, abstractmethod

from ark_event_manager.core.types import Protobuf


class EventPublisher(ABC):
    """Interface for publishing events via transport layer."""

    @abstractmethod
    async def publish(self, event: Protobuf, correlation_id: str) -> None:
        """
        Publish an event via transport.

        Args:
            event: Protobuf Event object serialized as binary (Protobuf type)
            correlation_id: Used for partitioning/ordering (e.g., session_id, query_id)
        """
        pass


class EventConsumer(ABC):
    """Interface for consuming events from transport layer."""

    @abstractmethod
    async def consume_batch(
        self, max_events: int = 100, timeout: float = 1.0
    ) -> list[tuple[Protobuf, str]]:
        """
        Consume a batch of events.

        Args:
            max_events: Maximum number of events to return
            timeout: Maximum time to wait for events (seconds)

        Returns:
            List of (event_bytes, correlation_id) tuples where event_bytes is Protobuf type
        """
        pass

    @abstractmethod
    async def commit(self) -> None:
        """
        Commit processed events (for at-least-once delivery semantics).
        Only called after successful database write.
        """
        pass

