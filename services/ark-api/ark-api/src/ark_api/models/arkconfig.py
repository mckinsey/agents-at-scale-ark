"""Pydantic models for cluster-wide ArkConfig."""
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ArkConfigMemoryRef(BaseModel):
    """Name of the Memory used as the cluster-wide default for queries.

    Extra keys are rejected rather than dropped: a `namespace` here would be
    silently ignored, while the same value applied with kubectl is refused by
    the validating webhook.
    """

    model_config = ConfigDict(extra="forbid")

    name: str = Field(
        min_length=1,
        description="Memory name. Always resolved in the namespace of the query being defaulted; a namespace cannot be set here.",
    )


class ArkConfigResponse(BaseModel):
    """Cluster-wide Ark defaults. Singleton resource named 'default'."""

    queryTTL: Optional[str] = Field(
        default=None,
        description="Default TTL injected into Query resources that do not specify spec.ttl (e.g. '720h').",
    )
    defaultMemory: Optional[ArkConfigMemoryRef] = Field(
        default=None,
        description="Memory injected into Query resources that do not specify spec.memory, and only when a Memory with that name exists in the query namespace.",
    )
    exists: bool = Field(
        default=False,
        description="Whether the ArkConfig singleton exists in the cluster.",
    )


class ArkConfigUpdateRequest(BaseModel):
    """Update payload for the ArkConfig singleton.

    Only the fields present in the request body are touched, so a client that
    manages one default cannot wipe another set elsewhere. Send a field as
    null to clear it.
    """

    queryTTL: Optional[str] = Field(
        default=None,
        description="Default TTL for queries (e.g. '720h'). Pass null to clear.",
    )
    defaultMemory: Optional[ArkConfigMemoryRef] = Field(
        default=None,
        description="Default Memory for queries. Pass null to clear.",
    )
