from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

CapabilityReason = Literal[
    "read-only",
    "api-key-not-supported",
    "impersonation-disabled",
    "namespace-not-enabled",
    "policy-missing",
    "not-permitted",
]


class MarketplaceInstallCapability(BaseModel):
    enabled: bool
    reason: Optional[CapabilityReason] = None


class MarketplaceInstallErrorDetail(BaseModel):
    code: str
    message: str


InstallResourceState = Literal[
    "free",
    "conflict-release",
    "conflict-unmanaged",
    "cluster-scoped",
    "namespace-mismatch",
    "crd",
    "skip-webhook-label",
    "rbac-escalation",
    "reserved-secret",
    "personal-secret-ref",
    "psa-violation",
    "unverifiable",
]


class MarketplaceInstallResource(BaseModel):
    apiVersion: str
    kind: str
    name: str
    namespace: Optional[str] = None
    state: InstallResourceState
    ownedByRelease: Optional[str] = None
    hook: bool = False
    message: Optional[str] = None


class MarketplaceInstallPreviewRequest(BaseModel):
    source: str = Field(min_length=1, max_length=253, pattern=r"^[-._a-zA-Z0-9]+$")


class MarketplaceInstallPreview(BaseModel):
    source: str
    itemName: str
    chartName: str
    chartRef: str
    chartVersion: str
    digest: str
    releaseName: str
    namespace: str
    blocked: bool
    expiresAt: datetime
    resources: list[MarketplaceInstallResource]
