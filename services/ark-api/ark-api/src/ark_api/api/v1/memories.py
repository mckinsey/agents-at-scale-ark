"""Kubernetes memories API endpoints."""
import logging
from typing import Optional

from fastapi import APIRouter, Query
from ark_sdk.models.memory_v1alpha1 import MemoryV1alpha1

from ark_sdk.client import with_ark_client

from ...models.memories import (
    MemoryResponse,
    MemoryListResponse,
    MemoryCreateRequest,
    MemoryUpdateRequest,
    MemoryDetailResponse
)
from ...models.conversations import MemoryMessageResponse, MemoryMessageListResponse
from ...utils.memory_client import (
    get_memory_service_address,
    fetch_memory_service_data,
    get_all_memory_resources
)
from .exceptions import handle_k8s_errors

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/memories", tags=["memories"])

# CRD configuration
VERSION = "v1alpha1"


def memory_to_response(memory) -> MemoryResponse:
    """Convert a Kubernetes Memory CR to a response model."""
    # Handle both dict and SDK model objects
    if hasattr(memory, 'to_dict'):
        memory_dict = memory.to_dict()
    else:
        memory_dict = memory
    
    metadata = memory_dict.get("metadata", {})
    spec = memory_dict.get("spec", {})
    status = memory_dict.get("status", {})
    
    return MemoryResponse(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        description=spec.get("description"),
        status=status.get("phase")
    )


def memory_to_detail_response(memory) -> MemoryDetailResponse:
    """Convert a Kubernetes Memory CR to a detailed response model."""
    # Handle both dict and SDK model objects
    if hasattr(memory, 'to_dict'):
        memory_dict = memory.to_dict()
    else:
        memory_dict = memory
    
    metadata = memory_dict.get("metadata", {})
    spec = memory_dict.get("spec", {})
    status = memory_dict.get("status", {})
    
    return MemoryDetailResponse(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        description=spec.get("description"),
        config=spec.get("config"),
        status=status
    )


@router.get("", response_model=MemoryListResponse)
@handle_k8s_errors(operation="list", resource_type="memory")
async def list_memories(namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> MemoryListResponse:
    """List all memories in a namespace."""
    async with with_ark_client(namespace, VERSION) as client:
        memories = await client.memories.a_list()
        
        memory_responses = [memory_to_response(memory.to_dict()) for memory in memories]
        return MemoryListResponse(items=memory_responses)


@router.get("/{name}", response_model=MemoryDetailResponse)
@handle_k8s_errors(operation="get", resource_type="memory")
async def get_memory(name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> MemoryDetailResponse:
    """Get a specific memory by name."""
    async with with_ark_client(namespace, VERSION) as client:
        memory = await client.memories.a_get(name)
        return memory_to_detail_response(memory.to_dict())


@router.post("", response_model=MemoryDetailResponse)
@handle_k8s_errors(operation="create", resource_type="memory")
async def create_memory(memory_request: MemoryCreateRequest, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> MemoryDetailResponse:
    """Create a new memory."""
    async with with_ark_client(namespace, VERSION) as client:
        memory_obj = MemoryV1alpha1(
            metadata={"name": memory_request.name, "namespace": namespace},
            spec={
                "description": memory_request.description,
                "config": memory_request.config or {}
            }
        )
        
        created_memory = await client.memories.a_create(memory_obj)
        return memory_to_detail_response(created_memory.to_dict())


@router.put("/{name}", response_model=MemoryDetailResponse)
@handle_k8s_errors(operation="update", resource_type="memory")
async def update_memory(name: str, memory_request: MemoryUpdateRequest, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> MemoryDetailResponse:
    """Update an existing memory."""
    async with with_ark_client(namespace, VERSION) as client:
        # Get existing memory
        existing_memory = await client.memories.a_get(name)
        existing_dict = existing_memory.to_dict()
        
        # Update spec fields
        spec = existing_dict.get("spec", {})
        if memory_request.description is not None:
            spec["description"] = memory_request.description
        if memory_request.config is not None:
            spec["config"] = memory_request.config
        
        # Create updated memory object
        memory_obj = MemoryV1alpha1(
            metadata=existing_dict["metadata"],
            spec=spec
        )
        
        updated_memory = await client.memories.a_update(memory_obj)
        return memory_to_detail_response(updated_memory.to_dict())


@router.delete("/{name}")
@handle_k8s_errors(operation="delete", resource_type="memory")
async def delete_memory(name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> dict:
    """Delete a memory."""
    async with with_ark_client(namespace, VERSION) as client:
        await client.memories.a_delete(name)
        return {"message": f"Memory {name} deleted successfully"}


@router.get("/{name}/conversations/{conversation_id}/messages")
@handle_k8s_errors(operation="get", resource_type="memory")
async def get_memory_messages(name: str, conversation_id: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> dict:
    """Get messages for a specific conversation from a memory resource."""
    async with with_ark_client(namespace, VERSION) as client:
        memory = await client.memories.a_get(name)
        memory_dict = memory.to_dict()

        service_url = get_memory_service_address(memory_dict)

        return await fetch_memory_service_data(
            service_url,
            "/messages",
            params={"conversation_id": conversation_id},
            memory_name=name
        )


# Add this as a separate router to avoid conflicts with existing prefix
memory_messages_router = APIRouter(prefix="/memory-messages", tags=["memory-messages"])


@memory_messages_router.get("", response_model=MemoryMessageListResponse)
@handle_k8s_errors(operation="list", resource_type="memory-messages")
async def list_memory_messages(
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)"),
    memory: Optional[str] = Query(None, description="Filter by memory name"),
    conversation: Optional[str] = Query(None, description="Filter by conversation ID"),
    query: Optional[str] = Query(None, description="Filter by query ID")
) -> MemoryMessageListResponse:
    """List all memory messages with context, optionally filtered."""
    async with with_ark_client(namespace, VERSION) as client:
        memory_dicts = await get_all_memory_resources(client, memory)
        
        all_messages = []
        
        for memory_dict in memory_dicts:
            memory_name = memory_dict.get("metadata", {}).get("name", "")
            
            try:
                service_url = get_memory_service_address(memory_dict)
                
                # Build query parameters
                params = {}
                if conversation:
                    params["conversation_id"] = conversation
                if query:
                    params["query_id"] = query
                
                data = await fetch_memory_service_data(
                    service_url,
                    "/messages",
                    params=params,
                    memory_name=memory_name
                )
                
                messages = data.get("messages", [])
                
                # Convert each database record to response format
                for msg_record in messages:
                    all_messages.append(MemoryMessageResponse(
                        timestamp=msg_record.get("timestamp"),
                        memoryName=memory_name,
                        conversationId=msg_record.get("conversation_id"),
                        queryId=msg_record.get("query_id"),
                        message=msg_record.get("message"),
                        sequence=msg_record.get("sequence")
                    ))
            
            except Exception as e:
                logger.error(f"Failed to get messages from memory {memory_name}: {e}")
                # Continue processing other memories
                continue
        
        # Sort by sequence number descending (newest first) to maintain proper chronological order
        # This ensures messages appear in the correct order regardless of timestamp precision
        all_messages.sort(key=lambda x: x.sequence or 0, reverse=True)
        
        return MemoryMessageListResponse(
            items=all_messages,
            total=len(all_messages)
        )