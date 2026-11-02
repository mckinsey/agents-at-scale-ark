from typing import Optional

from fastapi import Request

from ark_sdk.secret_scope import SecretScope

from .impersonation_config import ImpersonationSettings


def secret_owner(request: Request) -> Optional[str]:
    """The username claim as the IdP sends it, minus IMPERSONATION_PREFIX; never case-folded or trimmed."""
    identity = getattr(request.state, "user_identity", None)
    username = getattr(identity, "username", None)
    if not isinstance(username, str):
        return None
    username = username.removeprefix(ImpersonationSettings.from_env().prefix)
    return username if username.strip() else None


def get_secret_scope(request: Request) -> SecretScope:
    owner = secret_owner(request)
    return SecretScope.for_user(owner) if owner else SecretScope()
