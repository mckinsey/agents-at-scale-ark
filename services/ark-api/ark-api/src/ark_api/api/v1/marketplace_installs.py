import os
from typing import Optional

from fastapi import APIRouter, Depends, Path, Request

from ark_sdk.impersonation import ImpersonationConfig

from ...auth.dependencies import get_impersonation_config
from ...marketplace_install import capability, gate
from ...marketplace_install.constants import NAMESPACE_PATTERN
from ...models.marketplace_installs import CapabilityReason, MarketplaceInstallCapability

router = APIRouter(
    prefix="/namespaces/{namespace}/marketplace-installs",
    tags=["marketplace-installs"],
)


async def _first_reason(
    namespace: str, request: Request, impersonation: Optional[ImpersonationConfig]
) -> Optional[CapabilityReason]:
    if os.getenv("READ_ONLY_MODE", "false").lower() == "true":
        return "read-only"
    denial = gate.identity_denial(request)
    if denial is not None:
        return denial
    if not await capability.installer_enabled(namespace):
        return "namespace-not-enabled"
    if not await capability.policy_in_place(namespace):
        return "policy-missing"
    if not gate.is_open_mode() and not await gate.can_install(impersonation, namespace):
        return "not-permitted"
    return None


@router.get("/capability", response_model=MarketplaceInstallCapability)
async def get_marketplace_install_capability(
    request: Request,
    namespace: str = Path(pattern=NAMESPACE_PATTERN),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> MarketplaceInstallCapability:
    reason = await _first_reason(namespace, request, impersonation)
    return MarketplaceInstallCapability(enabled=reason is None, reason=reason)
