"""Pydantic models for generic Kubernetes resource endpoints."""
from typing import Optional

from pydantic import BaseModel, Field


class AccessReviewRequest(BaseModel):
    """Request body for a generic SelfSubjectAccessReview."""

    group: str = ""
    resource: str
    verb: str


class AccessReviewResponse(BaseModel):
    """Result of a SelfSubjectAccessReview."""

    allowed: bool
    reason: Optional[str] = Field(
        default=None,
        description="Set when ark-api refuses the operation for this caller before asking Kubernetes",
    )
