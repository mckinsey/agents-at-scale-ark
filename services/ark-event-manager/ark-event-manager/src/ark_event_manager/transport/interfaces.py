"""Event transport interfaces for abstraction layer."""

from abc import ABC, abstractmethod
from typing import Any


class EventPublisher(ABC):
    """Interface for publishing events via transport layer."""

    @abstractmethod
    async def publish(self, event: dict[str, Any], correlation_id: str) -> None:
        """
        Publish an event via transport.

        Args:
            event: Event as JSON dict
            correlation_id: Used for partitioning/ordering (e.g., session_id, query_id)
        """
        pass


class EventConsumer(ABC):
    """Interface for consuming events from transport layer."""

    @abstractmethod
    async def consume_batch(
        self, max_events: int = 100, timeout: float = 1.0
    ) -> list[tuple[dict[str, Any], str]]:
        """
        Consume a batch of events.

        Args:
            max_events: Maximum number of events to return
            timeout: Maximum time to wait for events (seconds)

        Returns:
            List of (event_dict, correlation_id) tuples where event_dict is JSON dict
        """
        pass

    @abstractmethod
    async def commit(self) -> None:
        """
        Commit processed events (for at-least-once delivery semantics).
        Only called after successful database write.
        """
        pass

