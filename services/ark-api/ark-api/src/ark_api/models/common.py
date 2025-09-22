"""Common models shared across resources."""
from enum import Enum


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