"""Core domain models, processing, and database functionality."""

from ark_event_manager.core.database import (
    AsyncSessionLocal,
    close_db,
    get_session,
    init_db,
)
try:
    from ark_event_manager.core.event_model_gen import (
        EventModel,
        EventSeverity,
        EventSourceType,
    )
except ImportError:
    from ark_event_manager.core.event_model import (
        EventModel,
        EventSeverity,
        EventSourceType,
    )
from ark_event_manager.core.models import Event, Message
from ark_event_manager.core.processor import EventProcessor
from ark_event_manager.core.proto_helpers import parse_event_protobuf
from ark_event_manager.core.types import Protobuf

__all__ = [
    "AsyncSessionLocal",
    "close_db",
    "Event",
    "EventModel",
    "EventProcessor",
    "EventSeverity",
    "EventSourceType",
    "get_session",
    "init_db",
    "Message",
    "parse_event_protobuf",
    "Protobuf",
]

