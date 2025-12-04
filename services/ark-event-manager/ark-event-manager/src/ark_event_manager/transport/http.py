"""HTTP implementation of event transport interfaces."""

import asyncio
import json
import logging
from typing import Any, Optional
import httpx

from ark_event_manager.transport.interfaces import EventConsumer, EventPublisher

logger = logging.getLogger(__name__)


class HTTPEventPublisher(EventPublisher):
    """HTTP implementation of EventPublisher - publishes directly to AEM."""

    def __init__(self, base_url: str, timeout: float = 30.0):
        """
        Initialize HTTP event publisher.

        Args:
            base_url: Base URL of AEM service (e.g., "http://ark-event-manager:8080")
            timeout: HTTP request timeout in seconds
        """
        self.url = f"{base_url.rstrip('/')}/events"
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    async def publish(self, event: dict[str, Any], correlation_id: str) -> None:
        """
        Publish an event via HTTP POST to AEM.

        Args:
            event: Event as JSON dict
            correlation_id: Used for partitioning/ordering
        """
        client = await self._get_client()
        try:
            response = await client.post(
                self.url,
                json=event,
                headers={
                    "Content-Type": "application/json",
                    "X-Correlation-ID": correlation_id,
                },
            )
            response.raise_for_status()
        except httpx.HTTPError as e:
            raise RuntimeError(f"Failed to publish event: {e}") from e

    async def close(self) -> None:
        """Close HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None


class HTTPEventConsumer(EventConsumer):
    """HTTP implementation of EventConsumer - receives events via internal queue."""

    def __init__(self):
        """Initialize HTTP event consumer with internal queue."""
        self.queue: asyncio.Queue[tuple[dict[str, Any], str]] = asyncio.Queue()
        self.pending_events: list[tuple[dict[str, Any], str]] = []

    async def enqueue(self, event: dict[str, Any], correlation_id: str) -> None:
        """
        Enqueue an event (called by HTTP endpoint handler).

        Args:
            event: Event as JSON dict
            correlation_id: Correlation ID from HTTP header
        """
        queue_size = self.queue.qsize()
        await self.queue.put((event, correlation_id))
        logger.debug(
            f"📬 Event enqueued | correlation_id={correlation_id} | "
            f"queue_size={queue_size + 1}"
        )

    async def consume_batch(
        self, max_events: int = 100, timeout: float = 1.0
    ) -> list[tuple[dict[str, Any], str]]:
        """
        Consume a batch of events from internal queue.

        Args:
            max_events: Maximum number of events to return
            timeout: Maximum time to wait for events (seconds)

        Returns:
            List of (event_dict, correlation_id) tuples where event_dict is JSON dict
        """
        events = []
        deadline = asyncio.get_event_loop().time() + timeout

        while len(events) < max_events:
            remaining_time = max(0.0, deadline - asyncio.get_event_loop().time())
            if remaining_time <= 0:
                break

            try:
                event, correlation_id = await asyncio.wait_for(
                    self.queue.get(), timeout=min(0.1, remaining_time)
                )
                events.append((event, correlation_id))
                self.pending_events.append((event, correlation_id))
            except asyncio.TimeoutError:
                break

        return events

    async def commit(self) -> None:
        """
        Commit processed events (no-op for HTTP, events already processed).
        Clears pending events list.
        """
        self.pending_events.clear()

