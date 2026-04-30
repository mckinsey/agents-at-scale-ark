"""Pydantic models for cluster-wide ArkConfig."""
from typing import Optional

from pydantic import BaseModel, Field


class ArkConfigResponse(BaseModel):
    """Cluster-wide Ark defaults. Singleton resource named 'default'."""

    queryTTL: Optional[str] = Field(
        default=None,
        description="Default TTL injected into Query resources that do not specify spec.ttl (e.g. '720h').",
    )
    exists: bool = Field(
        default=False,
        description="Whether the ArkConfig singleton exists in the cluster.",
    )


class ArkConfigUpdateRequest(BaseModel):
    """Update payload for the ArkConfig singleton."""

    queryTTL: Optional[str] = Field(
        default=None,
        description="Default TTL for queries (e.g. '720h'). Pass null to clear.",
    )
