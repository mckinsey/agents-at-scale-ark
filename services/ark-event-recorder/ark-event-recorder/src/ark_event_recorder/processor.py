"""Event processing pipeline."""

import asyncio
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .broker import EventConsumer

logger = logging.getLogger(__name__)


class EventProcessor:
    """Processes events from the broker and routes them to storage."""

    def __init__(self, consumer: "EventConsumer", batch_size: int = 100, timeout: float = 1.0):
        """
        Initialize event processor.

        Args:
            consumer: Event consumer to read events from
            batch_size: Maximum number of events to process per batch
            timeout: Timeout for consuming events (seconds)
        """
        self.consumer = consumer
        self.batch_size = batch_size
        self.timeout = timeout
        self.running = False

    async def run(self) -> None:
        """Run the event processing loop."""
        self.running = True
        logger.info("Event processor started")

        while self.running:
            try:
                events = await self.consumer.consume_batch(
                    max_events=self.batch_size, timeout=self.timeout
                )

                if not events:
                    continue

                logger.debug(f"Processing batch of {len(events)} events")

                # Process events
                for event_bytes, correlation_id in events:
                    try:
                        await self._process_event(event_bytes, correlation_id)
                    except Exception as e:
                        logger.error(
                            f"Failed to process event with correlation_id={correlation_id}: {e}",
                            exc_info=True,
                        )
                        # Continue processing other events even if one fails

                # Commit after successful processing
                await self.consumer.commit()

            except asyncio.CancelledError:
                logger.info("Event processor cancelled")
                break
            except Exception as e:
                logger.error(f"Error in event processing loop: {e}", exc_info=True)
                await asyncio.sleep(1)  # Brief pause before retrying

        logger.info("Event processor stopped")

    async def _process_event(self, event_bytes: bytes, correlation_id: str) -> None:
        """
        Process a single event.

        Args:
            event_bytes: Protobuf-serialized event
            correlation_id: Correlation ID for the event
        """
        # TODO: Deserialize protobuf, validate, route by type, persist to PostgreSQL
        # For now, just log it
        logger.debug(
            f"Processing event: correlation_id={correlation_id}, size={len(event_bytes)} bytes"
        )

    def stop(self) -> None:
        """Stop the event processor."""
        self.running = False

