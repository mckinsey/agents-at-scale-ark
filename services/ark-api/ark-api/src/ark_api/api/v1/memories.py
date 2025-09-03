"""Kubernetes memories API endpoints."""
import logging
import httpx
from typing import Optional
from collections import defaultdict

from fastapi import APIRouter, HTTPException, Query
from ark_sdk.models.memory_v1alpha1 import MemoryV1alpha1

from ark_sdk.client import with_ark_client

from ...models.memories import (
    MemoryResponse,
    MemoryListResponse,
    MemoryCreateRequest,
    MemoryUpdateRequest,
    MemoryDetailResponse
)
from ...models.sessions import MemoryMessageResponse, MemoryMessageListResponse
from .exceptions import handle_k8s_errors

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/namespaces/{namespace}/memories", tags=["memories"])

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
async def list_memories(namespace: str) -> MemoryListResponse:
    """List all memories in a namespace."""
    async with with_ark_client(namespace, VERSION) as client:
        memories = await client.memories.a_list()
        
        memory_responses = [memory_to_response(memory.to_dict()) for memory in memories]
        return MemoryListResponse(items=memory_responses)


@router.get("/{name}", response_model=MemoryDetailResponse)
@handle_k8s_errors(operation="get", resource_type="memory")
async def get_memory(namespace: str, name: str) -> MemoryDetailResponse:
    """Get a specific memory by name."""
    async with with_ark_client(namespace, VERSION) as client:
        memory = await client.memories.a_get(name)
        return memory_to_detail_response(memory.to_dict())


@router.post("", response_model=MemoryDetailResponse)
@handle_k8s_errors(operation="create", resource_type="memory")
async def create_memory(namespace: str, memory_request: MemoryCreateRequest) -> MemoryDetailResponse:
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
async def update_memory(namespace: str, name: str, memory_request: MemoryUpdateRequest) -> MemoryDetailResponse:
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
async def delete_memory(namespace: str, name: str) -> dict:
    """Delete a memory."""
    async with with_ark_client(namespace, VERSION) as client:
        await client.memories.a_delete(name)
        return {"message": f"Memory {name} deleted successfully"}


@router.get("/{name}/sessions/{session_id}/messages")
@handle_k8s_errors(operation="get", resource_type="memory")
async def get_memory_messages(namespace: str, name: str, session_id: str) -> dict:
    """Get messages for a specific session from a memory resource."""
    async with with_ark_client(namespace, VERSION) as client:
        # First get the memory resource to find its service endpoint
        try:
            memory = await client.memories.a_get(name)
            memory_dict = memory.to_dict()
            
            # Get the resolved address from the memory status
            status = memory_dict.get("status", {})
            service_url = status.get("lastResolvedAddress")
            
            if not service_url:
                raise HTTPException(
                    status_code=503,
                    detail=f"Memory service {name} is not ready or has no resolved address"
                )
            
            # Proxy the request to the memory service
            messages_url = f"{service_url}/messages/{session_id}"
            
            async with httpx.AsyncClient() as http_client:
                response = await http_client.get(messages_url, timeout=30.0)
                
                if response.status_code == 404:
                    raise HTTPException(status_code=404, detail=f"Session {session_id} not found in memory {name}")
                elif not response.is_success:
                    raise HTTPException(
                        status_code=response.status_code,
                        detail=f"Memory service error: {response.text}"
                    )
                
                return response.json()
                
        except httpx.RequestError as e:
            logger.error(f"Error connecting to memory service: {e}")
            raise HTTPException(
                status_code=503,
                detail=f"Failed to connect to memory service: {str(e)}"
            )


# Add this as a separate router to avoid conflicts with existing prefix
memory_messages_router = APIRouter(prefix="/namespaces/{namespace}", tags=["memory-messages"])


@memory_messages_router.get("/memory-messages", response_model=MemoryMessageListResponse)
@handle_k8s_errors(operation="list", resource_type="memory-messages")
async def list_memory_messages(
    namespace: str,
    memory: Optional[str] = Query(None, description="Filter by memory name"),
    session: Optional[str] = Query(None, description="Filter by session ID"),
    query: Optional[str] = Query(None, description="Filter by query ID")
) -> MemoryMessageListResponse:
    """List all memory messages with context, optionally filtered."""
    async with with_ark_client(namespace, VERSION) as client:
        # Get all queries to find sessions and their memory mappings
        queries = await client.queries.a_list()
        
        # Group queries by memory and session for efficient lookups
        query_mappings = {}  # queryId -> {memoryName, sessionId, timestamp}
        session_queries = defaultdict(list)  # sessionId -> [queryIds]
        
        for query in queries:
            query_dict = query.to_dict()
            spec = query_dict.get("spec", {})
            metadata = query_dict.get("metadata", {})
            
            # Skip queries without memory or sessionId
            memory_config = spec.get("memory")
            session_id = spec.get("sessionId")
            
            if not memory_config or not session_id:
                continue
                
            memory_name = memory_config.get("name")
            query_name = metadata.get("name", "")
            creation_timestamp = metadata.get("creationTimestamp")
            
            if not memory_name or not query_name:
                continue
                
            # Apply filters early
            if memory and memory_name != memory:
                continue
            if session and session_id != session:
                continue
            if query and query_name != query:
                continue
                
            query_mappings[query_name] = {
                "memoryName": memory_name,
                "sessionId": session_id,
                "timestamp": creation_timestamp
            }
            session_queries[session_id].append(query_name)
        
        if not query_mappings:
            return MemoryMessageListResponse(items=[], total=0)
        
        # Get all memory resources to find service endpoints
        memories = await client.memories.a_list()
        memory_services = {}  # memoryName -> serviceUrl
        
        for memory_obj in memories:
            memory_dict = memory_obj.to_dict()
            metadata = memory_dict.get("metadata", {})
            status = memory_dict.get("status", {})
            
            memory_name = metadata.get("name", "")
            service_url = status.get("lastResolvedAddress")
            
            if memory_name and service_url:
                memory_services[memory_name] = service_url
        
        # Collect all messages
        all_messages = []
        
        # Group by unique memory/session combinations to avoid duplicate API calls
        session_combinations = set()
        for query_name, mapping in query_mappings.items():
            session_combinations.add((mapping["memoryName"], mapping["sessionId"]))
        
        for memory_name, session_id in session_combinations:
            service_url = memory_services.get(memory_name)
            if not service_url:
                logger.warning(f"No service URL found for memory {memory_name}")
                continue
            
            try:
                # Get messages for this session
                messages_url = f"{service_url}/messages/{session_id}"
                
                async with httpx.AsyncClient() as http_client:
                    response = await http_client.get(messages_url, timeout=30.0)
                    
                    if response.status_code == 404:
                        # Session not found, skip
                        continue
                    elif not response.is_success:
                        logger.error(f"Memory service error for {memory_name}/{session_id}: {response.text}")
                        continue
                    
                    data = response.json()
                    messages = data.get("messages", [])
                    
                    # Find the first query for this session (for timestamp)
                    session_query_ids = session_queries.get(session_id, [])
                    first_query_id = session_query_ids[0] if session_query_ids else None
                    query_timestamp = None
                    
                    if first_query_id and first_query_id in query_mappings:
                        query_timestamp = query_mappings[first_query_id]["timestamp"]
                    
                    # Add each message with context
                    for message in messages:
                        all_messages.append(MemoryMessageResponse(
                            timestamp=query_timestamp,
                            memoryName=memory_name,
                            sessionId=session_id,
                            queryId=first_query_id,  # We don't have per-message query mapping
                            message=message
                        ))
            
            except httpx.RequestError as e:
                logger.error(f"Error connecting to memory service {memory_name}: {e}")
                continue
        
        # Sort by timestamp descending (most recent first)
        all_messages.sort(key=lambda x: x.timestamp or "", reverse=True)
        
        return MemoryMessageListResponse(
            items=all_messages,
            total=len(all_messages)
        )