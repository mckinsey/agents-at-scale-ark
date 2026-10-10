"""Common models shared across resources."""
from enum import Enum
from typing import Optional

from pydantic import BaseModel


class PaginatedListResponse(BaseModel):
    """Base fields for cursor-paginated list responses.

    ``count`` is the number of items in this page. ``continue_token`` is the
    opaque Kubernetes continuation token for the next page, or ``None`` on the
    last page. ``remaining_item_count`` is Kubernetes' best-effort estimate of
    items left after this page and may be ``None``.
    """
    count: int
    continue_token: Optional[str] = None
    remaining_item_count: Optional[int] = None


class AvailabilityStatus(str, Enum):
    """Resource availability status matching Kubernetes condition conventions."""
    TRUE = "True"      # Resource is available and ready
    FALSE = "False"    # Resource is not available
    UNKNOWN = "Unknown"  # Availability cannot be determined


def extract_availability_from_conditions(conditions: list, condition_type: str = "Available") -> AvailabilityStatus:
    """
    Extract availability status from Kubernetes conditions.

    Args:
        conditions: List of Kubernetes conditions
        condition_type: The condition type to look for (default: "Available")

    Returns:
        AvailabilityStatus enum value
    """
    if not conditions:
        return AvailabilityStatus.UNKNOWN

    for condition in conditions:
        if condition.get("type") == condition_type:
            status = condition.get("status")
            if status == "True":
                return AvailabilityStatus.TRUE
            elif status == "False":
                return AvailabilityStatus.FALSE
            else:
                return AvailabilityStatus.UNKNOWN

    return AvailabilityStatus.UNKNOWN