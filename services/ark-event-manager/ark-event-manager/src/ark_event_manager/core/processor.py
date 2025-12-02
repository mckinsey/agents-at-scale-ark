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
        logger.info("🚀 Event processor started and ready to consume events")

        while self.running:
            try:
                events = await self.consumer.consume_batch(
                    max_events=self.batch_size, timeout=self.timeout
                )

                if not events:
                    continue

                logger.info(f"📦 Consumed batch of {len(events)} event(s) from queue")

                # Process events
                for event_bytes, correlation_id in events:
                    try:
                        await self._process_event(event_bytes, correlation_id)
                        self._events_processed += 1
                    except Exception as e:
                        logger.error(
                            f"❌ Failed to process event | correlation_id={correlation_id} | error={e}",
                            exc_info=True,
                        )
                        # Continue processing other events even if one fails

                # Commit after successful processing
                await self.consumer.commit()
                logger.debug(f"✅ Committed batch of {len(events)} event(s)")

            except asyncio.CancelledError:
                logger.info("⏹️  Event processor cancelled")
                break
            except Exception as e:
                logger.error(f"❌ Error in event processing loop: {e}", exc_info=True)
                await asyncio.sleep(1)

        logger.info(
            f"🛑 Event processor stopped | total_events_processed={self._events_processed}"
        )

    async def _process_event(self, event_bytes: Protobuf, correlation_id: str) -> None:
        """
        Process a single event.

        Args:
            event_bytes: Protobuf-serialized event (Protobuf type)
            correlation_id: Correlation ID for the event
        """
        try:
            logger.debug(f"🔍 Parsing protobuf event | correlation_id={correlation_id}")
            event = parse_event_protobuf(event_bytes)

            if correlation_id and not event.correlation_id:
                event.correlation_id = correlation_id

            logger.info(
                f"📋 Processing event | "
                f"id={event.event_id[:8]}... | "
                f"type={event.type} | "
                f"subtype={event.subtype} | "
                f"severity={event.severity.name} | "
                f"correlation_id={event.correlation_id} | "
                f"source={event.source}"
            )

            await self._route_event(event)

            if self.event_storage:
                await self.event_storage.persist_event(event)
                logger.info(
                    f"💾 Event persisted to database | event_id={event.event_id[:8]}..."
                )
            else:
                logger.debug("ℹ️  Event storage not configured, skipping persistence")

        except ValueError as e:
            logger.warning(f"⚠️  Invalid event format | correlation_id={correlation_id} | error={e}")
        except Exception as e:
            logger.error(f"❌ Unexpected error processing event: {e}", exc_info=True)
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
                logger.info(
                    f"📡 Routing query event to stream | "
                    f"query_id={query_id} | "
                    f"subtype={event.subtype}"
                )
                await self.stream_storage.write_stream(query_id, event.model_dump())
                logger.info(f"✅ Event streamed | query_id={query_id}")
            else:
                logger.debug(f"ℹ️  Stream storage not available for query event | query_id={query_id}")
        else:
            logger.debug(
                f"ℹ️  Event type '{event.type}' not routed to stream | subtype={event.subtype}"
            )

    def stop(self) -> None:
        """Stop the event processor."""
        self.running = False



