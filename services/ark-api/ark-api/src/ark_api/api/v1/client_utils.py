"""Utilities for creating Kubernetes API clients with impersonation support."""
from typing import Optional
from contextlib import asynccontextmanager
from ark_sdk.k8s import create_api_client
from ark_sdk.impersonation import ImpersonationConfig

USER_AGENT = "ArkAPI"


@asynccontextmanager
async def get_impersonating_api_client(impersonation: Optional[ImpersonationConfig] = None):
    """
    Create an async ApiClient with optional impersonation headers.

    Args:
        impersonation: Optional impersonation config for K8s user identity

    Yields:
        ApiClient instance with impersonation headers configured

    Example:
        async with get_impersonating_api_client(impersonation) as api:
            custom_api = CustomObjectsApi(api)
            # ... use custom_api
    """
    async with create_api_client() as api:
        api.user_agent = USER_AGENT
        if impersonation:
            api.set_default_header("Impersonate-User", impersonation.username)
            if impersonation.groups:
                api.set_default_header("Impersonate-Group", ",".join(impersonation.groups))
        yield api
