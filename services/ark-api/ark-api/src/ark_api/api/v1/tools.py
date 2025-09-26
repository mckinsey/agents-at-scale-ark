"""Kubernetes tools API endpoints."""
import logging

from fastapi import APIRouter, Query
from typing import Optional
from ark_sdk.models.tool_v1alpha1 import ToolV1alpha1
from ark_sdk.models.tool_v1alpha1_spec import ToolV1alpha1Spec

from ark_sdk.client import with_ark_client

from ...models.tools import (
    ToolResponse,
    ToolListResponse,
    ToolCreateRequest,
    ToolUpdateRequest,
    ToolDetailResponse
)
from .exceptions import handle_k8s_errors

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/tools", tags=["tools"])

# CRD configuration
VERSION = "v1alpha1"

def tool_to_response(tool: dict) -> ToolResponse:
    """Convert a Kubernetes Tool CR to a response model."""
    metadata = tool.get("metadata", {})
    spec = tool.get("spec", {})
    
    return ToolResponse(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        description=spec.get("description"),
        labels=metadata.get("labels"),
        annotations=metadata.get("annotations"),
        type=spec.get("type")
    )


def tool_to_detail_response(tool: dict) -> ToolDetailResponse:
    """Convert a Kubernetes Tool CR to a detailed response model."""
    metadata = tool.get("metadata", {})
    spec = tool.get("spec", {})
    status = tool.get("status", {})
    
    return ToolDetailResponse(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        description=spec.get("description"),
        labels=metadata.get("labels"),
        annotations=metadata.get("annotations"),
        spec=spec,
        status=status
    )


@router.get("", response_model=ToolListResponse)
@handle_k8s_errors(operation="list", resource_type="tool")
async def list_tools(namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> ToolListResponse:
    """
    List all Tool CRs in a namespace.
    
    Args:
        namespace: The namespace to list tools from
        
    Returns:
        ToolListResponse: List of all tools in the namespace
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        tools = await ark_client.tools.a_list()
        
        tool_list = []
        for tool in tools:
            tool_list.append(tool_to_response(tool.to_dict()))
        
        return ToolListResponse(
            items=tool_list,
            total=len(tool_list)
        )


@router.post("", response_model=ToolDetailResponse, include_in_schema=False)
@handle_k8s_errors(operation="create", resource_type="tool")
async def create_tool(body: ToolCreateRequest, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> ToolDetailResponse:
    """
    Create a new Tool CR.
    
    Args:
        namespace: The namespace to create the tool in
        body: The tool creation request
        
    Returns:
        ToolDetailResponse: The created tool details
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        # Build the tool spec
        tool_spec = body.spec.model_dump(by_alias=True, exclude_none=True)
        
        # Create the ToolV1alpha1 object
        tool_resource = ToolV1alpha1(
            metadata={
                "name": body.name,
                "namespace": namespace,
                "labels": body.labels,
                "annotations": body.annotations
            },
            spec=ToolV1alpha1Spec(**tool_spec)
        )
        
        created_tool = await ark_client.tools.a_create(tool_resource)
        
        return tool_to_detail_response(created_tool.to_dict())


@router.get("/{tool_name}", response_model=ToolDetailResponse)
@handle_k8s_errors(operation="get", resource_type="tool")
async def get_tool(tool_name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> ToolDetailResponse:
    """
    Get a specific Tool CR by name.
    
    Args:
        namespace: The namespace to get the tool from
        tool_name: The name of the tool
        
    Returns:
        ToolDetailResponse: The tool details
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        tool = await ark_client.tools.a_get(tool_name)
        
        return tool_to_detail_response(tool.to_dict())


@router.put("/{tool_name}", response_model=ToolDetailResponse, include_in_schema=False)
@handle_k8s_errors(operation="update", resource_type="tool")
async def update_tool(tool_name: str, body: ToolUpdateRequest, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> ToolDetailResponse:
    """
    Update a Tool CR by name.
    
    Args:
        namespace: The namespace containing the tool
        tool_name: The name of the tool
        body: The tool update request
        
    Returns:
        ToolDetailResponse: The updated tool details
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        # Get the existing tool first
        existing_tool = await ark_client.tools.a_get(tool_name)
        existing_dict = existing_tool.to_dict()
        
        # Update metadata if provided
        if body.labels is not None:
            existing_dict["metadata"]["labels"] = body.labels
        if body.annotations is not None:
            existing_dict["metadata"]["annotations"] = body.annotations
            
        # Update spec if provided
        if body.spec is not None:
            existing_dict["spec"] = body.spec.model_dump(by_alias=True, exclude_none=True)
        
        # Update the tool
        updated_resource = ToolV1alpha1(**existing_dict)
        
        updated_tool = await ark_client.tools.a_update(updated_resource)
        
        return tool_to_detail_response(updated_tool.to_dict())


@router.delete("/{tool_name}", status_code=204)
@handle_k8s_errors(operation="delete", resource_type="tool")
async def delete_tool(tool_name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> None:
    """
    Delete a Tool CR by name.
    
    Args:
        namespace: The namespace containing the tool
        tool_name: The name of the tool
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        await ark_client.tools.a_delete(tool_name)
