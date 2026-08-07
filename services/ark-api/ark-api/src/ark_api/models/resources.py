"""Pydantic models for generic Kubernetes resource endpoints."""
from pydantic import BaseModel


class AccessReviewRequest(BaseModel):
    """Request body for a generic SelfSubjectAccessReview."""

    group: str = ""
    resource: str
    verb: str


class AccessReviewResponse(BaseModel):
    """Result of a SelfSubjectAccessReview."""

    allowed: bool
