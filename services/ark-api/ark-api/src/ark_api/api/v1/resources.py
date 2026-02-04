"""Generic Kubernetes resources API endpoints."""
import logging
import yaml

from fastapi import APIRouter, Query, Request, Response
from fastapi.responses import JSONResponse
from typing import Optional
from kubernetes_asyncio.client.api_client import ApiClient
from kubernetes_asyncio.dynamic import DynamicClient
from ark_sdk.k8s import get_context

from .exceptions import handle_k8s_errors

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/resources", tags=["resources"])


def _create_resource_response(data: dict, request: Request) -> Response:
    accept_header = request.headers.get("accept", "application/json")

    if "application/yaml" in accept_header or "text/yaml" in accept_header:
        yaml_content = yaml.safe_dump(data, default_flow_style=False, sort_keys=False)
        return Response(content=yaml_content, media_type="application/yaml")

    return JSONResponse(content=data)


@router.get("/api/{version}/{kind}/{resource_name}")
@handle_k8s_errors(operation="get", resource_type="resource")
async def get_core_resource(
    request: Request,
    version: str,
    kind: str,
    resource_name: str,
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")
) -> Response:
    """
    Get a core Kubernetes resource by name.

    Args:
        version: API version (e.g., 'v1')
        kind: Kubernetes Kind (e.g., 'Pod', 'Service', 'ConfigMap')
        resource_name: The name of the resource
        namespace: The namespace (defaults to current context)

    Returns:
        Response: The raw Kubernetes resource as JSON

    Examples:
        - GET /v1/resources/api/v1/Pod/my-pod
        - GET /v1/resources/api/v1/Service/my-service
    """
    if namespace is None:
        namespace = get_context()["namespace"]

    async with ApiClient() as api:
        dynamic_client = await DynamicClient(api)

        api_resource = await dynamic_client.resources.get(
            api_version=version,
            kind=kind
        )

        resource = await api_resource.get(name=resource_name, namespace=namespace)

        return _create_resource_response(resource.to_dict(), request)


@router.get("/api/{version}/{kind}")
@handle_k8s_errors(operation="list", resource_type="resource")
async def list_core_resources(
    request: Request,
    version: str,
    kind: str,
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")
) -> Response:
    """
    List core Kubernetes resources.

    Args:
        version: API version (e.g., 'v1')
        kind: Kubernetes Kind (e.g., 'Pod', 'Service', 'ConfigMap')
        namespace: The namespace (defaults to current context)

    Returns:
        Response: List of raw Kubernetes resources as JSON

    Examples:
        - GET /v1/resources/api/v1/Pod
        - GET /v1/resources/api/v1/Service
    """
    if namespace is None:
        namespace = get_context()["namespace"]

    async with ApiClient() as api:
        dynamic_client = await DynamicClient(api)

        api_resource = await dynamic_client.resources.get(
            api_version=version,
            kind=kind
        )

        resources = await api_resource.get(namespace=namespace)

        return _create_resource_response(resources.to_dict(), request)


@router.get("/apis/{group}/{version}/{kind}/{resource_name}")
@handle_k8s_errors(operation="get", resource_type="resource")
async def get_grouped_resource(
    request: Request,
    group: str,
    version: str,
    kind: str,
    resource_name: str,
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")
) -> Response:
    """
    Get a grouped Kubernetes resource by name.

    Args:
        group: API group (e.g., 'apps', 'batch', 'ark.mckinsey.com')
        version: API version (e.g., 'v1', 'v1alpha1')
        kind: Kubernetes Kind (e.g., 'Deployment', 'Job', 'WorkflowTemplate')
        resource_name: The name of the resource
        namespace: The namespace (defaults to current context)

    Returns:
        Response: The raw Kubernetes resource as JSON

    Examples:
        - GET /v1/resources/apis/apps/v1/Deployment/my-deployment
        - GET /v1/resources/apis/batch/v1/Job/my-job
        - GET /v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate/sparkly-bear
    """
    if namespace is None:
        namespace = get_context()["namespace"]

    api_version = f"{group}/{version}"
    logger.info(f"Getting resource: api_version={api_version}, kind={kind}, name={resource_name}, namespace={namespace}")

    async with ApiClient() as api:
        dynamic_client = await DynamicClient(api)

        api_resource = await dynamic_client.resources.get(
            api_version=api_version,
            kind=kind
        )

        resource = await api_resource.get(name=resource_name, namespace=namespace)

        return _create_resource_response(resource.to_dict(), request)


@router.get("/apis/{group}/{version}/{kind}")
@handle_k8s_errors(operation="list", resource_type="resource")
async def list_grouped_resources(
    request: Request,
    group: str,
    version: str,
    kind: str,
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")
) -> Response:
    """
    List grouped Kubernetes resources.

    Args:
        group: API group (e.g., 'apps', 'batch', 'ark.mckinsey.com')
        version: API version (e.g., 'v1', 'v1alpha1')
        kind: Kubernetes Kind (e.g., 'Deployment', 'Job', 'WorkflowTemplate')
        namespace: The namespace (defaults to current context)

    Returns:
        Response: List of raw Kubernetes resources as JSON

    Examples:
        - GET /v1/resources/apis/apps/v1/Deployment
        - GET /v1/resources/apis/batch/v1/Job
        - GET /v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate
    """
    if namespace is None:
        namespace = get_context()["namespace"]

    api_version = f"{group}/{version}"

    async with ApiClient() as api:
        dynamic_client = await DynamicClient(api)

        api_resource = await dynamic_client.resources.get(
            api_version=api_version,
            kind=kind
        )

        resources = await api_resource.get(namespace=namespace)

        return _create_resource_response(resources.to_dict(), request)
