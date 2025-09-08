"""Sessions API endpoints."""
import logging
from typing import Optional

from fastapi import APIRouter, Query

from ark_sdk.client import with_ark_client

from ...models.sessions import SessionResponse, SessionListResponse
from ...utils.memory_client import (
    get_memory_service_address,
    fetch_memory_service_data,
    get_all_memory_resources
)
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
        memory_dicts = await get_all_memory_resources(client, memory)
        
        all_sessions = []
        
        for memory_dict in memory_dicts:
            memory_name = memory_dict.get("metadata", {}).get("name", "")
            
            try:
                service_url = get_memory_service_address(memory_dict)
                
                data = await fetch_memory_service_data(
                    service_url,
                    "/sessions", 
                    memory_name=memory_name
                )
                
                sessions = data.get("sessions", [])
                
                # Handle null sessions (empty database)
                if sessions is None:
                    sessions = []
                
                # Convert to our response format - only include actual data
                for session_id in sessions:
                    all_sessions.append(SessionResponse(
                        sessionId=session_id,
                        memoryName=memory_name
                    ))
                        
            except Exception as e:
                logger.error(f"Failed to get sessions from memory {memory_name}: {e}")
                # Continue processing other memories
                continue
        
        return SessionListResponse(
            items=all_sessions,
            total=len(all_sessions)
        )