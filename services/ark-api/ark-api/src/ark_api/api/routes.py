"""API routes for Ark API."""
import logging

from fastapi import APIRouter, HTTPException
from kubernetes import client
from kubernetes.client.rest import ApiException

from ark_sdk.models.kubernetes import NamespaceResponse, NamespaceListResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["api"])


@router.get("/namespaces", response_model=NamespaceListResponse)
async def list_namespaces() -> NamespaceListResponse:
    """
    List all Kubernetes namespaces.
    
    Returns:
        NamespaceListResponse: List of all namespaces
    """
    try:
        v1 = client.CoreV1Api()
        namespaces = v1.list_namespace()
        
        namespace_list = []
        for ns in namespaces.items:
            if ns.metadata.name.startswith('kube'):
                continue
            namespace_list.append(
                NamespaceResponse(name=ns.metadata.name)
            )
        
        return NamespaceListResponse(
            items=namespace_list,
            count=len(namespace_list)
        )
        
    except ApiException as e:
        logger.error(f"Failed to list namespaces: {e}")
        raise HTTPException(
            status_code=e.status,
            detail=f"Kubernetes API error: {e.reason}"
        )
    except Exception as e:
        logger.error(f"Unexpected error listing namespaces: {e}")
        raise HTTPException(
            status_code=500,
            detail="Internal server error"
        )