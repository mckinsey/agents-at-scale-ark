"""HTTP implementation of event broker interfaces (Phase 1)."""

import asyncio
from typing import Optional
import httpx

from ark_event_recorder.broker.interfaces import EventConsumer, EventPublisher


class HTTPEventPublisher(EventPublisher):
    """HTTP implementation of EventPublisher - publishes directly to AER."""

    def __init__(self, aer_base_url: str, timeout: float = 30.0):
        """
        Initialize HTTP event publisher.

        Args:
            aer_base_url: Base URL of AER service (e.g., "http://ark-event-recorder:8080")
            timeout: HTTP request timeout in seconds
        """
        self.aer_url = f"{aer_base_url.rstrip('/')}/events"
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    async def publish(self, event: bytes, correlation_id: str) -> None:
        """
        Publish an event via HTTP POST to AER.

        Args:
            event: Protobuf Event object serialized as binary
            correlation_id: Used for partitioning/ordering
        """
        client = await self._get_client()
        try:
            response = await client.post(
                self.aer_url,
                content=event,
                headers={
                    "Content-Type": "application/x-protobuf",
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
        self.queue: asyncio.Queue[tuple[bytes, str]] = asyncio.Queue()
        self.pending_events: list[tuple[bytes, str]] = []

    async def enqueue(self, event: bytes, correlation_id: str) -> None:
        """
        Enqueue an event (called by HTTP endpoint handler).

        Args:
            event: Protobuf Event object serialized as binary
            correlation_id: Correlation ID from HTTP header
        """
        await self.queue.put((event, correlation_id))

    async def consume_batch(
        self, max_events: int = 100, timeout: float = 1.0
    ) -> list[tuple[bytes, str]]:
        """
        Consume a batch of events from internal queue.

        Args:
            max_events: Maximum number of events to return
            timeout: Maximum time to wait for events (seconds)

        Returns:
            List of (event_bytes, correlation_id) tuples
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

