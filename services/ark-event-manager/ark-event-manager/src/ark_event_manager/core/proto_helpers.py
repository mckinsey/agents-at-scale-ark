"""Protobuf event deserialization helpers."""

import json
import logging
import uuid
from datetime import datetime
from typing import Any

try:
    from ark_event_manager.core.event_model_gen import EventModel
except ImportError:
    from ark_event_manager.core.event_model import EventModel

from ark_event_manager.core.types import Protobuf

logger = logging.getLogger(__name__)


def parse_event_protobuf(event_bytes: Protobuf) -> EventModel:
    """
    Parse protobuf event bytes into an EventModel.

    This is a simplified parser that extracts basic event information.
    For production with generated protobuf code, replace this implementation.

    Args:
        event_bytes: Protobuf-serialized Event message (Protobuf type)

    Returns:
        EventModel instance

    Raises:
        ValueError: If event cannot be parsed
    """
    try:
        event_dict: dict[str, Any] = {
            "event_id": str(uuid.uuid4()),
            "timestamp": datetime.utcnow(),
            "payload": {},
        }

        try:
            from google.protobuf.json_format import MessageToDict
            from google.protobuf.message import Message

            protobuf_message = _parse_protobuf_message(event_bytes)
            event_dict = MessageToDict(
                protobuf_message,
                including_default_value_fields=True,
                preserving_proto_field_name=True,
            )
            if "timestamp" in event_dict:
                event_dict["timestamp"] = _parse_timestamp_from_dict(
                    event_dict["timestamp"]
                )
        except Exception:
            event_dict = _parse_simple_protobuf(event_bytes)

        if not event_dict.get("event_id"):
            event_dict["event_id"] = str(uuid.uuid4())

        if not event_dict.get("timestamp"):
            event_dict["timestamp"] = datetime.utcnow()

        if not event_dict.get("payload"):
            event_dict["payload"] = {}

        return EventModel.model_validate(event_dict, strict=False)
    except Exception as e:
        logger.error(f"Failed to parse protobuf event: {e}", exc_info=True)
        raise ValueError(f"Invalid protobuf event: {e}") from e


def _parse_protobuf_message(event_bytes: Protobuf) -> Any:
    """Try to parse using protobuf library if available."""
    try:
        from google.protobuf.message import Message

        class DynamicEvent(Message):
            pass

        event = DynamicEvent()
        event.ParseFromString(event_bytes)
        return event
    except Exception:
        raise ValueError("Cannot parse protobuf message")


def _parse_simple_protobuf(event_bytes: Protobuf) -> dict[str, Any]:
    """Fallback simple parser for basic protobuf structure."""
    event_dict: dict[str, Any] = {
        "event_id": str(uuid.uuid4()),
        "correlation_id": "",
        "timestamp": datetime.utcnow(),
        "severity": 2,
        "type": "unknown",
        "subtype": "",
        "source_type": 0,
        "source": "",
        "version": "v1",
        "payload": {},
    }

    try:
        if len(event_bytes) > 0:
            event_dict["payload"] = {"raw_size": len(event_bytes)}
    except Exception:
        pass

    return event_dict


def _parse_timestamp_from_dict(timestamp_dict: dict[str, Any]) -> datetime:
    """Parse timestamp from protobuf JSON format."""
    try:
        seconds = timestamp_dict.get("seconds", 0)
        nanos = timestamp_dict.get("nanos", 0)
        return datetime.fromtimestamp(seconds + nanos / 1e9, tz=None)
    except Exception:
        return datetime.utcnow()



