"""Kubernetes secrets API endpoints using ark-sdk."""
import logging
from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Literal, Optional
from ark_sdk.k8s import SecretClient
from ark_sdk.impersonation import ImpersonationConfig
from ark_sdk.secret_scope import SecretScope, SecretScopeChangeError
from ark_sdk.models.kubernetes import (
    SecretCreateRequest,
    SecretUpdateRequest,
    SecretDetailResponse,
    SecretListResponse
)
from .exceptions import handle_k8s_errors
from ...auth.dependencies import get_impersonation_config
from ...auth.secret_scope import get_secret_scope

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/secrets", tags=["secrets"])

PERSONAL_SECRET_IDENTITY_DETAIL = "Personal secrets require an authenticated user identity"


def _list_scope(scope: str, caller_scope: SecretScope) -> Optional[SecretScope]:
    if scope == "personal":
        return caller_scope.personal_only()
    if scope == "all":
        return caller_scope
    return SecretScope()


@router.get("", response_model=SecretListResponse)
@handle_k8s_errors(operation="list", resource_type="secret")
async def list_secrets(namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)"), scope: Literal["shared", "personal", "all"] = Query("shared", description="Which secrets to list: shared (default), the caller's personal ones, or all of both"), impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config), caller_scope: SecretScope = Depends(get_secret_scope)) -> SecretListResponse:
    """List the shared and/or personal secrets in namespace using ark-sdk."""
    list_scope = _list_scope(scope, caller_scope)
    if list_scope is None:
        return SecretListResponse(items=[], count=0)
    client = SecretClient(namespace=namespace, impersonation=impersonation, scope=list_scope)
    result = await client.list_secrets()
    return SecretListResponse(**result)

@router.post("", response_model=SecretDetailResponse)
@handle_k8s_errors(operation="create", resource_type="secret")
async def create_secret(body: SecretCreateRequest, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)"), impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config), scope: SecretScope = Depends(get_secret_scope)) -> SecretDetailResponse:
    """Create a new shared or personal secret using ark-sdk."""
    personal = body.scope == "personal"
    if personal and scope.personal_scope() is None:
        raise HTTPException(status_code=403, detail=PERSONAL_SECRET_IDENTITY_DETAIL)
    client = SecretClient(namespace=namespace, impersonation=impersonation, scope=scope)
    result = await client.create_secret(
        name=body.name,
        string_data=body.string_data,
        secret_type=body.type,
        description=body.description,
        alias=body.alias,
        labels=body.labels,
        personal=personal,
    )
    return SecretDetailResponse(**result)

@router.get("/{secret_name}", response_model=SecretDetailResponse)
@handle_k8s_errors(operation="get", resource_type="secret")
async def get_secret(secret_name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)"), impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config), scope: SecretScope = Depends(get_secret_scope)) -> SecretDetailResponse:
    """Get a specific secret using ark-sdk."""
    client = SecretClient(namespace=namespace, impersonation=impersonation, scope=scope)
    result = await client.get_secret(secret_name)
    return SecretDetailResponse(**result)

@router.put("/{secret_name}", response_model=SecretDetailResponse)
@handle_k8s_errors(operation="update", resource_type="secret")
async def update_secret(secret_name: str, body: SecretUpdateRequest, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)"), impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config), scope: SecretScope = Depends(get_secret_scope)) -> SecretDetailResponse:
    """Update a secret using ark-sdk; scope "shared" promotes a personal secret."""
    client = SecretClient(namespace=namespace, impersonation=impersonation, scope=scope)
    try:
        result = await client.update_secret(
            secret_name,
            string_data=body.string_data,
            description=body.description,
            alias=body.alias,
            labels=body.labels,
            scope=body.scope,
        )
    except SecretScopeChangeError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return SecretDetailResponse(**result)

@router.delete("/{secret_name}")
@handle_k8s_errors(operation="delete", resource_type="secret")
async def delete_secret(secret_name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)"), impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config), scope: SecretScope = Depends(get_secret_scope)):
    """Delete a secret using ark-sdk."""
    client = SecretClient(namespace=namespace, impersonation=impersonation, scope=scope)
    await client.delete_secret(secret_name)
    return {"message": "Secret deleted successfully"}
