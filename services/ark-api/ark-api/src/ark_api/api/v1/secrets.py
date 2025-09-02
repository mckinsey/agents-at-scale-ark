"""Kubernetes secrets API endpoints."""
import base64
import logging

from fastapi import APIRouter, HTTPException
from kubernetes_asyncio import client
from kubernetes_asyncio.client.api_client import ApiClient

from ...models.kubernetes import (
    SecretResponse,
    SecretListResponse,
    SecretCreateRequest,
    SecretUpdateRequest,
    SecretDetailResponse
)
from .exceptions import handle_k8s_errors

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/namespaces/{namespace}/secrets", tags=["secrets"])


def validate_and_decode_token(string_data: dict) -> dict:
    """
    Validate that string_data only contains 'token' field and ensure it's not base64 encoded.
    
    Args:
        string_data: The secret data dictionary
        
    Returns:
        dict: The string_data with base64 encoded token
        
    Raises:
        HTTPException: If string_data contains fields other than 'token'
    """
    if not string_data:
        raise HTTPException(
            status_code=400,
            detail="Secret data cannot be empty"
        )
    
    allowed_fields = {"token"}
    provided_fields = set(string_data.keys())
    
    if provided_fields != allowed_fields:
        invalid_fields = provided_fields - allowed_fields
        raise HTTPException(
            status_code=400,
            detail=f"Only 'token' field is allowed. Invalid fields: {', '.join(invalid_fields)}"
        )
    
    # Ensure token is base64 encoded
    token_value = string_data["token"]
    
    # Check if already base64 encoded by trying to decode
    try:
        # If it decodes successfully and re-encoding gives the same value, it's already base64
        decoded = base64.b64decode(token_value, validate=True)
        decoded.decode('utf-8')
        if base64.b64encode(decoded).decode('utf-8') == token_value:
            # Already base64 encoded - so return the decoded
            string_data["token"]= decoded.decode('utf-8')
            return string_data
    except Exception:
        # Not base64 encoded or invalid base64
        pass
       
    return {"token": token_value}


def calculate_secret_length(secret_data: dict) -> int:
    """
    Calculate the total length of all secret data.
    
    Args:
        secret_data: The secret data dictionary (base64 encoded values)
        
    Returns:
        int: Total length of all decoded secret values in bytes
    """
    total_length = 0
    if secret_data:
        for value in secret_data.values():
            try:
                decoded_value = base64.b64decode(value)
                total_length += len(decoded_value)
            except Exception:
                # If decoding fails, use the encoded length
                total_length += len(value)
    return total_length


@router.get("", response_model=SecretListResponse)
@handle_k8s_errors(operation="list", resource_type="secret")
async def list_secrets(namespace: str) -> SecretListResponse:
    """
    List all Kubernetes secrets in a namespace.
    
    Args:
        namespace: The namespace to list secrets from
        
    Returns:
        SecretListResponse: List of all secrets in the namespace
    """
    async with ApiClient() as api:
        v1 = client.CoreV1Api(api)
        secrets = await v1.list_namespaced_secret(namespace)
    
        secret_list = []
        for secret in secrets.items:
            secret_list.append(
                SecretResponse(
                    name=secret.metadata.name,
                    id=str(secret.metadata.uid),
                    annotations=secret.metadata.annotations or {}
                )
            )
        
        return SecretListResponse(
            items=secret_list,
            count=len(secret_list)
        )


@router.post("", response_model=SecretDetailResponse)
async def create_secret(namespace: str, body: SecretCreateRequest) -> SecretDetailResponse:
    """
    Create a new Kubernetes secret.
    
    Args:
        namespace: The namespace to create the secret in
        body: The secret creation request
        
    Returns:
        SecretDetailResponse: The created secret details
    """
    # Validate and ensure token is not base64 encoded
    token_string_data = validate_and_decode_token(body.string_data)
    
    # Update body with token data
    body.string_data = token_string_data
    
    # Call inner function with secret_name for error handling
    return await _create_secret_with_name(namespace=namespace, secret_name=body.name, body=body)


@handle_k8s_errors(operation="create", resource_type="secret")
async def _create_secret_with_name(namespace: str, secret_name: str, body: SecretCreateRequest) -> SecretDetailResponse:
    """Inner function with secret_name parameter for error handling."""
    async with ApiClient() as api:
        v1 = client.CoreV1Api(api)
        
        secret = client.V1Secret(
            api_version="v1",
            kind="Secret",
            metadata=client.V1ObjectMeta(name=body.name),
            string_data=body.string_data,
            type=body.type
        )
        
        created_secret = await v1.create_namespaced_secret(namespace=namespace, body=secret)
        
        return SecretDetailResponse(
            name=created_secret.metadata.name,
            id=str(created_secret.metadata.uid),
            type=created_secret.type,
            secret_length=calculate_secret_length(created_secret.data),
            annotations=created_secret.metadata.annotations
        )


@router.get("/{secret_name}", response_model=SecretDetailResponse)
@handle_k8s_errors(operation="get", resource_type="secret")
async def get_secret(namespace: str, secret_name: str) -> SecretDetailResponse:
    """
    Get a specific Kubernetes secret by name.
    
    Args:
        namespace: The namespace to get the secret from
        secret_name: The name of the secret
        
    Returns:
        SecretDetailResponse: The secret details with total data length
    """
    async with ApiClient() as api:
        v1 = client.CoreV1Api(api)
        secret = await v1.read_namespaced_secret(name=secret_name, namespace=namespace)
        
        return SecretDetailResponse(
            name=secret.metadata.name,
            id=str(secret.metadata.uid),
            type=secret.type,
            secret_length=calculate_secret_length(secret.data),
            annotations=secret.metadata.annotations
        )


@router.put("/{secret_name}", response_model=SecretDetailResponse)
@handle_k8s_errors(operation="update", resource_type="secret")
async def update_secret(namespace: str, secret_name: str, body: SecretUpdateRequest) -> SecretDetailResponse:
    """
    Update a Kubernetes secret by name.
    
    Args:
        namespace: The namespace containing the secret
        secret_name: The name of the secret
        body: The secret update request
        
    Returns:
        SecretDetailResponse: The updated secret details
    """
    # Validate and ensure token is not base64 encoded
    token_string_data = validate_and_decode_token(body.string_data)
    
    async with ApiClient() as api:
        v1 = client.CoreV1Api(api)
        
        # Create a patch with the new data
        patch = client.V1Secret(
            string_data=token_string_data
        )
        
        updated_secret = await v1.patch_namespaced_secret(
            name=secret_name,
            namespace=namespace,
            body=patch
        )
        
        return SecretDetailResponse(
            name=updated_secret.metadata.name,
            id=str(updated_secret.metadata.uid),
            type=updated_secret.type,
            secret_length=calculate_secret_length(updated_secret.data),
            annotations=updated_secret.metadata.annotations
        )


@router.delete("/{secret_name}", status_code=204)
@handle_k8s_errors(operation="delete", resource_type="secret")
async def delete_secret(namespace: str, secret_name: str) -> None:
    """
    Delete a Kubernetes secret by name.
    
    Args:
        namespace: The namespace containing the secret
        secret_name: The name of the secret
    """
    async with ApiClient() as api:
        v1 = client.CoreV1Api(api)
        
        await v1.delete_namespaced_secret(
            name=secret_name,
            namespace=namespace,
            body=client.V1DeleteOptions()
        )