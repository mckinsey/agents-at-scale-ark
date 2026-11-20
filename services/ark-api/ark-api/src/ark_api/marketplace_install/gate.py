import logging
import os
from typing import Awaitable, Callable, Optional

from fastapi import Request
from kubernetes_asyncio import client

from ark_sdk.impersonation import ImpersonationConfig

from ..api.v1.client_utils import get_impersonating_api_client
from ..auth.constants import AuthMode
from ..auth.impersonation_config import ImpersonationSettings
from .constants import ARK_GROUP, INSTALL_RESOURCE, INSTALL_VERB
from ..models.marketplace_installs import CapabilityReason
from .errors import describe_error, install_error

logger = logging.getLogger(__name__)

API_KEY_NOT_SUPPORTED: CapabilityReason = "api-key-not-supported"
IMPERSONATION_DISABLED: CapabilityReason = "impersonation-disabled"
NOT_PERMITTED: CapabilityReason = "not-permitted"

IDENTITY_MESSAGES = {
    API_KEY_NOT_SUPPORTED: "Marketplace installs need a signed-in user; API keys are not supported",
    IMPERSONATION_DISABLED: (
        "Marketplace installs run as the signed-in user, but user impersonation is not enabled on the Ark API"
    ),
    NOT_PERMITTED: "The request carries no user identity",
}

INSTALL_DENIED = "You are not permitted to install marketplace items in this namespace"
READ_DENIED = "You are not permitted to view marketplace installs in this namespace"

_CREATE_INSTALLS = (ARK_GROUP, INSTALL_RESOURCE, INSTALL_VERB, None)
_LIST_JOBS = ("batch", "jobs", "list", None)
_GET_POD_LOGS = ("", "pods", "get", "log")


def is_open_mode() -> bool:
    return (os.getenv("AUTH_MODE", "").lower() or AuthMode.OPEN) == AuthMode.OPEN


def identity_denial(request: Request) -> Optional[CapabilityReason]:
    if is_open_mode():
        return None
    if getattr(request.state, "api_key", None) is not None:
        return API_KEY_NOT_SUPPORTED
    if not ImpersonationSettings.from_env().enabled:
        return IMPERSONATION_DISABLED
    identity = getattr(request.state, "user_identity", None)
    username = getattr(identity, "username", None)
    if not isinstance(username, str) or not username.strip():
        return NOT_PERMITTED
    return None


async def review_allowed(api, namespace: str, group: str, resource: str, verb: str, subresource: Optional[str]) -> bool:
    review = await client.AuthorizationV1Api(api).create_self_subject_access_review(
        client.V1SelfSubjectAccessReview(
            spec=client.V1SelfSubjectAccessReviewSpec(
                resource_attributes=client.V1ResourceAttributes(
                    namespace=namespace,
                    group=group,
                    resource=resource,
                    verb=verb,
                    subresource=subresource,
                )
            )
        )
    )
    return review.status is not None and review.status.allowed is True


async def _any_allowed(impersonation: Optional[ImpersonationConfig], namespace: str, checks) -> bool:
    if impersonation is None:
        return False
    try:
        async with get_impersonating_api_client(impersonation) as api:
            for check in checks:
                if await review_allowed(api, namespace, *check):
                    return True
            return False
    except Exception as e:
        logger.warning("Marketplace install access review failed: %s", describe_error(e))
        return False


async def can_install(impersonation: Optional[ImpersonationConfig], namespace: str) -> bool:
    return await _any_allowed(impersonation, namespace, [_CREATE_INSTALLS])


async def can_read(impersonation: Optional[ImpersonationConfig], namespace: str) -> bool:
    return await _any_allowed(impersonation, namespace, [_LIST_JOBS, _CREATE_INSTALLS])


async def can_read_logs(impersonation: Optional[ImpersonationConfig], namespace: str) -> bool:
    return await can_read(impersonation, namespace) and await _any_allowed(
        impersonation, namespace, [_GET_POD_LOGS]
    )


Check = Callable[[Optional[ImpersonationConfig], str], Awaitable[bool]]


async def _require(request: Request, impersonation: Optional[ImpersonationConfig], namespace: str, check: Check, denied: str) -> None:
    if is_open_mode():
        return
    code = identity_denial(request)
    if code is not None:
        raise install_error(403, code, IDENTITY_MESSAGES[code])
    if not await check(impersonation, namespace):
        raise install_error(403, NOT_PERMITTED, denied)


async def require_install(request: Request, impersonation: Optional[ImpersonationConfig], namespace: str) -> None:
    await _require(request, impersonation, namespace, can_install, INSTALL_DENIED)


async def require_read(request: Request, impersonation: Optional[ImpersonationConfig], namespace: str) -> None:
    await _require(request, impersonation, namespace, can_read, READ_DENIED)


async def logs_visible(request: Request, impersonation: Optional[ImpersonationConfig], namespace: str) -> bool:
    if is_open_mode():
        return True
    if identity_denial(request) is not None:
        return False
    return await can_read_logs(impersonation, namespace)
