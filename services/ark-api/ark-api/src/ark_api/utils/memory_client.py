"""Shared memory service client utilities."""
import logging
from typing import Optional, Dict, Any
import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)


def get_memory_service_address(memory_dict: Dict[str, Any]) -> str:
    """
    Get the memory service address from a memory resource.
    
    Args:
        memory_dict: Memory resource dictionary
        
    Returns:
        Service URL string
        
    Raises:
        HTTPException: If memory service is not ready or has no address
    """
    status = memory_dict.get("status", {})
    service_url = status.get("lastResolvedAddress")
    
    if not service_url:
        memory_name = memory_dict.get("metadata", {}).get("name", "unknown")
        raise HTTPException(
            status_code=503,
            detail=f"Memory service {memory_name} is not ready or has no resolved address"
        )
    
    return service_url.rstrip("/")


async def fetch_memory_service_data(
    service_url: str, 
    endpoint: str, 
    params: Optional[Dict[str, str]] = None,
    memory_name: str = "unknown"
) -> Dict[str, Any]:
    """
    Fetch data from a memory service endpoint.
    
    Args:
        service_url: Base URL of the memory service
        endpoint: API endpoint path (e.g., "/messages", "/sessions")
        params: Optional query parameters
        memory_name: Memory name for error reporting
        
    Returns:
        JSON response data
        
    Raises:
        HTTPException: For various HTTP errors
    """
    url = f"{service_url}{endpoint}"
    
    try:
        async with httpx.AsyncClient() as http_client:
            response = await http_client.get(url, params=params, timeout=30.0)
            
            if response.status_code == 404:
                raise HTTPException(
                    status_code=404, 
                    detail=f"Resource not found in memory service {memory_name}"
                )
            elif not response.is_success:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Memory service {memory_name} error: {response.text}"
                )
            
            return response.json()
            
    except httpx.RequestError as e:
        logger.error(f"Error connecting to memory service {memory_name}: {e}")
        raise HTTPException(
            status_code=503,
            detail=f"Failed to connect to memory service {memory_name}: {str(e)}"
        )


async def get_all_memory_resources(client, memory_filter: Optional[str] = None):
    """
    Get all memory resources, optionally filtered by name.
    
    Args:
        client: ARK client instance
        memory_filter: Optional memory name filter
        
    Returns:
        List of memory resource dictionaries
    """
    memories = await client.memories.a_list()
    
    if memory_filter:
        memories = [
            m for m in memories 
            if m.to_dict().get("metadata", {}).get("name") == memory_filter
        ]
    
    return [memory.to_dict() for memory in memories]