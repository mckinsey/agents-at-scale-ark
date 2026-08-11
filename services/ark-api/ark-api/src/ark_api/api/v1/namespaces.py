"""Namespaces API endpoints."""
import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from kubernetes_asyncio import client
from kubernetes_asyncio.client.exceptions import ApiException
from ark_sdk.k8s import create_api_client

from ark_sdk.models.kubernetes import NamespaceResponse, NamespaceListResponse, NamespaceCreateRequest
from ark_sdk.impersonation import ImpersonationConfig

from ...auth.dependencies import get_impersonation_config
from ...core.namespace import get_current_context
from ...core.permissions import get_ark_permissions
from ...models.context import ContextResponse
from .client_utils import get_impersonating_api_client
from .exceptions import handle_k8s_errors

logger = logging.getLogger(__name__)

router = APIRouter(tags=["namespaces"])


@router.get("/namespaces", response_model=NamespaceListResponse)
@handle_k8s_errors(operation="list", resource_type="namespace")
async def list_namespaces(impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config)) -> NamespaceListResponse:
    """
    List all available namespaces.

    Returns:
        NamespaceListResponse: List of all available namespaces
    """
    async with get_impersonating_api_client(impersonation) as api:
        v1 = client.CoreV1Api(api)
        
        # List all namespaces
        namespace_list_response = await v1.list_namespace()
        
        # Convert to our response format
        namespace_list = [
            NamespaceResponse(name=ns.metadata.name)
            for ns in namespace_list_response.items
        ]
        
        return NamespaceListResponse(
            items=namespace_list,
            count=len(namespace_list)
        )


@router.post("/namespaces", response_model=NamespaceResponse)
@handle_k8s_errors(operation="create", resource_type="namespace")
async def create_namespace(body: NamespaceCreateRequest, impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config)) -> NamespaceResponse:
    """
    Create a new Kubernetes namespace.

    Args:
        body: The namespace creation request

    Returns:
        NamespaceResponse: The created namespace details
    """
    async with get_impersonating_api_client(impersonation) as api:
        v1 = client.CoreV1Api(api)
        
        # Create the namespace object
        namespace_body = client.V1Namespace(
            metadata=client.V1ObjectMeta(name=body.name)
        )
        
        # Create the namespace
        created_namespace = await v1.create_namespace(body=namespace_body)
        
        return NamespaceResponse(
            name=created_namespace.metadata.name
        )


@router.get("/context", response_model=ContextResponse)
async def get_context_endpoint(
    namespace: str = None,
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> ContextResponse:
    """
    Get the current Kubernetes context information.

    Returns context following standard k8s patterns:
    1. In-cluster service account (when running in pods)
    2. Kubeconfig context (when running locally)
    3. Fallback to default

    Args:
        namespace: Optional namespace to check for demo mode

    Returns:
        ContextResponse: The current namespace, cluster, and read-only mode status
    """
    current_context = get_current_context()
    
    # Use provided namespace or fall back to current context namespace
    target_namespace = namespace or current_context["namespace"]
    
    # Check if namespace exists and has demo label
    read_only_mode = False
    try:
        async with create_api_client() as api:
            v1 = client.CoreV1Api(api)
            ns = await v1.read_namespace(name=target_namespace)

            # Check if namespace has demo label
            if ns.metadata.labels and ns.metadata.labels.get("ark.mckinsey.com/demo") == "true":
                read_only_mode = True
    except ApiException as e:
        if e.status == 404:
            # Namespace doesn't exist - return 404 with default namespace for redirect
            default_namespace = current_context["namespace"]
            raise HTTPException(
                status_code=404,
                detail={
                    "message": f"Namespace '{target_namespace}' not found",
                    "default_namespace": default_namespace
                }
            )
        logger.warning("Could not check namespace labels: %s", e)
        # Fall back to environment variable for other errors
        read_only_mode = os.getenv("READ_ONLY_MODE", "false").lower() == "true"
    except Exception as e:
        logger.warning("Could not check namespace labels: %s", e)
        # Fall back to environment variable if we can't check the namespace
        read_only_mode = os.getenv("READ_ONLY_MODE", "false").lower() == "true"

    permissions = await get_ark_permissions(impersonation, target_namespace)

    return ContextResponse(
        namespace=target_namespace,
        cluster=current_context["cluster"],
        read_only_mode=read_only_mode,
        permissions=permissions,
    )
