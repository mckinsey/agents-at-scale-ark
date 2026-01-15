"""Kubernetes MCP servers API endpoints."""
import logging

from fastapi import APIRouter, Query
from typing import Optional
from ark_sdk.models.mcp_server_v1alpha1 import MCPServerV1alpha1
from ark_sdk.models.mcp_server_v1alpha1_spec import MCPServerV1alpha1Spec

from ark_sdk.client import with_ark_client

from ...models.mcp_servers import (
    MCPServerResponse,
    MCPServerListResponse,
    MCPServerCreateRequest,
    MCPServerUpdateRequest,
    MCPServerDetailResponse
)
from ...models.common import AvailabilityStatus, extract_availability_from_conditions
from .exceptions import handle_k8s_errors

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/mcp-servers", tags=["mcp-servers"])

# CRD configuration
VERSION = "v1alpha1"

def mcp_server_to_response(mcp_server: dict) -> MCPServerResponse:
    """Convert a Kubernetes MCPServer CR to a response model."""
    metadata = mcp_server.get("metadata", {})
    spec = mcp_server.get("spec", {})
    status = mcp_server.get("status", {})
    resolved_address = status.get("resolvedAddress")
    conditions = status.get("conditions", [])
    availability = extract_availability_from_conditions(conditions, "Available")
    #discovering = None
    status_message = None

    if availability == AvailabilityStatus.FALSE:
        available_cond = next(filter(lambda c: c.get("type") == "Available", conditions))
        if available_cond:
            status_message = available_cond.get("message")
    
    return MCPServerResponse(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        status_message=status_message,
        address=resolved_address,
        annotations=metadata.get("annotations"),
        transport=spec.get("transport"),
        available=availability,
        tool_count=status.get("toolCount")
    )


def mcp_server_to_detail_response(mcp_server: dict) -> MCPServerDetailResponse:
    """Convert a Kubernetes MCPServer CR to a detailed response model."""
    metadata = mcp_server.get("metadata", {})
    spec = mcp_server.get("spec", {})
    status = mcp_server.get("status", {})
    conditions = status.get("conditions", [])
    availability = extract_availability_from_conditions(conditions, "Available")
    headers = spec.get("headers", [])
    logger.info(f"Spec: {status}")
    return MCPServerDetailResponse(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        description=spec.get("description"),
        labels=metadata.get("labels"),
        headers=headers,
        annotations=metadata.get("annotations"),
        available=availability,
        status=status,
        address=status.get("resolvedAddress"),
        transport=spec.get("transport"),
        tool_count=status.get("toolCount")
    )


@router.get("", response_model=MCPServerListResponse)
@handle_k8s_errors(operation="list", resource_type="mcp server")
async def list_mcp_servers(namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> MCPServerListResponse:
    """
    List all MCPServer CRs in a namespace.
    
    Args:
        namespace: The namespace to list MCP servers from
        
    Returns:
        MCPServerListResponse: List of all MCP servers in the namespace
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        mcp_servers = await ark_client.mcpservers.a_list()
        
        mcp_server_list = []
        for mcp_server in mcp_servers:
            mcp_server_list.append(mcp_server_to_response(mcp_server.to_dict()))
        
        return MCPServerListResponse(
            items=mcp_server_list,
            total=len(mcp_server_list)
        )


@router.post("", response_model=MCPServerDetailResponse, include_in_schema=True)
@handle_k8s_errors(operation="create", resource_type="mcp server")
async def create_mcp_server(body: MCPServerCreateRequest, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> MCPServerDetailResponse:
    """
    Create a new MCPServer CR.
    
    Args:
        namespace: The namespace to create the MCP server in
        body: The MCP server creation request
        
    Returns:
        MCPServerDetailResponse: The created MCP server details
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        # Build the MCP server spec
        mcp_server_spec = body.spec.model_dump(exclude_none=True)
        # Create the MCPServerV1alpha1 object
        mcp_server_resource = MCPServerV1alpha1(
            metadata={
                "name": body.name,
                "namespace": namespace,
                "labels": body.labels,
                "annotations": body.annotations
            },
            spec=MCPServerV1alpha1Spec(**mcp_server_spec)
        )
        
        created_mcp_server = await ark_client.mcpservers.a_create(mcp_server_resource)
        return mcp_server_to_detail_response(created_mcp_server.to_dict())


@router.get("/{mcp_server_name}", response_model=MCPServerDetailResponse)
@handle_k8s_errors(operation="get", resource_type="mcp server")
async def get_mcp_server(mcp_server_name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> MCPServerDetailResponse:
    """
    Get a specific MCPServer CR by name.
    
    Args:
        namespace: The namespace to get the MCP server from
        mcp_server_name: The name of the MCP server
        
    Returns:
        MCPServerDetailResponse: The MCP server details
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        mcp_server = await ark_client.mcpservers.a_get(mcp_server_name)
        
        return mcp_server_to_detail_response(mcp_server.to_dict())


@router.put("/{mcp_server_name}", response_model=MCPServerDetailResponse, include_in_schema=False)
@handle_k8s_errors(operation="update", resource_type="mcp server")
async def update_mcp_server(mcp_server_name: str, body: MCPServerUpdateRequest, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> MCPServerDetailResponse:
    """
    Update a MCPServer CR by name.
    
    Args:
        namespace: The namespace containing the MCP server
        mcp_server_name: The name of the MCP server
        body: The MCP server update request
        
    Returns:
        MCPServerDetailResponse: The updated MCP server details
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        # Get the existing MCP server first
        existing_mcp_server = await ark_client.mcpservers.a_get(mcp_server_name)
        existing_dict = existing_mcp_server.to_dict()
        
        # Update metadata if provided
        if body.labels is not None:
            existing_dict["metadata"]["labels"] = body.labels
        if body.annotations is not None:
            existing_dict["metadata"]["annotations"] = body.annotations
            
        # Update spec if provided
        if body.spec is not None:
            existing_dict["spec"] = body.spec.model_dump(exclude_none=True)
        
        # Update the MCP server
        updated_resource = MCPServerV1alpha1(**existing_dict)
        
        updated_mcp_server = await ark_client.mcpservers.a_update(updated_resource)
        
        return mcp_server_to_detail_response(updated_mcp_server.to_dict())


@router.delete("/{mcp_server_name}", status_code=204)
@handle_k8s_errors(operation="delete", resource_type="mcp server")
async def delete_mcp_server(mcp_server_name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> None:
    """
    Delete a MCPServer CR by name.
    
    Args:
        namespace: The namespace containing the MCP server
        mcp_server_name: The name of the MCP server
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        await ark_client.mcpservers.a_delete(mcp_server_name)
