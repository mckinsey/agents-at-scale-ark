from contextlib import asynccontextmanager
from typing import Optional

from ark_sdk import versions
from ark_sdk.k8s import get_context
from ark_sdk.executor import (
    Parameter,
    Model,
    AgentConfig,
    ToolDefinition,
    Message,
    ExecutionEngineRequest,
    ExecutionEngineResponse,
    BaseExecutor,
)
from ark_sdk.executor_app import ExecutorApp

V1_ALPHA1 = "v1alpha1"
V1_PREALPHA1 = "v1prealpha1"

def get_client(namespace: Optional[str], version: str):
    # If namespace is None, get it from context
    if namespace is None:
        namespace = get_context()["namespace"]

    clazz = {
        V1_ALPHA1: versions.ARKClientV1alpha1,
        V1_PREALPHA1: versions.ARKClientV1prealpha1
    }.get(version)
    if not clazz:
        raise Exception(f"No client for {version}")
    return clazz(namespace)

@asynccontextmanager
async def with_ark_client(namespace: Optional[str], version: str):
    """
    Async context manager that provides an ARK client.

    Args:
        namespace: The Kubernetes namespace (defaults to current context)
        version: The API version to use

    Yields:
        ARK client instance
    """
    ark_client = get_client(namespace, version)
    yield ark_client