"""Kubernetes A2A servers API endpoints."""
import logging

from fastapi import APIRouter, Query
from typing import Optional
from ark_sdk.models.a2_a_server_v1prealpha1 import A2AServerV1prealpha1
from ark_sdk.models.a2_a_server_v1prealpha1_spec import A2AServerV1prealpha1Spec

from ark_sdk.client import with_ark_client

from ...models.a2a_servers import (
    A2AServerResponse,
    A2AServerListResponse,
    A2AServerCreateRequest,
    A2AServerUpdateRequest,
    A2AServerDetailResponse
)
from .exceptions import handle_k8s_errors

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/a2a-servers", tags=["a2a-servers"])

# CRD configuration
VERSION = "v1prealpha1" 

def a2a_server_to_response(a2a_server: dict) -> A2AServerResponse:
    """Convert a Kubernetes A2AServer CR to a response model."""
    metadata = a2a_server.get("metadata", {})
    spec = a2a_server.get("spec", {})
    status = a2a_server.get("status", {})
    resolved_address = status.get("lastResolvedAddress")

    conditions = status.get("conditions", [])
    ready = None
    discovering = None
    status_message = None

    for condition in conditions:
        if condition.get("type") == "Ready":
            ready = condition.get("status") == "True"
            if not ready:
                status_message = condition.get("message")
        elif condition.get("type") == "Discovering":
            discovering = condition.get("status") == "True"

    return A2AServerResponse(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        description=spec.get("description"),
        labels=metadata.get("labels"),
        address=resolved_address,
        annotations=metadata.get("annotations"),
        ready=ready,
        discovering=discovering,
        status_message=status_message
    )


def a2a_server_to_detail_response(a2a_server: dict) -> A2AServerDetailResponse:
    """Convert a Kubernetes A2AServer CR to a detailed response model."""
    metadata = a2a_server.get("metadata", {})
    spec = a2a_server.get("spec", {})
    status = a2a_server.get("status", {})
    
    return A2AServerDetailResponse(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        description=spec.get("description"),
        labels=metadata.get("labels"),
        annotations=metadata.get("annotations"),
        spec=spec,
        status=status
    )


@router.get("", response_model=A2AServerListResponse)
@handle_k8s_errors(operation="list", resource_type="a2a server")
async def list_a2a_servers(namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> A2AServerListResponse:
    """
    List all A2AServer CRs in a namespace.
    
    Args:
        namespace: The namespace to list A2A servers from
        
    Returns:
        A2AServerListResponse: List of all A2A servers in the namespace
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        a2a_servers = await ark_client.a2aservers.a_list()
        
        a2a_server_list = []
        for a2a_server in a2a_servers:
            a2a_server_list.append(a2a_server_to_response(a2a_server.to_dict()))
        
        return A2AServerListResponse(
            items=a2a_server_list,
            total=len(a2a_server_list)
        )


@router.post("", response_model=A2AServerDetailResponse, include_in_schema=False)
@handle_k8s_errors(operation="create", resource_type="a2a server")
async def create_a2a_server(body: A2AServerCreateRequest, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> A2AServerDetailResponse:
    """
    Create a new A2AServer CR.
    
    Args:
        namespace: The namespace to create the A2A server in
        body: The A2A server creation request
        
    Returns:
        A2AServerDetailResponse: The created A2A server details
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        # Build the A2A server spec
        a2a_server_spec = body.spec.model_dump(exclude_none=True)
        
        # Create the A2AServerV1prealpha1 object
        a2a_server_resource = A2AServerV1prealpha1(
            metadata={
                "name": body.name,
                "namespace": namespace,
                "labels": body.labels,
                "annotations": body.annotations
            },
            spec=A2AServerV1prealpha1Spec(**a2a_server_spec)
        )
        
        created_a2a_server = await ark_client.a2aservers.a_create(a2a_server_resource)
        
        return a2a_server_to_detail_response(created_a2a_server.to_dict())


@router.get("/{a2a_server_name}", response_model=A2AServerDetailResponse)
@handle_k8s_errors(operation="get", resource_type="a2a server")
async def get_a2a_server(a2a_server_name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> A2AServerDetailResponse:
    """
    Get a specific A2AServer CR by name.
    
    Args:
        namespace: The namespace to get the A2A server from
        a2a_server_name: The name of the A2A server
        
    Returns:
        A2AServerDetailResponse: The A2A server details
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        a2a_server = await ark_client.a2aservers.a_get(a2a_server_name)
        
        return a2a_server_to_detail_response(a2a_server.to_dict())


@router.put("/{a2a_server_name}", response_model=A2AServerDetailResponse, include_in_schema=False)
@handle_k8s_errors(operation="update", resource_type="a2a server")
async def update_a2a_server(a2a_server_name: str, body: A2AServerUpdateRequest, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> A2AServerDetailResponse:
    """
    Update a A2AServer CR by name.
    
    Args:
        namespace: The namespace containing the A2A server
        a2a_server_name: The name of the A2A server
        body: The A2A server update request
        
    Returns:
        A2AServerDetailResponse: The updated A2A server details
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        # Get the existing A2A server first
        existing_a2a_server = await ark_client.a2aservers.a_get(a2a_server_name)
        existing_dict = existing_a2a_server.to_dict()
        
        # Update metadata if provided
        if body.labels is not None:
            existing_dict["metadata"]["labels"] = body.labels
        if body.annotations is not None:
            existing_dict["metadata"]["annotations"] = body.annotations
            
        # Update spec if provided
        if body.spec is not None:
            existing_dict["spec"] = body.spec.model_dump(exclude_none=True)
        
        # Update the A2A server
        updated_resource = A2AServerV1prealpha1(**existing_dict)
        
        updated_a2a_server = await ark_client.a2aservers.a_update(updated_resource)
        
        return a2a_server_to_detail_response(updated_a2a_server.to_dict())


@router.delete("/{a2a_server_name}", status_code=204)
@handle_k8s_errors(operation="delete", resource_type="a2a server")
async def delete_a2a_server(a2a_server_name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> None:
    """
    Delete a A2AServer CR by name.
    
    Args:
        namespace: The namespace containing the A2A server
        a2a_server_name: The name of the A2A server
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        await ark_client.a2aservers.a_delete(a2a_server_name)
