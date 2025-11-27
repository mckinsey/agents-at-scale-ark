"""Event processing pipeline."""

import asyncio
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ark_event_recorder.broker import EventConsumer
    from ark_event_recorder.storage import EventStorage, MemoryStorage, StreamStorage

from ark_event_recorder.core.proto_helpers import (
    normalize_event_dict,
    parse_event_protobuf,
)

logger = logging.getLogger(__name__)


class EventProcessor:
    """Processes events from the broker and routes them to storage."""

    def __init__(
        self,
        consumer: "EventConsumer",
        memory_storage: "MemoryStorage | None" = None,
        stream_storage: "StreamStorage | None" = None,
        event_storage: "EventStorage | None" = None,
        batch_size: int = 100,
        timeout: float = 1.0,
    ):
        """
        Initialize event processor.

        Args:
            consumer: Event consumer to read events from
            memory_storage: Optional memory storage for message events
            stream_storage: Optional stream storage for streaming events
            event_storage: Optional event storage for persisting all events
            batch_size: Maximum number of events to process per batch
            timeout: Timeout for consuming events (seconds)
        """
        self.consumer = consumer
        self.memory_storage = memory_storage
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

    async def _process_event(self, event_bytes: bytes, correlation_id: str) -> None:
        """
        Process a single event.

        Args:
            event_bytes: Protobuf-serialized event
            correlation_id: Correlation ID for the event
        """
        try:
            event_dict = parse_event_protobuf(event_bytes)
            normalized_event = normalize_event_dict(event_dict)

            if correlation_id and not normalized_event.get("correlation_id"):
                normalized_event["correlation_id"] = correlation_id

            event_type = normalized_event.get("type", "")
            event_subtype = normalized_event.get("subtype", "")

            logger.debug(
                f"Processing event: id={normalized_event.get('event_id')}, "
                f"type={event_type}, subtype={event_subtype}, "
                f"correlation_id={normalized_event.get('correlation_id')}"
            )

            await self._route_event(normalized_event)

            if self.event_storage:
                await self.event_storage.persist_event(normalized_event)

        except ValueError as e:
            logger.warning(f"Invalid event format: {e}")
        except Exception as e:
            logger.error(f"Unexpected error processing event: {e}", exc_info=True)
            raise

    async def _route_event(self, event: dict) -> None:
        """
        Route event to appropriate storage based on type.

        Args:
            event: Normalized event dictionary
        """
        event_type = event.get("type", "")
        event_subtype = event.get("subtype", "")
        payload = event.get("payload", {})
        correlation_id = event.get("correlation_id", "")

        if event_type == "query" and event_subtype in ("execution_start", "execution_complete"):
            query_id = payload.get("queryId") or correlation_id
            if query_id and self.stream_storage:
                await self.stream_storage.write_stream(query_id, event)

        if event_type == "memory" or "message" in event_subtype.lower():
            session_id = payload.get("sessionId") or correlation_id
            if session_id and self.memory_storage:
                messages = payload.get("messages", [])
                if messages:
                    query_id = payload.get("queryId")
                    await self.memory_storage.add_messages(
                        session_id, query_id, messages
                    )

        logger.debug(f"Routed event type={event_type}, subtype={event_subtype}")

    def stop(self) -> None:
        """Stop the event processor."""
        self.running = False



