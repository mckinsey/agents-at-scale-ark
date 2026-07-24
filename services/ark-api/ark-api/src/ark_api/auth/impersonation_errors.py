import logging
from typing import Optional

from fastapi.responses import JSONResponse
from kubernetes.client.exceptions import ApiException as SyncApiException
from kubernetes_asyncio.client.rest import ApiException

from ark_sdk.impersonation import ImpersonationConfig

logger = logging.getLogger(__name__)


def build_impersonation_forbidden_response(
    exception: ApiException | SyncApiException,
    impersonation: Optional[ImpersonationConfig],
    resource_type: str = "resource",
    operation: str = "operation",
    namespace: str = "",
) -> Optional[JSONResponse]:
    if impersonation is None or exception.status != 403:
        return None

    detail = (
        f"User '{impersonation.username}' does not have permission to {operation} "
        f"{resource_type} in namespace '{namespace}'. "
        f"A cluster administrator needs to create a RoleBinding granting access."
    )

    body = {
        "error": "impersonation_forbidden",
        "detail": detail,
        "user": impersonation.username,
        "resource": resource_type,
        "namespace": namespace,
        "action": operation,
    }

    logger.warning(
        f"Impersonation RBAC denied: user={impersonation.username} "
        f"action={operation} resource={resource_type} namespace={namespace}"
    )

    return JSONResponse(status_code=403, content=body)
