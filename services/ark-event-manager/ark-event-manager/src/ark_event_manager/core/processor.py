"""Event processing pipeline."""

import asyncio
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ark_event_manager.transport import EventConsumer
    from ark_event_manager.storage import EventStorage, StreamStorage

from ark_event_manager.core.models import Event
from ark_event_manager.core.proto_helpers import parse_event_protobuf
from ark_event_manager.core.types import Protobuf

logger = logging.getLogger(__name__)


class EventProcessor:
    """Processes events from the transport layer and routes them to storage."""

    def __init__(
        self,
        consumer: "EventConsumer",
        stream_storage: "StreamStorage | None" = None,
        event_storage: "EventStorage | None" = None,
        batch_size: int = 100,
        timeout: float = 1.0,
    ):
        """
        Initialize event processor.

        Args:
            consumer: Event consumer to read events from
            stream_storage: Optional stream storage for streaming events
            event_storage: Optional event storage for persisting all events
            batch_size: Maximum number of events to process per batch
            timeout: Timeout for consuming events (seconds)
        """
        self.consumer = consumer
        self.stream_storage = stream_storage
        self.event_storage = event_storage
        self.batch_size = batch_size
        self.timeout = timeout
        self.running = False
        self._events_processed = 0

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
                        self._events_processed += 1
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
                await asyncio.sleep(1)

        logger.info(
            f"Event processor stopped (processed {self._events_processed} events)"
        )

    async def _process_event(self, event_bytes: Protobuf, correlation_id: str) -> None:
        """
        Process a single event.

        Args:
            event_bytes: Protobuf-serialized event (Protobuf type)
            correlation_id: Correlation ID for the event
        """
        try:
            event = parse_event_protobuf(event_bytes)

            if correlation_id and not event.correlation_id:
                event.correlation_id = correlation_id

            logger.debug(
                f"Processing event: id={event.event_id}, "
                f"type={event.type}, subtype={event.subtype}, "
                f"correlation_id={event.correlation_id}"
            )

            await self._route_event(event)

            if self.event_storage:
                await self.event_storage.persist_event(event)

        except ValueError as e:
            logger.warning(f"Invalid event format: {e}")
        except Exception as e:
            logger.error(f"Unexpected error processing event: {e}", exc_info=True)
            raise

    async def _route_event(self, event: Event) -> None:
        """
        Route event to appropriate storage based on type.

        Events are routed to:
        - Query events → StreamStorage (for real-time streaming)

        Args:
            event: Event model instance
        """
        # Route query execution events to streaming
        if event.type == "query" and event.subtype in ("execution_start", "execution_complete"):
            query_id = event.payload.get("queryId") or event.correlation_id
            if query_id and self.stream_storage:
                await self.stream_storage.write_stream(query_id, event.model_dump())

        logger.debug(f"Routed event type={event.type}, subtype={event.subtype}")

    def stop(self) -> None:
        """Stop the event processor."""
        self.running = False



