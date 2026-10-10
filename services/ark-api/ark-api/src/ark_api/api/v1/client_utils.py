"""Utilities for creating Kubernetes API clients with impersonation support."""
from typing import Optional
from contextlib import asynccontextmanager
from kubernetes import client as sync_client
from ark_sdk.k8s import apply_impersonation_headers, create_api_client, create_sync_api_client
from ark_sdk.impersonation import ImpersonationConfig

USER_AGENT = "ArkAPI"


def get_impersonating_sync_api_client(
    impersonation: Optional[ImpersonationConfig] = None,
) -> sync_client.ApiClient:
    """Create a sync ApiClient with optional impersonation headers."""
    api = create_sync_api_client()
    api.user_agent = USER_AGENT
    return apply_impersonation_headers(api, impersonation)


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

    Note: the comma-joined ``Impersonate-Group`` header produced by
    ``apply_impersonation_headers`` is split back into one header per group by
    the rest-client patch in ``impersonation_groups_patch`` so Kubernetes RBAC
    sees each group.
    """
    async with create_api_client() as api:
        api.user_agent = USER_AGENT
        apply_impersonation_headers(api, impersonation)
        yield api
