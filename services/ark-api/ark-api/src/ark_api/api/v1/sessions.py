"""Sessions API endpoints."""
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query

from ark_sdk.client import with_ark_client

from ...models.sessions import SessionResponse, SessionListResponse
from ...utils.memory_client import (
    get_memory_service_address,
    fetch_memory_service_data,
    get_all_memory_resources
)
from .exceptions import handle_k8s_errors

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/sessions", tags=["sessions"])

# CRD configuration
VERSION = "v1alpha1"


@router.get("", response_model=SessionListResponse)
@handle_k8s_errors(operation="list", resource_type="sessions")
async def list_sessions(
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)"),
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


@router.delete("/{session_id}")
@handle_k8s_errors(operation="delete", resource_type="session")
async def delete_session(
    session_id: str,
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")
) -> dict:
    """Delete a specific session and all its messages."""
    async with with_ark_client(namespace, VERSION) as client:
        memory_dicts = await get_all_memory_resources(client)
        
        deleted_count = 0
        found_404 = False
        network_failures = []
        
        for memory_dict in memory_dicts:
            memory_name = memory_dict.get("metadata", {}).get("name", "")
            
            try:
                service_url = get_memory_service_address(memory_dict)
                
                # Make DELETE request to memory service
                async with httpx.AsyncClient() as http_client:
                    response = await http_client.delete(
                        f"{service_url}/sessions/{session_id}",
                        timeout=30.0
                    )
                    
                    if response.status_code == 200:
                        deleted_count += 1
                    elif response.status_code == 404:
                        found_404 = True
                        logger.debug(f"Session {session_id} not found in memory {memory_name}")
                    elif response.status_code == 500:
                        raise HTTPException(
                            status_code=500,
                            detail=f"Failed to delete session {session_id} from database"
                        )
                        
            except HTTPException:
                # Re-raise HTTP exceptions (our 500 errors)
                raise
            except Exception as e:
                # Network/connection errors - track but continue processing
                error_msg = f"Failed to delete session {session_id} from memory {memory_name}: {e}"
                logger.error(error_msg)
                network_failures.append(error_msg)
        
        # If no deletions succeeded, determine appropriate error
        if deleted_count == 0:
            if found_404:
                # Session not found in any reachable service
                raise HTTPException(
                    status_code=404,
                    detail=f"Session {session_id} not found"
                )
            elif network_failures:
                # All services unreachable
                raise HTTPException(
                    status_code=503,
                    detail=f"Unable to delete session {session_id}: all memory services unreachable"
                )
            else:
                # No memory services configured
                raise HTTPException(
                    status_code=404,
                    detail=f"Session {session_id} not found"
                )
        
        return {"message": f"Session {session_id} deleted from {deleted_count} memory service(s)"}


@router.delete("")
@handle_k8s_errors(operation="delete", resource_type="sessions")
async def delete_all_sessions(
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")
) -> dict:
    """Delete all sessions and their messages."""
    async with with_ark_client(namespace, VERSION) as client:
        memory_dicts = await get_all_memory_resources(client)
        
        deleted_count = 0
        
        for memory_dict in memory_dicts:
            memory_name = memory_dict.get("metadata", {}).get("name", "")
            
            try:
                service_url = get_memory_service_address(memory_dict)
                
                # Make DELETE request to memory service
                async with httpx.AsyncClient() as http_client:
                    response = await http_client.delete(
                        f"{service_url}/sessions",
                        timeout=30.0
                    )
                    
                    if response.status_code == 200:
                        deleted_count += 1
                    elif response.status_code == 500:
                        # Database deletion failed - throw 500
                        raise HTTPException(
                            status_code=500,
                            detail="Failed to delete all sessions from database"
                        )
                    # Idempotent deletion: non-500 errors don't fail because the goal (sessions removed or inaccessible) is achieved
                        
            except HTTPException:
                # Re-raise HTTP exceptions (our 500 errors)
                raise
            except Exception as e:
                # Network/connection errors - log but don't throw exception
                logger.error(f"Failed to delete all sessions from memory {memory_name}: {e}")
        
        return {"message": f"All sessions deleted successfully from {deleted_count} memory services"}


@router.delete("/{session_id}/queries/{query_id}/messages")
@handle_k8s_errors(operation="delete", resource_type="query_messages")
async def delete_query_messages(
    session_id: str,
    query_id: str,
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")
) -> dict:
    """Delete messages for a specific query within a session."""
    async with with_ark_client(namespace, VERSION) as client:
        memory_dicts = await get_all_memory_resources(client)
        
        deleted_count = 0
        
        for memory_dict in memory_dicts:
            memory_name = memory_dict.get("metadata", {}).get("name", "")
            
            try:
                service_url = get_memory_service_address(memory_dict)
                
                # Make DELETE request to memory service
                async with httpx.AsyncClient() as http_client:
                    response = await http_client.delete(
                        f"{service_url}/sessions/{session_id}/queries/{query_id}/messages",
                        timeout=30.0
                    )
                    
                    if response.status_code == 200:
                        deleted_count += 1
                    elif response.status_code == 500:
                        # Database deletion failed - throw 500
                        raise HTTPException(
                            status_code=500,
                            detail=f"Failed to delete query {query_id} messages from database"
                        )
                    # Idempotent deletion: non-500 errors don't fail because the goal (messages removed or inaccessible) is achieved
                        
            except HTTPException:
                # Re-raise HTTP exceptions (our 500 errors)
                raise
            except Exception as e:
                # Network/connection errors - log but don't throw exception
                logger.error(f"Failed to delete query {query_id} messages from session {session_id} in memory {memory_name}: {e}")
        
        return {"message": f"Query {query_id} messages deleted successfully from session {session_id}"}