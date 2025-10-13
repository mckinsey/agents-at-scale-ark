"""API key management endpoints."""

import logging
from fastapi import APIRouter, HTTPException, status

from ...models.auth import (
    APIKeyCreateRequest,
    APIKeyCreateResponse,
    APIKeyListResponse
)
from ...services.api_keys import APIKeyService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api-keys", tags=["api-keys"])


@router.post("", response_model=APIKeyCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    body: APIKeyCreateRequest
) -> APIKeyCreateResponse:
    """
    Create a new API key for service-to-service authentication.
    API keys are namespace-scoped for tenant isolation and stored in the current namespace.
    
    Args:
        body: API key creation request
        
    Returns:
        APIKeyCreateResponse: The created API key with secret (only shown once)
    """
    try:
        api_key_service = APIKeyService()
        result = await api_key_service.create_api_key(body)
        
        logger.info(f"Created API key '{body.name}' with public key {result.public_key} in namespace {api_key_service.namespace}")
        return result
        
    except Exception as e:
        logger.error(f"Error creating API key: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create API key: {str(e)}"
        )


@router.get("", response_model=APIKeyListResponse)
async def list_api_keys() -> APIKeyListResponse:
    """
    List all active API keys in the current namespace (without secret keys).
    API keys are namespace-scoped for tenant isolation.
    
    Returns:
        APIKeyListResponse: List of API keys in the current namespace
    """
    try:
        api_key_service = APIKeyService()
        result = await api_key_service.list_api_keys()
        logger.debug(f"Listed {result.count} API keys in namespace {api_key_service.namespace}")
        return result
        
    except Exception as e:
        logger.error(f"Error listing API keys: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list API keys: {str(e)}"
        )


@router.delete("/{public_key}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_api_key(public_key: str):
    """
    Soft delete an API key in the current namespace by marking it as inactive.
    API keys are namespace-scoped for tenant isolation.
    
    Args:
        public_key: The public key of the API key to delete
    """
    try:
        api_key_service = APIKeyService()
        
        success = await api_key_service.delete_api_key(public_key)
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
