from typing import Optional

from fastapi import Request

from ark_sdk.impersonation import ImpersonationConfig
from .impersonation_config import ImpersonationSettings


def get_impersonation_config(request: Request) -> Optional[ImpersonationConfig]:
    settings = ImpersonationSettings.from_env()
    if not settings.enabled:
        return None

    identity = getattr(request.state, "user_identity", None)
    if identity is None:
        return None

    return ImpersonationConfig(username=identity.username, groups=identity.groups)
