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


InstallRecordState = Literal["installable", "installing", "installed", "failed", "timed-out", "platform-managed"]
InstallStage = Literal["resolve", "apply", "ready"]


class MarketplaceInstallEvent(BaseModel):
    type: str
    reason: str
    message: str
    objectKind: str
    objectName: str
    count: int = 1
    lastSeen: Optional[datetime] = None


class MarketplaceInstallRecord(BaseModel):
    source: Optional[str] = None
    itemName: Optional[str] = None
    release: str
    chartVersion: Optional[str] = None
    digest: Optional[str] = None
    state: InstallRecordState
    stage: Optional[InstallStage] = None
    failedStage: Optional[InstallStage] = None
    startedAt: Optional[datetime] = None
    installedBy: Optional[str] = None
    events: list[MarketplaceInstallEvent] = []
    log: Optional[str] = None


class MarketplaceInstallList(BaseModel):
    items: list[MarketplaceInstallRecord]


class MarketplaceInstallErrorDetail(BaseModel):
    code: str
    message: str
    record: Optional[MarketplaceInstallRecord] = None


class MarketplaceInstallError(BaseModel):
    detail: MarketplaceInstallErrorDetail
