"""Event storage implementation using SQLModel."""

import logging

from ark_event_recorder.core import AsyncSessionLocal, Event
from ark_event_recorder.core.event_model import EventModel
from ark_event_recorder.storage.interfaces import EventStorageInterface

logger = logging.getLogger(__name__)


class EventStorage(EventStorageInterface):
    """
    Database storage for events using SQLModel.

    Persists all events to the database for querying and analysis.
    """

    def __init__(self):
        """Initialize event storage."""
        logger.info("EventStorage initialized (SQLModel backend)")

    async def persist_event(self, event: EventModel) -> None:
        """
        Persist an event to the database.

        Args:
            event: Event model instance
        """
        try:
            async with AsyncSessionLocal() as db_session:
                db_event = Event(
                    event_id=event.event_id,
                    correlation_id=event.correlation_id,
                    timestamp=event.timestamp,
                    severity=event.severity.name,
                    type=event.type,
                    subtype=event.subtype,
                    source_type=event.source_type.name,
                    source=event.source,
                    version=event.version,
                    payload=event.payload,
                )
                db_session.add(db_event)
                await db_session.commit()
                logger.debug(f"Persisted event: {db_event.event_id}")
        except Exception as e:
            logger.error(f"Failed to persist event: {e}", exc_info=True)
            raise

