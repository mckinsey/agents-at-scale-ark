"""Common exception handlers for Kubernetes API operations."""
import json
import logging
from functools import wraps
from typing import Callable, Any, Optional

from fastapi import HTTPException
from kubernetes_asyncio.client.rest import ApiException
from kubernetes_asyncio.dynamic.exceptions import ResourceNotFoundError
from kubernetes.client.exceptions import ApiException as SyncApiException

from ark_sdk.impersonation import ImpersonationConfig

from ...auth.impersonation_config import ImpersonationSettings
from ...auth.impersonation_errors import build_impersonation_forbidden_response

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


def _extract_error_reason(exception: ApiException | SyncApiException) -> str | None:
    if not exception.body:
        return None
    try:
        return json.loads(exception.body).get("reason")
    except (json.JSONDecodeError, AttributeError):
        return None


def _is_admission_denial(exception: ApiException | SyncApiException) -> bool:
    detail = _extract_error_detail(exception) or ""
    return detail.startswith("admission webhook ") and "denied the request" in detail


def _rbac_impersonation(
    exception: ApiException | SyncApiException,
    impersonation: Optional[ImpersonationConfig],
) -> Optional[ImpersonationConfig]:
    if _is_admission_denial(exception):
        return None
    return impersonation


def _error_context(resource_type: str, resource_name: str, namespace: str) -> str:
    if resource_name and namespace:
        return f"{resource_type} '{resource_name}' in namespace {namespace}"
    if namespace:
        return f"{resource_type}s in namespace {namespace}"
    if resource_name:
        return f"{resource_type} '{resource_name}'"
    return resource_type


def _not_found_detail(
    exception: ApiException | SyncApiException,
    operation: str,
    resource_type: str,
    resource_name: str,
    namespace: str,
) -> str:
    if operation == "list" and namespace:
        return f"Kubernetes API error: {exception.reason}"
    detail = f"{resource_type.title()} "
    if resource_name:
        detail += f"'{resource_name}' "
    detail += "not found"
    if namespace:
        detail += f" in namespace {namespace}"
    return detail


def _conflict_detail(
    exception: ApiException | SyncApiException,
    resource_type: str,
    resource_name: str,
    namespace: str,
) -> str:
    detail = resource_type.title()
    if resource_name:
        detail += f" '{resource_name}'"
    in_namespace = f" in namespace {namespace}" if namespace else ""
    if _extract_error_reason(exception) == "Conflict":
        return f"{detail}{in_namespace} was modified by another request; reload it and try again"
    return f"{detail} already exists{in_namespace}"


async def _handle_forbidden(
    exception: ApiException | SyncApiException,
    func: Callable,
    args: tuple,
    kwargs: dict,
    operation: str,
    resource_type: str,
    impersonation_fallback: bool,
) -> Any:
    impersonation = _rbac_impersonation(exception, kwargs.get("impersonation"))
    if impersonation is None:
        raise HTTPException(status_code=403, detail=_extract_error_detail(exception))

    namespace = kwargs.get("namespace", "")
    settings = ImpersonationSettings.from_env()
    if settings.fallback and impersonation_fallback:
        logger.warning(
            f"Impersonation fallback: user={impersonation.username} "
            f"action={operation} resource={resource_type} namespace={namespace}"
        )
        kwargs["impersonation"] = None
        response = await func(*args, **kwargs)
        if hasattr(response, "headers"):
            response.headers["X-Ark-Impersonation-Fallback"] = "true"
        return response

    imp_response = build_impersonation_forbidden_response(
        exception, impersonation, resource_type, operation, namespace
    )
    if imp_response is not None:
        return imp_response
    raise HTTPException(status_code=403, detail=_extract_error_detail(exception))


def _unexpected_error(exception: Exception) -> HTTPException:
    original_exception = exception.__cause__ or exception.__context__
    if isinstance(original_exception, (ApiException, SyncApiException)) and original_exception.status in (403, 422):
        return HTTPException(
            status_code=original_exception.status,
            detail=_extract_error_detail(original_exception),
        )
    return HTTPException(status_code=500, detail="Internal server error")


def handle_k8s_errors(
    operation: str = "operation",
    resource_type: str = "resource",
    impersonation_fallback: bool = True,
) -> Callable:
    """
    Decorator to handle common Kubernetes API errors.
    
    Args:
        operation: Description of the operation being performed (e.g., "list", "get", "create")
        resource_type: Type of resource being operated on (e.g., "secret", "namespace")
        impersonation_fallback: Whether IMPERSONATION_FALLBACK may retry a denied
            impersonated call as the service account
        
    Returns:
        Decorated function with standardized error handling
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            try:
                return await func(*args, **kwargs)
            except (ApiException, SyncApiException) as e:
                namespace = kwargs.get("namespace", "")
                resource_name = kwargs.get(f"{resource_type}_name", "")
                context = _error_context(resource_type, resource_name, namespace)
                logger.error(f"Failed to {operation} {context}: {e}")

                if e.status == 404:
                    raise HTTPException(
                        status_code=404,
                        detail=_not_found_detail(e, operation, resource_type, resource_name, namespace),
                    )
                if e.status == 409:
                    raise HTTPException(
                        status_code=409,
                        detail=_conflict_detail(e, resource_type, resource_name, namespace),
                    )
                if e.status == 403:
                    return await _handle_forbidden(
                        e, func, args, kwargs, operation, resource_type, impersonation_fallback
                    )
                raise HTTPException(status_code=e.status, detail=_extract_error_detail(e))

            except ResourceNotFoundError as e:
                kind = kwargs.get("kind", resource_type)
                logger.error(f"Failed to {operation} {resource_type}: resource type '{kind}' not available in cluster: {e}")
                raise HTTPException(
                    status_code=404,
                    detail=f"Resource type '{kind}' is not available in the cluster (CRD not installed)"
                )

            except HTTPException:
                raise

            except Exception as e:
                logger.error(f"Unexpected error during {operation} {resource_type}: {e}")
                logger.exception("Full traceback:")
                raise _unexpected_error(e)

        return wrapper
    return decorator
