"""Sessions API endpoints."""
import logging
from typing import Optional
import httpx

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
        # Get memory resources to find their addresses
        memories = await client.memories.a_list()
        
        all_sessions = []
        
        for memory_resource in memories:
            memory_dict = memory_resource.to_dict()
            memory_name = memory_dict.get("metadata", {}).get("name", "")
            
            # Apply memory filter if specified
            if memory and memory_name != memory:
                continue
                
            # Get memory service address
            spec = memory_dict.get("spec", {})
            address = spec.get("address", {}).get("value", "")
            
            if not address:
                continue
                
            try:
                # Call memory service sessions endpoint
                async with httpx.AsyncClient() as http_client:
                    response = await http_client.get(
                        f"{address}/sessions",
                        timeout=10.0
                    )
                    response.raise_for_status()
                    
                    data = response.json()
                    sessions = data.get("sessions", [])
                    
                    # Handle null sessions (empty database)
                    if sessions is None:
                        sessions = []
                    
                    # Convert to our response format
                    for session_id in sessions:
                        all_sessions.append(SessionResponse(
                            sessionId=session_id,
                            memoryName=memory_name,
                            queries=[],  # We don't track queries in memory service
                            messageCount=0,  # Not provided by simple endpoint
                            lastActivity=None  # Not provided by simple endpoint
                        ))
                        
            except Exception as e:
                logger.warning(f"Failed to get sessions from memory {memory_name}: {e}")
                continue
        
        return SessionListResponse(
            items=all_sessions,
            total=len(all_sessions)
        )