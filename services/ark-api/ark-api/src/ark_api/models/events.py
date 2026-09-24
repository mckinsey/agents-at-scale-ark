"""Event models for API responses."""
from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel


class EventResponse(BaseModel):
    """Response model for a single Kubernetes event."""
    name: str
    namespace: str
    type: str  # Normal, Warning
    reason: str
    message: str
    source_component: Optional[str] = None
    source_host: Optional[str] = None
    involved_object_kind: str
    involved_object_name: str
    involved_object_namespace: Optional[str] = None
    involved_object_uid: Optional[str] = None
    first_timestamp: Optional[datetime] = None
    last_timestamp: Optional[datetime] = None
    count: int = 1
    creation_timestamp: datetime
    uid: str


class EventListResponse(BaseModel):
    """Response model for listing events."""
    items: List[EventResponse]
    total: int


def _parse_ts(value: Any) -> Optional[datetime]:
    """Parse a Kubernetes timestamp (ISO string or datetime) into a datetime."""
    if not value:
        return None
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            return None
    if hasattr(value, "isoformat"):  # already a datetime
        return value
    return None


def event_to_response(event_dict: Dict[str, Any]) -> EventResponse:
    """Convert Kubernetes event dict to EventResponse.

    Events created through the events.k8s.io/v1 API leave the legacy core/v1
    fields (first_timestamp, last_timestamp, count, source) empty and populate
    event_time, series, and reporting_component/instance instead. Fall back to
    those so the response is consistent regardless of which API produced the
    event.
    """
    metadata = event_dict.get("metadata", {})
    involved_object = event_dict.get("involved_object", {})
    source = event_dict.get("source") or {}
    series = event_dict.get("series") or {}

    creation_timestamp = _parse_ts(metadata.get("creation_timestamp")) or datetime.now()
    event_time = _parse_ts(event_dict.get("event_time"))
    series_last = _parse_ts(series.get("last_observed_time"))

    first_timestamp = _parse_ts(event_dict.get("first_timestamp")) or event_time or creation_timestamp
    last_timestamp = (
        _parse_ts(event_dict.get("last_timestamp"))
        or series_last
        or event_time
        or creation_timestamp
    )

    return EventResponse(
        name=metadata.get("name") or "",
        namespace=metadata.get("namespace") or "",
        type=event_dict.get("type") or "Normal",
        reason=event_dict.get("reason") or "",
        message=event_dict.get("message") or "",
        source_component=source.get("component") or event_dict.get("reporting_component"),
        source_host=source.get("host") or event_dict.get("reporting_instance"),
        involved_object_kind=involved_object.get("kind") or "",
        involved_object_name=involved_object.get("name") or "",
        involved_object_namespace=involved_object.get("namespace"),
        involved_object_uid=involved_object.get("uid"),
        first_timestamp=first_timestamp,
        last_timestamp=last_timestamp,
        count=event_dict.get("count") or series.get("count") or 1,
        creation_timestamp=creation_timestamp,
        uid=metadata.get("uid") or ""
    )
