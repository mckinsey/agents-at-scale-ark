"""Event storage implementation using SQLModel."""

import logging
from typing import Any

from ark_event_recorder.database import AsyncSessionLocal
from ark_event_recorder.models import Event

logger = logging.getLogger(__name__)


class EventStorage:
    """
    PostgreSQL storage for events using SQLModel.

    Persists all events to the database for querying and analysis.
    """

    def __init__(self):
        """Initialize event storage."""
        logger.info("EventStorage initialized (SQLModel backend)")

    async def persist_event(self, event_dict: dict[str, Any]) -> None:
        """
        Persist an event to PostgreSQL.

        Args:
            event_dict: Normalized event dictionary
        """
        try:
            async with AsyncSessionLocal() as db_session:
                event = Event(
                    event_id=event_dict.get("event_id", ""),
                    correlation_id=event_dict.get("correlation_id", ""),
                    timestamp=event_dict.get("timestamp"),
                    severity=event_dict.get("severity", "INFO"),
                    type=event_dict.get("type", "unknown"),
                    subtype=event_dict.get("subtype", ""),
                    source_type=event_dict.get("source_type", "UNSPECIFIED"),
                    source=event_dict.get("source", ""),
                    version=event_dict.get("version", "v1"),
                    payload=event_dict.get("payload", {}),
                )
                db_session.add(event)
                await db_session.commit()
                logger.debug(f"Persisted event: {event.event_id}")
        except Exception as e:
            logger.error(f"Failed to persist event: {e}", exc_info=True)
            raise

