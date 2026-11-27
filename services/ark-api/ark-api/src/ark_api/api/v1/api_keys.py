"""API key management endpoints."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from kubernetes_asyncio import client

from ark_sdk.impersonation import ImpersonationConfig
from ark_sdk.k8s import get_context

from ...auth.dependencies import require_api_key_owner
from ...models.auth import (
    APIKeyCreateRequest,
    APIKeyCreateResponse,
    APIKeyListResponse,
    UserIdentity,
)
from ...services.api_keys import APIKeyService
from .client_utils import get_impersonating_api_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api-keys", tags=["api-keys"])

NAMESPACE_QUERY = Query(None, description="Namespace for this request (defaults to current context)")


async def _can_create_secrets(owner: UserIdentity, namespace: str) -> bool:
    impersonation = ImpersonationConfig(username=owner.username, groups=owner.groups)
    async with get_impersonating_api_client(impersonation) as api:
        review = await client.AuthorizationV1Api(api).create_self_subject_access_review(
            client.V1SelfSubjectAccessReview(
                spec=client.V1SelfSubjectAccessReviewSpec(
                    resource_attributes=client.V1ResourceAttributes(
                        namespace=namespace, verb="create", resource="secrets"
                    )
                )
            )
        )
    return bool(review.status and review.status.allowed)


async def authorize_api_key_creation(
    owner: Optional[UserIdentity] = Depends(require_api_key_owner),
    namespace: Optional[str] = NAMESPACE_QUERY,
) -> Optional[UserIdentity]:
    if owner is None:
        return None

    namespace = namespace or get_context()["namespace"]
    try:
        allowed = await _can_create_secrets(owner, namespace)
    except Exception:
        logger.warning("api-key creation permission probe failed", exc_info=True)
        allowed = False

    if not allowed:
        raise HTTPException(status_code=403, detail="not authorized to create API keys")
    return owner


@router.post("", response_model=APIKeyCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    body: APIKeyCreateRequest,
    owner: Optional[UserIdentity] = Depends(authorize_api_key_creation),
    namespace: Optional[str] = NAMESPACE_QUERY,
) -> APIKeyCreateResponse:
    """
    Create a new API key for service-to-service authentication.
    API keys are namespace-scoped for tenant isolation and stored in the
    supplied namespace, or the current context namespace when omitted.

    Args:
        body: API key creation request
        namespace: Namespace to store the key in (defaults to current context)

    Returns:
        APIKeyCreateResponse: The created API key with secret (only shown once)
    """
    try:
        api_key_service = APIKeyService(namespace=namespace)
        result = await api_key_service.create_api_key(
            body, created_by=owner.username if owner else None
        )

        logger.info(f"Created API key '{body.name}' with public key {result.public_key} in namespace {api_key_service.namespace}")
        return result

    except client.rest.ApiException as e:
        logger.error(f"Error creating API key in namespace {api_key_service.namespace}: {e}")
        if e.status == status.HTTP_403_FORBIDDEN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Not authorized to create API keys in namespace {api_key_service.namespace}"
            )
        raise HTTPException(
            status_code=e.status or status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create API key: {e.reason or str(e)}"
        )
    except Exception as e:
        logger.error(f"Error creating API key: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create API key: {str(e)}"
        )


@router.get("", response_model=APIKeyListResponse)
async def list_api_keys(
    owner: Optional[UserIdentity] = Depends(require_api_key_owner),
    namespace: Optional[str] = NAMESPACE_QUERY,
) -> APIKeyListResponse:
    """
    List all active API keys in the namespace (without secret keys).
    API keys are namespace-scoped for tenant isolation.

    Args:
        namespace: Namespace to list keys from (defaults to current context)

    Returns:
        APIKeyListResponse: List of API keys in the namespace
    """
    try:
        api_key_service = APIKeyService(namespace=namespace)
        result = await api_key_service.list_api_keys(
            created_by=owner.username if owner else None
        )
        logger.debug(f"Listed {result.count} API keys in namespace {api_key_service.namespace}")
        return result
        
    except Exception as e:
        logger.error(f"Error listing API keys: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list API keys: {str(e)}"
        )


@router.delete("/{public_key}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_api_key(
    public_key: str,
    owner: Optional[UserIdentity] = Depends(require_api_key_owner),
    namespace: Optional[str] = NAMESPACE_QUERY,
):
    """
    Soft delete an API key in the namespace by marking it as inactive.
    API keys are namespace-scoped for tenant isolation.

    Args:
        public_key: The public key of the API key to delete
        namespace: Namespace the key lives in (defaults to current context)
    """
    try:
        api_key_service = APIKeyService(namespace=namespace)

        success = await api_key_service.delete_api_key(
            public_key, created_by=owner.username if owner else None
        )
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"API key with public key '{public_key}' not found"
            )
        
        logger.info(f"Deleted API key {public_key} in namespace {api_key_service.namespace}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting API key {public_key}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete API key: {str(e)}"
        )
