"""Protobuf event deserialization helpers."""

import json
import logging
import uuid
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)


def parse_event_protobuf(event_bytes: bytes) -> dict[str, Any]:
    """
    Parse protobuf event bytes into a dictionary.

    This is a simplified parser that extracts basic event information.
    For production with generated protobuf code, replace this implementation.

    Args:
        event_bytes: Protobuf-serialized Event message

    Returns:
        Dictionary with event fields

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
            from google.protobuf.json_format import MessageToJson
            from google.protobuf.message import Message

            event_dict = json.loads(MessageToJson(_parse_protobuf_message(event_bytes)))
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

        return event_dict
    except Exception as e:
        logger.error(f"Failed to parse protobuf event: {e}", exc_info=True)
        raise ValueError(f"Invalid protobuf event: {e}") from e


def _parse_protobuf_message(event_bytes: bytes) -> Any:
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


def _parse_simple_protobuf(event_bytes: bytes) -> dict[str, Any]:
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


def normalize_event_dict(event_dict: dict[str, Any]) -> dict[str, Any]:
    """
    Normalize event dictionary to standard format.

    Args:
        event_dict: Parsed event dictionary

    Returns:
        Normalized event dictionary
    """
    severity_map = {
        0: "UNSPECIFIED",
        1: "DEBUG",
        2: "INFO",
        3: "WARNING",
        4: "ERROR",
        5: "CRITICAL",
    }

    source_type_map = {
        0: "UNSPECIFIED",
        1: "ARK_CONTROLLER",
        2: "WATCHER",
        3: "SERVICE",
        4: "USER",
        5: "K8S",
    }

    severity = event_dict.get("severity", 2)
    if isinstance(severity, int):
        severity_str = severity_map.get(severity, "INFO")
    else:
        severity_str = str(severity)

    source_type = event_dict.get("source_type", 0)
    if isinstance(source_type, int):
        source_type_str = source_type_map.get(source_type, "UNSPECIFIED")
    else:
        source_type_str = str(source_type)

    timestamp = event_dict.get("timestamp")
    if isinstance(timestamp, str):
        try:
            timestamp = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        except Exception:
            timestamp = datetime.utcnow()
    elif not isinstance(timestamp, datetime):
        timestamp = datetime.utcnow()

    payload = event_dict.get("payload", {})
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except Exception:
            payload = {}

    return {
        "event_id": event_dict.get("event_id", str(uuid.uuid4())),
        "correlation_id": event_dict.get("correlation_id", ""),
        "timestamp": timestamp,
        "severity": severity_str,
        "type": event_dict.get("type", "unknown"),
        "subtype": event_dict.get("subtype", ""),
        "source_type": source_type_str,
        "source": event_dict.get("source", ""),
        "version": event_dict.get("version", "v1"),
        "payload": payload,
    }

