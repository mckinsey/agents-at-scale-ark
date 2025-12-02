"""Event storage implementation using SQLModel."""

import logging

from ark_event_manager.core import AsyncSessionLocal, Event
from ark_event_manager.storage.interfaces import EventStorageInterface

logger = logging.getLogger(__name__)


class EventStorage(EventStorageInterface):
    """
    Database storage for events using SQLModel.

    Persists system telemetry/observability events (NOT conversation messages).
    Events represent what happened in the system (query started, workflow completed, etc.).

    For conversation messages, see MemoryStorage.
    """

    def __init__(self):
        """Initialize event storage."""
        logger.info("EventStorage initialized (SQLModel backend)")

    async def persist_event(self, event: Event) -> None:
        """
        Persist an event to the database.

        Args:
            event: Event model instance
        """
        try:
            logger.debug(
                f"💾 Persisting event to database | "
                f"event_id={event.event_id[:8]}... | "
                f"type={event.type} | "
                f"subtype={event.subtype}"
            )
            async with AsyncSessionLocal() as db_session:
                # Create a new Event instance for DB (id=None, created_at will be auto-set)
                # Convert enums to strings for database storage
                from ark_event_manager.core.models import EventSeverity, EventSourceType
                
                db_event = Event(
                    event_id=event.event_id,
                    correlation_id=event.correlation_id,
                    timestamp=event.timestamp,
                    severity=event.severity.name if isinstance(event.severity, EventSeverity) else str(event.severity),
                    type=event.type,
                    subtype=event.subtype,
                    source_type=event.source_type.name if isinstance(event.source_type, EventSourceType) else str(event.source_type),
                    source=event.source,
                    version=event.version,
                    payload=event.payload,
                )
                db_session.add(db_event)
                await db_session.commit()
                logger.info(
                    f"✅ Event persisted to database | "
                    f"event_id={db_event.event_id[:8]}... | "
                    f"db_id={db_event.id}"
                )
        except Exception as e:
            logger.error(
                f"❌ Failed to persist event | event_id={event.event_id[:8]}... | error={e}",
                exc_info=True,
            )
            raise

