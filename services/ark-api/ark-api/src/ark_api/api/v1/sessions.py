"""Sessions API endpoints."""
import logging
from typing import Optional
from collections import defaultdict

from fastapi import APIRouter, Query

from ark_sdk.client import with_ark_client

from ...models.sessions import SessionResponse, SessionListResponse
from .exceptions import handle_k8s_errors

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/namespaces/{namespace}/sessions", tags=["sessions"])

# CRD configuration
VERSION = "v1alpha1"


@router.get("", response_model=SessionListResponse)
@handle_k8s_errors(operation="list", resource_type="sessions")
async def list_sessions(
    namespace: str,
    memory: Optional[str] = Query(None, description="Filter by memory name")
) -> SessionListResponse:
    """List all sessions in a namespace, optionally filtered by memory."""
    async with with_ark_client(namespace, VERSION) as client:
        # Get all queries to find sessions
        queries = await client.queries.a_list()
        
        # Group queries by session and memory
        sessions_data = defaultdict(lambda: {
            "memoryName": "",
            "queries": [],
            "lastActivity": None
        })
        
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
            if not memory_name:
                continue
                
            # Apply memory filter if specified
            if memory and memory_name != memory:
                continue
                
            query_name = metadata.get("name", "")
            creation_timestamp = metadata.get("creationTimestamp")
            
            key = f"{memory_name}:{session_id}"
            sessions_data[key]["memoryName"] = memory_name
            sessions_data[key]["queries"].append(query_name)
            
            # Track latest activity timestamp
            if creation_timestamp and (
                not sessions_data[key]["lastActivity"] or 
                creation_timestamp > sessions_data[key]["lastActivity"]
            ):
                sessions_data[key]["lastActivity"] = creation_timestamp
        
        # Convert to response format
        session_responses = []
        for session_key, data in sessions_data.items():
            _, session_id = session_key.split(":", 1)
            
            session_responses.append(SessionResponse(
                sessionId=session_id,
                memoryName=data["memoryName"],
                queries=sorted(data["queries"]),  # Sort for consistent ordering
                messageCount=0,  # We don't have message count easily available
                lastActivity=data["lastActivity"]
            ))
        
        # Sort by lastActivity descending (most recent first)
        session_responses.sort(key=lambda x: x.lastActivity or "", reverse=True)
        
        return SessionListResponse(
            items=session_responses,
            total=len(session_responses)
        )