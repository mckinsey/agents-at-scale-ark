"""Common exception handlers for Kubernetes API operations."""
import json
import logging
from functools import wraps
from typing import Callable, Any

from fastapi import HTTPException
from kubernetes_asyncio.client.rest import ApiException
from kubernetes.client.exceptions import ApiException as SyncApiException

logger = logging.getLogger(__name__)


def _extract_error_detail(exception: ApiException | SyncApiException) -> str:
    """
    Extract detailed error message from Kubernetes ApiException.
    
    Tries to parse the JSON body to get a detailed message, falls back to reason.
    """
    error_detail = exception.reason
    if exception.body:
        try:
            body_json = json.loads(exception.body)
            if body_json.get("message"):
                error_detail = body_json["message"]
        except (json.JSONDecodeError, AttributeError):
            pass
    return error_detail


def handle_k8s_errors(
    operation: str = "operation",
    resource_type: str = "resource"
) -> Callable:
    """
    Decorator to handle common Kubernetes API errors.
    
    Args:
        operation: Description of the operation being performed (e.g., "list", "get", "create")
        resource_type: Type of resource being operated on (e.g., "secret", "namespace")
        
    Returns:
        Decorated function with standardized error handling
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            try:
                return await func(*args, **kwargs)
            except (ApiException, SyncApiException) as e:
                # Build context for error messages
                namespace = kwargs.get("namespace", "")
                resource_name = kwargs.get(f"{resource_type}_name", "")
                
                # Create detailed error context
                if resource_name and namespace:
                    context = f"{resource_type} '{resource_name}' in namespace {namespace}"
                elif namespace:
                    context = f"{resource_type}s in namespace {namespace}"
                elif resource_name:
                    context = f"{resource_type} '{resource_name}'"
                else:
                    context = resource_type
                
                # Log the error
                logger.error(f"Failed to {operation} {context}: {e}")
                
                # Handle specific status codes
                if e.status == 404:
                    # For list operations, 404 usually means namespace not found
                    if operation == "list" and namespace:
                        raise HTTPException(
                            status_code=404,
                            detail=f"Kubernetes API error: {e.reason}"
                        )
                    # For single resource operations, it's the resource that's not found
                    detail = f"{resource_type.title()} "
                    if resource_name:
                        detail += f"'{resource_name}' "
                    detail += "not found"
                    if namespace:
                        detail += f" in namespace {namespace}"
                    raise HTTPException(status_code=404, detail=detail)
                
                elif e.status == 409:
                    detail = f"{resource_type.title()} "
                    if resource_name:
                        detail += f"'{resource_name}' "
                    detail += "already exists"
                    if namespace:
                        detail += f" in namespace {namespace}"
                    raise HTTPException(status_code=409, detail=detail)
                
                elif e.status == 422:
                    raise HTTPException(status_code=422, detail=_extract_error_detail(e))
                
                elif e.status == 403:
                    raise HTTPException(status_code=403, detail=_extract_error_detail(e))
                
                raise HTTPException(
                    status_code=e.status,
                    detail=_extract_error_detail(e)
                )
                
            except HTTPException:
                # Re-raise HTTP exceptions as-is
                raise
                
            except Exception as e:
                logger.error(f"Unexpected error during {operation} {resource_type}: {e}")
                logger.exception("Full traceback:")

                original_exception = e.__cause__ or e.__context__
                if isinstance(original_exception, (ApiException, SyncApiException)):
                    if original_exception.status == 422:
                        raise HTTPException(status_code=422, detail=_extract_error_detail(original_exception))
                    elif original_exception.status == 403:
                        raise HTTPException(status_code=403, detail=_extract_error_detail(original_exception))
                
                raise HTTPException(
                    status_code=500,
                    detail="Internal server error"
                )
                
        return wrapper
    return decorator