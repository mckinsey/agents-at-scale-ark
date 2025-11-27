"""Protobuf event deserialization helpers."""

from ark_event_manager.core.models import Event
from ark_event_manager.core.types import Protobuf


def parse_event_protobuf(event_bytes: Protobuf) -> Event:
    """
    Parse protobuf event bytes into an Event.

    Args:
        event_bytes: Protobuf-serialized Event message (Protobuf type)

    Returns:
        Event instance

    Raises:
        ValueError: If event cannot be parsed
    """
    return Event.from_protobuf(event_bytes)



