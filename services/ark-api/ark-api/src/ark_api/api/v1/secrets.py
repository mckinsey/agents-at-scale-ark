"""Kubernetes secrets API endpoints using ark-sdk."""
import logging
from fastapi import APIRouter, Query
from typing import Optional
from ark_sdk.k8s import SecretClient
from ark_sdk.models.kubernetes import (
    SecretCreateRequest,
    SecretUpdateRequest,
    SecretDetailResponse,
    SecretListResponse
)
from .exceptions import handle_k8s_errors

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/secrets", tags=["secrets"])

@router.get("", response_model=SecretListResponse)
@handle_k8s_errors(operation="list", resource_type="secret")
async def list_secrets(namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> SecretListResponse:
    """List all secrets in namespace using ark-sdk."""
    client = SecretClient(namespace=namespace)
    result = await client.list_secrets()
    return SecretListResponse(**result)

@router.post("", response_model=SecretDetailResponse)
@handle_k8s_errors(operation="create", resource_type="secret")
async def create_secret(body: SecretCreateRequest, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> SecretDetailResponse:
    """Create a new secret using ark-sdk."""
    client = SecretClient(namespace=namespace)
    result = await client.create_secret(
        name=body.name,
        string_data=body.string_data,
        secret_type=body.type
    )
    return SecretDetailResponse(**result)

@router.get("/{secret_name}", response_model=SecretDetailResponse)
@handle_k8s_errors(operation="get", resource_type="secret")
async def get_secret(secret_name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> SecretDetailResponse:
    """Get a specific secret using ark-sdk."""
    client = SecretClient(namespace=namespace)
    result = await client.get_secret(secret_name)
    return SecretDetailResponse(**result)

@router.put("/{secret_name}", response_model=SecretDetailResponse)
@handle_k8s_errors(operation="update", resource_type="secret")
async def update_secret(secret_name: str, body: SecretUpdateRequest, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> SecretDetailResponse:
    """Update a secret using ark-sdk."""
    client = SecretClient(namespace=namespace)
    result = await client.update_secret(secret_name, body.string_data)
    return SecretDetailResponse(**result)

@router.delete("/{secret_name}")
@handle_k8s_errors(operation="delete", resource_type="secret")
async def delete_secret(secret_name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")):
    """Delete a secret using ark-sdk."""
    client = SecretClient(namespace=namespace)
    await client.delete_secret(secret_name)
    return {"message": "Secret deleted successfully"}
