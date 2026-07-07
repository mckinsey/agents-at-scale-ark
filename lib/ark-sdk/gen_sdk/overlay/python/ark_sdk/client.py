from contextlib import asynccontextmanager
from typing import Optional

from ark_sdk import versions
from ark_sdk.k8s import get_context
from ark_sdk.impersonation import ImpersonationConfig
from ark_sdk.executor import (
    Parameter,
    Model,
    AgentConfig,
    MCPServerConfig,
    Message,
    ExecutionEngineRequest,
    ExecutionEngineResponse,
    BaseExecutor,
)
from ark_sdk.executor_app import ExecutorApp

V1_ALPHA1 = "v1alpha1"
V1_PREALPHA1 = "v1prealpha1"

_default_user_agent: Optional[str] = None

def set_default_user_agent(user_agent: str):
    """Set the default user-agent for all ARK clients created via with_ark_client/get_client."""
    global _default_user_agent
    _default_user_agent = user_agent

def _build_headers(impersonation: Optional[ImpersonationConfig] = None) -> Optional[dict]:
    if impersonation is None:
        return None
    headers = {"Impersonate-User": impersonation.username}
    if impersonation.groups:
        # default_headers is a plain dict (one value per name), so groups must be
        # comma-joined here. impersonation_patch splits this back into one
        # Impersonate-Group header per group at the transport layer.
        headers["Impersonate-Group"] = ",".join(impersonation.groups)
    return headers

def get_client(namespace: Optional[str], version: str, impersonation: Optional[ImpersonationConfig] = None, user_agent: Optional[str] = None):
    if namespace is None:
        namespace = get_context()["namespace"]

    clazz = {
        V1_ALPHA1: versions.ARKClientV1alpha1,
        V1_PREALPHA1: versions.ARKClientV1prealpha1
    }.get(version)
    if not clazz:
        raise Exception(f"No client for {version}")
    return clazz(namespace, default_headers=_build_headers(impersonation), user_agent=user_agent or _default_user_agent)

@asynccontextmanager
async def with_ark_client(namespace: Optional[str], version: str, impersonation: Optional[ImpersonationConfig] = None, user_agent: Optional[str] = None):
    """
    Async context manager that provides an ARK client.

    Args:
        namespace: The Kubernetes namespace (defaults to current context)
        version: The API version to use
        impersonation: Optional impersonation config for K8s user identity
        user_agent: Optional user-agent override for the K8s API client

    Yields:
        ARK client instance
    """
    ark_client = get_client(namespace, version, impersonation, user_agent=user_agent)
    yield ark_client
