from typing import Literal, Optional

from pydantic import BaseModel

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
