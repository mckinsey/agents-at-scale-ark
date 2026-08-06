import os
from typing import Optional

from fastapi import HTTPException, Request

from ark_sdk.impersonation import ImpersonationConfig
from .constants import AuthMode
from .impersonation_config import ImpersonationSettings
from ..models.auth import UserIdentity


def get_impersonation_config(request: Request) -> Optional[ImpersonationConfig]:
    settings = ImpersonationSettings.from_env()
    if not settings.enabled:
        return None

    identity = getattr(request.state, "user_identity", None)
    if identity is None:
        return None

    return ImpersonationConfig(username=identity.username, groups=identity.groups)


def require_api_key_owner(request: Request) -> Optional[UserIdentity]:
    settings = ImpersonationSettings.from_env()
    auth_mode = os.getenv("AUTH_MODE", "").lower()
    if not settings.enabled or auth_mode not in (AuthMode.SSO, AuthMode.HYBRID):
        return None

    identity = getattr(request.state, "user_identity", None)
    if identity is None or not identity.username:
        raise HTTPException(
            status_code=403,
            detail="API key management requires an authenticated user identity",
        )
    return identity
